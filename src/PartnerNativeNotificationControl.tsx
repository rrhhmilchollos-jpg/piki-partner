import { useCallback, useEffect, useState } from "react";
import { isPartnerNativeAndroid, nativeNotificationStatusEvent, nativeNotificationWarnings, partnerNativeNotifications, type NativeNotificationStatus } from "./partnerNativeNotifications";

/* oxlint-disable react/set-state-in-effect -- reconciles Android permissions/settings. */
export default function PartnerNativeNotificationControl() {
  const [status, setStatus] = useState<NativeNotificationStatus | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try { setStatus(await partnerNativeNotifications.getStatus()); setMessage(""); }
    catch { setMessage("No se puede comprobar el permiso nativo en esta versión del APK. Revisa Ajustes > Aplicaciones > PIKI."); }
  }, []);
  useEffect(() => {
    if (!isPartnerNativeAndroid()) return;
    void refresh();
    const wake = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", wake);
    window.addEventListener(nativeNotificationStatusEvent, wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      window.removeEventListener("focus", wake);
      window.removeEventListener(nativeNotificationStatusEvent, wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [refresh]);
  const enable = async () => {
    setBusy(true);
    try { setStatus(await partnerNativeNotifications.requestNotificationPermission()); setMessage(""); }
    catch { setMessage("No se pudo solicitar el permiso. Puedes habilitarlo en los ajustes Android."); }
    finally { setBusy(false); }
  };
  const open = async (category: "app" | "new_order" | "cancelled") => {
    try { await partnerNativeNotifications.openSettings({ category }); }
    catch { setMessage("Este dispositivo no ha abierto los ajustes. Revisa Ajustes > Aplicaciones > PIKI."); }
  };
  if (!isPartnerNativeAndroid()) return null;
  const warnings = status ? nativeNotificationWarnings(status) : [];
  return <section className="orders-message" aria-label="Avisos Android de cocina">
    <strong>Avisos Android de cocina</strong>
    <p>Los eventos dependen de la conexión de la aplicación. No se garantiza recepción con la app cerrada ni sonido en silencio, No molestar o por restricciones del fabricante.</p>
    {warnings.map((warning) => <p key={warning}>{warning}</p>)}
    {status && !warnings.length && <p>Permiso y canales configurados; confirma el sonido en este dispositivo antes del servicio.</p>}
    {status && status.permission !== "granted" && <button type="button" className="secondary-button" disabled={busy} onClick={() => void enable()}>{busy ? "Solicitando…" : "Permitir avisos Android"}</button>}
    <button type="button" className="secondary-button" onClick={() => void open("app")}>Permisos de la app</button>{" "}
    <button type="button" className="secondary-button" onClick={() => void open("new_order")}>Canal nuevos pedidos</button>{" "}
    <button type="button" className="secondary-button" onClick={() => void open("cancelled")}>Canal cancelaciones</button>{" "}
    <button type="button" className="secondary-button" onClick={() => void refresh()}>Comprobar de nuevo</button>
    {message && <p role="status">{message}</p>}
  </section>;
}
