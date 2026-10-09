import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { apiOrigin } from "./partnerApi";
import { getPwaUpdateDecision, isValidReleasePolicy, shouldReloadAfterControllerChange, type ReleasePolicy } from "./pwaUpdatePolicy";
import { isPwaUpdateSafe, subscribeToPwaUpdateSafety } from "./pwaUpdateRuntime";
import { PIKI_RELEASE } from "./release-meta";
import { shouldShowPushConsent } from "./pushConsentPolicy";

/* oxlint-disable react/set-state-in-effect -- effects reconcile release policy and browser notification state. */

type GateState = "checking" | "ready" | "required" | "error";
type AvailableUpdate = { version: string; buildId: string; required: boolean };
const reloadKey = (buildId: string) => `piki-partner-pwa-reload:${buildId}`;

async function registerWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
    try { await registration.update(); } catch { /* A stale worker must not block partner operations. */ }
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
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

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
    <strong>Pedidos al instante</strong>
    <p>Activa avisos para no perder pedidos nuevos en este dispositivo.</p>
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

  const reloadAfterWorkerChange = useCallback((buildId: string) => {
    if (!navigator.onLine || !isPwaUpdateSafe()) return false;
    const key = reloadKey(buildId);
    if (sessionStorage.getItem(key)) return false;

    sessionStorage.setItem(key, "1");
    const url = new URL(window.location.href);
    url.searchParams.set("piki_update", buildId);
    window.location.replace(url.toString());
    return true;
  }, []);

  const activateWaitingWorkerIfSafe = useCallback(() => {
    if (!isPwaUpdateSafe() || !navigator.onLine) return;
    const waiting = registrationRef.current?.waiting || waitingWorkerRef.current;
    if (!waiting) return;
    waitingWorkerRef.current = null;
    waiting.postMessage({ type: "SKIP_WAITING" });
  }, []);

  const settleControllerChange = useCallback(() => {
    if (!controllerChangedRef.current || !isPwaUpdateSafe()) return;
    controllerChangedRef.current = false;
    reloadAfterWorkerChange(availableUpdate?.buildId || "worker");
  }, [availableUpdate?.buildId, reloadAfterWorkerChange]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return undefined;
    const onControllerChange = () => {
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

  const check = useCallback(async () => {
    try {
      const registration = await registerWorker();
      registrationRef.current = registration;
      if (registration) {
        const onWaiting = (worker: ServiceWorker | null) => {
          waitingWorkerRef.current = worker;
          activateWaitingWorkerIfSafe();
        };
        registration.addEventListener("updatefound", () => {
          watchWaitingWorker(registration, onWaiting);
        }, { once: true });
        watchWaitingWorker(registration, onWaiting);
      }
      const policy = await fetchPolicy();
      if (!isValidReleasePolicy(policy, PIKI_RELEASE.surface)) throw new Error("La política de versión no es válida.");

      const decision = getPwaUpdateDecision(policy, PIKI_RELEASE);
      const nextUpdate = decision.updateAvailable
        ? { version: decision.targetVersion, buildId: decision.targetBuildId, required: decision.required }
        : null;
      pendingRequiredRef.current = decision.required ? nextUpdate : null;
      setAvailableUpdate(nextUpdate);
      setDetail("");

      if (decision.required && isPwaUpdateSafe()) setState("required");
      else setState("ready");
    } catch (error) {
      setDetail(error instanceof Error ? error.message : "No se pudo comprobar la versión.");
      setState("error");
    }
  }, [activateWaitingWorkerIfSafe]);

  useEffect(() => {
    void check();
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => void check(), 5 * 60_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [check]);

  const update = async () => {
    if (!isPwaUpdateSafe()) {
      setDetail("La nueva versión PWA está preparada. Termina la operación o el formulario en curso para actualizar sin perder datos.");
      return;
    }
    if (!navigator.onLine) {
      setDetail("No hay conexión. Conservamos la sesión y los datos actuales; vuelve a intentarlo cuando recuperes señal.");
      return;
    }

    setUpdating(true);
    setDetail("");
    try {
      const registration = await registerWorker();
      if (!registration) throw new Error("No se pudo iniciar la actualización PWA en este navegador.");
      registrationRef.current = registration;
      watchWaitingWorker(registration, (worker) => {
        waitingWorkerRef.current = worker;
        activateWaitingWorkerIfSafe();
      });

      // If a worker was already active, update() has completed with the latest
      // script. A single cache-busted navigation recovers a previously stale
      // app shell; a waiting worker instead reloads on controllerchange.
      if (!registration.waiting && !registration.installing) {
        reloadAfterWorkerChange(availableUpdate?.buildId || "manual");
      }
    } catch (error) {
      setDetail(error instanceof Error ? error.message : "No se pudo descargar la actualización PWA.");
      setUpdating(false);
    }
  };

  if (state === "checking") return <main className="auth-page"><p>Comprobando la versión PWA de PIKI…</p></main>;
  if (state === "required") return <main className="auth-page"><section className="orders-login-card">
    <p className="section-kicker">ACTUALIZACIÓN PWA NECESARIA</p>
    <h2>Actualiza para continuar</h2>
    <p>Esta versión PWA ya no es compatible. Descargaremos la versión {availableUpdate?.version || "más reciente"} · {availableUpdate?.buildId || "nuevo build"} y recargaremos una sola vez.</p>
    {detail && <p className="login-error">{detail}</p>}
    <button type="button" className="login-submit" onClick={() => void update()} disabled={updating}>{updating ? "Actualizando PWA…" : "Actualizar PWA"}</button>
  </section></main>;

  return <>
    {state === "error" && <div className="release-warning" role="status">No se ha podido comprobar la versión PWA: {detail}. Conservamos tu sesión y los datos actuales.</div>}
    {state !== "error" && availableUpdate && <div className="release-warning" role="status">
      <span>Nueva versión PWA disponible: {availableUpdate.version} · {availableUpdate.buildId}.</span>
      {availableUpdate.required ? <span> Se actualizará al terminar la operación en curso.</span> : <button type="button" className="link-button" onClick={() => void update()} disabled={updating}>{updating ? "Actualizando PWA…" : "Actualizar PWA"}</button>}
      {detail && <span> {detail}</span>}
    </div>}
    {children}
    <PushConsentControl />
  </>;
}
