import { useRef, useState } from "react";
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { PIKI_RELEASE } from "./release-meta";
import { probePartnerConnection, sanitizePartnerDiagnosticText } from "./partnerConnectionDiagnostics";
import type { PartnerConnectionDependencies, PartnerConnectionResult } from "./partnerConnectionDiagnostics";

export type PartnerConnectionCheckProps = {
  apiOrigin: string;
  disabled?: boolean;
  /** Optional current web fetch wrapper (release headers only; never Authorization). */
  fetchImpl?: typeof globalThis.fetch;
};

export function PartnerConnectionCheck({ apiOrigin, disabled = false, fetchImpl }: PartnerConnectionCheckProps) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PartnerConnectionResult | null>(null);
  const locked = useRef(false);
  const [environment, setEnvironment] = useState<{ origin: string; online: boolean | undefined } | null>(null);

  const check = async () => {
    if (disabled || locked.current) return;
    locked.current = true;
    setRunning(true);
    setResult(null);
    setEnvironment({ origin: typeof window === "undefined" ? "No disponible" : window.location.origin, online: typeof navigator === "undefined" ? undefined : navigator.onLine });
    const dependencies: PartnerConnectionDependencies = {
      isNativePlatform: () => Capacitor.isNativePlatform(),
      getPlatform: () => Capacitor.getPlatform(),
      isNativeHttpAvailable: () => Capacitor.isPluginAvailable("CapacitorHttp") && typeof CapacitorHttp.get === "function",
      nativeGet: (options) => CapacitorHttp.get(options),
      fetch: fetchImpl || ((input, init) => globalThis.fetch(input, init)),
      now: () => Date.now(),
    };
    try { setResult(await probePartnerConnection(apiOrigin, dependencies)); }
    finally { locked.current = false; setRunning(false); }
  };

  return <div>
    <button type="button" className="link-button login-help" disabled={disabled || running} onClick={() => void check()} aria-label="Comprobar conexión con PIKI">{running ? "Comprobando conexión…" : "Comprobar conexión"}</button>
    {running && <p className="login-success" role="status">Comprobando únicamente GET /ready; no se envía tu contraseña.</p>}
    {result && <div className={result.ok ? "login-success" : "login-error"} role={result.ok ? "status" : "alert"} aria-label="Resultado de conexión PIKI" style={{ fontSize: 11, overflowWrap: "anywhere", wordBreak: "break-word", whiteSpace: "normal" }}>
      <strong>{result.ok ? "Conexión confirmada" : "No se ha confirmado la conexión"}</strong>
      <div>Versión PIKI: {PIKI_RELEASE.version}</div>
      <div>Plataforma: {sanitizePartnerDiagnosticText(result.platform)}</div>
      <div>Origen aplicación: {sanitizePartnerDiagnosticText(environment?.origin)}</div>
      <div>URL API (GET): {result.url}</div>
      <div>navigator.onLine: {environment?.online === undefined ? "no disponible" : environment.online ? "true" : "false"} (solo indicio, no prueba de conexión)</div>
      <div>Reloj del dispositivo UTC: {result.deviceUtc}</div>
      <div>HTTP: {result.httpStatus ?? "sin respuesta"}</div>
      {result.errorCode && <div>Código recibido: {result.errorCode}</div>}
      {result.errorMessage && <div>Descripción: {result.errorMessage}</div>}
      <div>Diferencia reloj dispositivo − servidor (segundos): {result.clockDifferenceSeconds ?? "no disponible (Date ausente o no accesible)"}</div>
      <div>{result.guidance}</div>
      <div>Puedes facilitar una foto de este panel. No se envían registros ni se reintenta automáticamente.</div>
    </div>}
  </div>;
}

export default PartnerConnectionCheck;
