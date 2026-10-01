import { useCallback, useEffect, useState, type ReactNode } from "react";
import { apiOrigin } from "./partnerApi";
import { PIKI_RELEASE } from "./release-meta";
import { shouldShowPushConsent } from "./pushConsentPolicy";

/* oxlint-disable react/set-state-in-effect -- effects reconcile release policy and browser notification state. */

type ReleasePolicy = {
  surface?: unknown;
  version?: unknown;
  minimumVersion?: unknown;
  buildId?: unknown;
  forceUpdate?: unknown;
  updateRequired?: unknown;
};

type GateState = "checking" | "ready" | "required" | "error";
type ValidPolicy = {
  surface: string;
  version?: unknown;
  minimumVersion: string;
  buildId: string;
  forceUpdate: boolean;
  updateRequired?: unknown;
};

function versionParts(value: string): number[] | null {
  const match = value.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  return match ? match.slice(1, 4).map(Number) : null;
}

function isNewer(candidate: string, current: string): boolean {
  const left = versionParts(candidate);
  const right = versionParts(current);
  if (!left || !right) return false;
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index];
  }
  return false;
}

function isValidPolicy(value: ReleasePolicy): value is ValidPolicy {
  return value.surface === PIKI_RELEASE.surface
    && typeof value.minimumVersion === "string"
    && versionParts(value.minimumVersion) !== null
    && typeof value.buildId === "string"
    && typeof value.forceUpdate === "boolean";
}

async function registerWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
    try { await registration.update(); } catch { /* a stale worker must not block partner operations */ }
    return registration;
  } catch {
    return null;
  }
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
  const [requiredVersion, setRequiredVersion] = useState("");
  const [detail, setDetail] = useState("");
  const [updating, setUpdating] = useState(false);

  const check = useCallback(async () => {
    try {
      await registerWorker();
      const policy = await fetchPolicy();
      if (!isValidPolicy(policy)) throw new Error("La política de versión no es válida.");
      // A policy from an older API deployment must never lock out a newer web client.
      // Semantic minimumVersion is the compatibility contract; a differing build ID alone
      // is not enough to block an active restaurant from receiving orders.
      const requiresUpdate = policy.forceUpdate
        && isNewer(policy.minimumVersion, PIKI_RELEASE.version);
      if (requiresUpdate) {
        setRequiredVersion(`${String(policy.version || policy.minimumVersion)} · ${policy.buildId}`);
        setState("required");
      } else {
        setState("ready");
      }
    } catch (error) {
      setDetail(error instanceof Error ? error.message : "No se pudo comprobar la versión.");
      setState("error");
    }
  }, []);

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
    setUpdating(true);
    try {
      const registration = await registerWorker();
      registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
      const url = new URL(window.location.href);
      url.searchParams.set("piki_update", String(Date.now()));
      window.location.replace(url.toString());
    } catch (error) {
      setUpdating(false);
      setDetail(error instanceof Error ? error.message : "No se pudo descargar la actualización.");
    }
  };

  if (state === "checking") return <main className="auth-page"><p>Comprobando la versión segura de PIKI…</p></main>;
  if (state === "required") return <main className="auth-page"><section className="orders-login-card">
    <p className="section-kicker">ACTUALIZACIÓN OBLIGATORIA</p>
    <h2>Actualiza para continuar</h2>
    <p>Esta versión no puede utilizarse. Descargaremos la versión {requiredVersion} y recargaremos la aplicación.</p>
    {detail && <p className="login-error">{detail}</p>}
    <button type="button" className="login-submit" onClick={() => void update()} disabled={updating}>{updating ? "Actualizando…" : "Actualizar ahora"}</button>
  </section></main>;

  return <>
    {state === "error" && <div className="release-warning" role="status">No se ha podido comprobar la versión: {detail}</div>}
    {children}
    <PushConsentControl />
  </>;
}
