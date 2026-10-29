import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { apiOrigin } from "./partnerApi";
import { isValidReleasePolicy, shouldReloadAfterControllerChange, type ReleasePolicy } from "./pwaUpdatePolicy";
import { isPwaUpdateSafe, subscribeToPwaUpdateSafety } from "./pwaUpdateRuntime";
import { PIKI_RELEASE } from "./release-meta";
import { shouldShowPushConsent } from "./pushConsentPolicy";
import { apiRequiresPikiSecurityUpdate, fetchPikiStaticRelease, getPikiWebTarget, shouldCheckPikiVersion, waitForPikiControllerChange, waitForPikiWaitingWorker } from "./pikiPwaUpdate";

/* oxlint-disable react/set-state-in-effect -- effects reconcile release policy and browser notification state. */

type GateState = "checking" | "ready" | "required" | "error";
type AvailableUpdate = { version: string; buildId: string; required: boolean };
const reloadKey = (buildId: string) => `piki-partner-pwa-reload:${buildId}`;
const nativeApp = Capacitor.isNativePlatform();

async function registerWorker(): Promise<ServiceWorkerRegistration | null> {
  if (nativeApp) return null;
  if (!("serviceWorker" in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
    return registration;
  } catch {
    return null;
  }
}

function watchWaitingWorker(registration: ServiceWorkerRegistration, onWaiting: (worker: ServiceWorker | null) => void): void {
  const installing = registration.installing;
  if (!installing) {
    onWaiting(registration.waiting);
    return;
  }
  installing.addEventListener("statechange", () => {
    if (installing.state === "installed") onWaiting(registration.waiting);
  }, { once: true });
}

async function fetchPolicy(): Promise<ReleasePolicy> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8_000);
  try {
    const query = new URLSearchParams({
      surface: PIKI_RELEASE.surface,
      clientVersion: PIKI_RELEASE.version,
      clientBuildId: PIKI_RELEASE.buildId,
    });
    const response = await fetch(`${apiOrigin}/api/v1/app-version?${query}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`VERSION_CHECK_${response.status}`);
    return await response.json() as ReleasePolicy;
  } finally {
    window.clearTimeout(timeout);
  }
}

function storedEmployeeToken(): string | null {
  const key = `piki-${location.hostname}-api-token`;
  return sessionStorage.getItem(key) || localStorage.getItem(key);
}

function base64UrlToUint8Array(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function syncPushSubscription(promptPermission: boolean): Promise<void> {
  if (nativeApp) throw new Error("Los avisos nativos se registran con la aplicación firmada; esta PWA no esperará un Service Worker.");
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    throw new Error("Este navegador no admite notificaciones push.");
  }

  const configResponse = await fetch(`${apiOrigin}/api/v1/push/config`, { cache: "no-store" });
  if (!configResponse.ok) throw new Error("La configuración de avisos no está disponible.");
  const config = await configResponse.json() as { enabled?: boolean; vapidPublicKey?: string };
  if (!config.enabled || !config.vapidPublicKey) throw new Error("Los avisos todavía no están habilitados.");

  const permission = promptPermission ? await Notification.requestPermission() : Notification.permission;
  if (permission !== "granted") throw new Error("No se concedió permiso para mostrar avisos.");

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription()
    ?? await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(config.vapidPublicKey).buffer as ArrayBuffer,
    });

  const token = storedEmployeeToken();
  const response = await fetch(`${apiOrigin}/api/v1/push/subscriptions`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-PIKI-Surface": PIKI_RELEASE.surface,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
  if (!response.ok) throw new Error("No se pudo guardar este dispositivo.");
}

function PushConsentControl() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  const [authEpoch, setAuthEpoch] = useState(0);
  const supported = !nativeApp && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

  useEffect(() => {
    const wake = () => setAuthEpoch((value) => value + 1);
    window.addEventListener("piki-authenticated", wake);
    return () => window.removeEventListener("piki-authenticated", wake);
  }, []);

  useEffect(() => {
    if (!supported) return;
    const permission = Notification.permission;
    const show = shouldShowPushConsent({
      supported,
      authenticated: Boolean(storedEmployeeToken()),
      permission,
    });
    setVisible(show);
    if (permission === "granted" && storedEmployeeToken()) void syncPushSubscription(false).catch(() => undefined);
  }, [authEpoch, supported]);

  const enable = async () => {
    setBusy(true);
    setMessage("");
    try {
      await syncPushSubscription(true);
      setVisible(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudieron activar avisos.");
    } finally {
      setBusy(false);
    }
  };

  if (!supported || !visible) return null;
  return <aside className="push-consent" aria-live="polite">
    <button type="button" onClick={() => setVisible(false)} aria-label="Cerrar aviso">×</button>
    <strong>Avisos del navegador</strong>
    <p>Si PIKI ha habilitado avisos para este dispositivo, puedes activarlos. El tablero se sincroniza por SSE mientras permanece abierto.</p>
    <button type="button" onClick={() => void enable()} disabled={busy}>{busy ? "Activando…" : "Activar avisos"}</button>
    {message && <p>{message}</p>}
  </aside>;
}

export function PikiReleaseGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>("checking");
  const [detail, setDetail] = useState("");
  const [updating, setUpdating] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null);
  const pendingRequiredRef = useRef<AvailableUpdate | null>(null);
  const hadControllerRef = useRef("serviceWorker" in navigator && Boolean(navigator.serviceWorker.controller));
  const controllerChangedRef = useRef(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);
  const lastCheckAtRef = useRef(0);
  const checkInFlightRef = useRef<Promise<void> | null>(null);
  const [nativeSecurityUpdate, setNativeSecurityUpdate] = useState(false);
  const manualActivationRequestedRef = useRef(false);

  const reloadAfterWorkerChange = useCallback((buildId: string, manualRetry = false) => {
    if (!manualActivationRequestedRef.current || !navigator.onLine || !isPwaUpdateSafe()) return false;
    const key = reloadKey(buildId);
    if (!manualRetry && sessionStorage.getItem(key)) return false;

    sessionStorage.setItem(key, "1");
    // The new worker already owns the page. Reload the current URL directly;
    // adding piki_update creates a new history/cache key and can re-enter the
    // release gate with the same stale bundle when deployments are staggered.
    window.location.reload();
    return true;
  }, []);

  const activateWaitingWorkerIfSafe = useCallback(() => {
    if (!manualActivationRequestedRef.current) return;
    if (!isPwaUpdateSafe() || !navigator.onLine) return;
    const waiting = registrationRef.current?.waiting || waitingWorkerRef.current;
    if (!waiting) return;
    waitingWorkerRef.current = null;
    waiting.postMessage({ type: "SKIP_WAITING" });
  }, []);

  const settleControllerChange = useCallback(() => {
    if (!controllerChangedRef.current || !isPwaUpdateSafe()) return;
    controllerChangedRef.current = false;
    reloadAfterWorkerChange(availableUpdate?.buildId || "worker", true);
  }, [availableUpdate?.buildId, reloadAfterWorkerChange]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return undefined;
    const onControllerChange = () => {
      if (!manualActivationRequestedRef.current) return;
      const wasControlled = hadControllerRef.current;
      hadControllerRef.current = true;
      // A first install takes control without replacing an existing app. It must
      // never trigger a reload, otherwise an offline install can loop forever.
      if (!wasControlled) return;
      const alreadyReloadedForBuild = Boolean(sessionStorage.getItem(reloadKey(availableUpdate?.buildId || "worker")));
      if (alreadyReloadedForBuild) return;
      controllerChangedRef.current = true;
      if (!shouldReloadAfterControllerChange({
        hadController: wasControlled,
        isSafeToReload: isPwaUpdateSafe(),
        alreadyReloadedForBuild,
      })) return;
      settleControllerChange();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, [availableUpdate?.buildId, settleControllerChange]);

  useEffect(() => subscribeToPwaUpdateSafety(() => {
    const pendingRequired = pendingRequiredRef.current;
    if (pendingRequired && isPwaUpdateSafe()) setState("required");
    activateWaitingWorkerIfSafe();
    settleControllerChange();
  }), [activateWaitingWorkerIfSafe, settleControllerChange]);

  const check = useCallback(async (reason: "initial" | "focus" | "visible" | "interval" | "manual") => {
    if (!shouldCheckPikiVersion({ now: Date.now(), lastCheckedAt: lastCheckAtRef.current, visible: document.visibilityState === "visible", reason, needsDeferredActivation: Boolean(pendingRequiredRef.current) })) return;
    if (checkInFlightRef.current) return checkInFlightRef.current;
    const work = (async () => {
      lastCheckAtRef.current = Date.now();
      try {
        const policy = await fetchPolicy();
        if (!isValidReleasePolicy(policy, PIKI_RELEASE.surface)) throw new Error("La política de versión no es válida.");
        const securityRequired = apiRequiresPikiSecurityUpdate(policy, PIKI_RELEASE);
        if (nativeApp) {
          pendingRequiredRef.current = null;
          setAvailableUpdate(securityRequired ? { version: String(policy.version), buildId: String(policy.buildId), required: true } : null);
          setNativeSecurityUpdate(securityRequired);
          setState(securityRequired ? "required" : "ready");
          return;
        }
        const release = await fetchPikiStaticRelease(window.fetch.bind(window), window.location.origin, PIKI_RELEASE.surface);
        const target = getPikiWebTarget(release, PIKI_RELEASE);
        const nextUpdate = target ? { version: target.version, buildId: target.buildId, required: securityRequired } : null;
        pendingRequiredRef.current = securityRequired ? nextUpdate : null;
        setAvailableUpdate(nextUpdate);
        setNativeSecurityUpdate(false);
        setDetail("");
        if (securityRequired && isPwaUpdateSafe()) setState("required");
        else setState("ready");
        if (target) {
          const registration = await registerWorker();
          registrationRef.current = registration;
          if (registration) watchWaitingWorker(registration, (worker) => { waitingWorkerRef.current = worker; });
        }
      } catch (error) {
        setDetail(error instanceof Error ? error.message : "No se pudo comprobar la versión.");
        setState("error");
      }
    })();
    checkInFlightRef.current = work;
    try { await work; } finally { checkInFlightRef.current = null; }
  }, []);

  useEffect(() => {
    if (nativeApp) {
      void check("initial");
      return;
    }
    void check("initial");
    const onFocus = () => void check("focus");
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => void check("interval"), 5 * 60_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [check]);

  const update = async () => {
    if (nativeApp) return;
    const target = availableUpdate;
    if (!target || target.buildId === PIKI_RELEASE.buildId) {
      setDetail("No se ha confirmado un nuevo build desde release.json de esta web. No se recargó la aplicación.");
      return;
    }
    if (!isPwaUpdateSafe()) {
      setDetail("La nueva versión PWA está preparada. Termina la operación o el formulario en curso para actualizar sin perder datos.");
      return;
    }
    if (!navigator.onLine) {
      setDetail("No hay conexión. Conservamos la sesión y los datos actuales; vuelve a intentarlo cuando recuperes señal.");
      return;
    }

    manualActivationRequestedRef.current = true;
    setUpdating(true);
    setDetail("");
    try {
      const target = availableUpdate;
      if (!target || target.buildId === PIKI_RELEASE.buildId) {
        setDetail("No se ha confirmado un nuevo build desde release.json de esta web. No se recargó la aplicación.");
        setUpdating(false);
        return;
      }
      const registration = await registerWorker();
      if (!registration) throw new Error("No se pudo iniciar la actualización PWA en este navegador.");
      registrationRef.current = registration;
      await Promise.race([registration.update().catch(() => undefined), new Promise<void>((resolve) => window.setTimeout(resolve, 8_000))]);
      const waiting = await waitForPikiWaitingWorker(registration, 8_000);
      manualActivationRequestedRef.current = true;
      if (!waiting) {
        reloadAfterWorkerChange(target.buildId, true);
        return;
      }
      const previousController = navigator.serviceWorker.controller;
      const changed = waitForPikiControllerChange(navigator.serviceWorker, previousController, 8_000);
      waiting.postMessage({ type: "SKIP_WAITING" });
      if (await changed) reloadAfterWorkerChange(target.buildId, true);
      else reloadAfterWorkerChange(target.buildId, true);
    } catch (error) {
      setDetail(error instanceof Error ? error.message : "No se pudo descargar la actualización PWA.");
      setUpdating(false);
    }
  };

  if (state === "checking") return <main className="auth-page"><p>Comprobando la versión PWA de PIKI…</p></main>;
  if (state === "required") return <main className="auth-page"><section className="orders-login-card">
    <p className="section-kicker">ACTUALIZACIÓN PWA NECESARIA</p>
    <h2>Actualiza para continuar</h2>
    <p>{nativeSecurityUpdate ? `Instala la versión firmada ${availableUpdate?.version || "requerida"} desde el canal autorizado por PIKI o Google Play si es el canal configurado. Los recursos embebidos no se actualizan desde una PWA.` : `Esta versión PWA ya no es compatible. Descargaremos la versión ${availableUpdate?.version || "más reciente"} · ${availableUpdate?.buildId || "nuevo build"} y recargaremos una sola vez.`}</p>
    {detail && <p className="login-error">{detail}</p>}
    {!nativeSecurityUpdate && <button type="button" className="login-submit" onClick={() => void update()} disabled={updating}>{updating ? "Actualizando PWA…" : "Actualizar PWA"}</button>}
  </section></main>;

  return <>

    {state !== "error" && availableUpdate && <div className="release-warning" role="status">
      <span>Nueva versión PWA disponible: {availableUpdate.version} · {availableUpdate.buildId}.</span>
      {availableUpdate.required ? <span> Se actualizará al terminar la operación en curso.</span> : <button type="button" className="link-button" onClick={() => void update()} disabled={updating}>{updating ? "Actualizando PWA…" : "Actualizar PWA"}</button>}
      {detail && <span> {detail}</span>}
    </div>}
    {children}
    <PushConsentControl />
  </>;
}
