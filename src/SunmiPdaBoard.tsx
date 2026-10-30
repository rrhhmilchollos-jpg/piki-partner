import { AlertTriangle, Bike, Clock3, Printer, Volume2, Wifi, WifiOff } from "lucide-react";
import type { PartnerOrder } from "./OrdersBoard";
import type { PikiRealtimeConnectionState } from "./realtime";
import { visibleOrderReference } from "./orderReference";

const prepOptions = [15, 20, 30, 45] as const;

type Props = {
  order: PartnerOrder | null;
  loading: boolean;
  message: string;
  busy: boolean;
  canOperate: boolean;
  activeCount: number;
  audioReady: boolean;
  realtimeState: PikiRealtimeConnectionState;
  connectionLabel: string;
  preparationMinutes: number;
  onPreparationMinutesChange: (minutes: number) => void;
  onAccept: () => void;
  onReady: () => void;
  onPrint: () => void;
  onEnableAudio: () => void;
};

function orderTime(value?: string): string {
  if (!value) return "Hora no disponible";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Hora no disponible" : date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function riderLabel(order: PartnerOrder): string {
  if (order.riderTracking?.name) return `Rider asignado${order.riderTracking.fresh ? " · en directo" : ""}`;
  if (order.assignmentState === "offered") return "Rider avisado · esperando aceptación";
  if (order.assignmentState === "assigned") return "Rider asignado · preparando llegada";
  return "Buscando Rider…";
}

export default function SunmiPdaBoard({
  order, loading, message, busy, canOperate, activeCount, audioReady, realtimeState, connectionLabel,
  preparationMinutes, onPreparationMinutesChange, onAccept, onReady, onPrint, onEnableAudio,
}: Props) {
  const incoming = order?.status === "pending";
  const readyAction = order && ["accepted", "preparing"].includes(order.status);
  const notes = (order?.deliveryNote || "").trim();
  const hasAlert = Boolean(notes || order?.customer?.allergies);
  const connected = realtimeState.status === "connected";

  return <section className="sunmi-pda-shell" aria-label="Piki Partner Orders para Sunmi">
    <header className="sunmi-pda-header">
      <div><span className="sunmi-overline">PIKI PARTNER ORDERS · PDA</span><h1>{order ? visibleOrderReference(order.publicCode, order._id) : "Sin pedido activo"}</h1><p>{order?.customer?.name || "Esperando nueva comanda"} · recibido a las {orderTime(order?.createdAt)}</p></div>
      <div className={`sunmi-connection ${connected ? "is-connected" : ""}`}><span>{connected ? <Wifi size={17} /> : <WifiOff size={17} />}</span>{connectionLabel}</div>
    </header>

    {activeCount > 0 && <button type="button" className={`sunmi-alarm ${audioReady ? "is-ready" : "needs-gesture"}`} onClick={onEnableAudio} aria-label="Activar sonido de pedidos nuevos"><Volume2 size={22} /><span><strong>{activeCount} pedido{activeCount === 1 ? "" : "s"} nuevo{activeCount === 1 ? "" : "s"}</strong><small>{audioReady ? "Alarma activa · toca Aceptar para detenerla" : "Toca aquí para activar el sonido de cocina"}</small></span></button>}

    {loading ? <div className="sunmi-empty">Sincronizando pedidos…</div> : !order ? <div className="sunmi-empty"><Clock3 size={32} /><strong>Esperando el siguiente pedido</strong><span>Los pedidos pagados aparecerán automáticamente aquí.</span></div> : <>
      <div className="sunmi-alert-stack">{hasAlert && <div className="sunmi-special-alert"><AlertTriangle size={24} /><span><strong>ALERGIA / NOTA ESPECIAL</strong><small>{order.customer?.allergies || notes}</small></span></div>}</div>

      <main className="sunmi-order-detail">
        <div className="sunmi-order-meta"><span>{incoming ? "PEDIDO ENTRANTE" : order.status === "ready_for_pickup" ? "LISTO PARA RECOGER" : "EN PREPARACIÓN"}</span><strong>{riderLabel(order)}</strong></div>
        <div className="sunmi-items">{(order.items || []).map((item, index) => <article key={`${order._id}-${index}`} className="sunmi-item"><b>{item.quantity || 1}×</b><div><strong>{item.name || "Producto"}</strong>{item.selectedOptions?.map((option, optionIndex) => <span key={`${index}-${optionIndex}`}>↳ {option.optionName || "Modificador"}</span>)}</div></article>)}</div>
        <div className="sunmi-rider-status"><Bike size={22} /><span><small>ESTADO DEL RIDER</small><strong>{riderLabel(order)}</strong></span>{order.riderTracking?.riderId && <em>{order.riderTracking.fresh ? "GPS activo" : "GPS pendiente"}</em>}</div>
      </main>

      <footer className={`sunmi-action-zone ${incoming ? "is-incoming" : "is-preparing"}`}>
        {incoming ? <><p className="sunmi-action-hint">Selecciona el tiempo estimado de preparación</p><div className="sunmi-prep-options" role="radiogroup" aria-label="Tiempo estimado de preparación">{prepOptions.map((minutes) => <button key={minutes} type="button" role="radio" aria-checked={preparationMinutes === minutes} className={preparationMinutes === minutes ? "is-selected" : ""} onClick={() => onPreparationMinutesChange(minutes)}>{minutes} min</button>)}</div><button type="button" className="sunmi-primary-action sunmi-accept" disabled={!canOperate || busy} onClick={onAccept}>{busy ? "ACEPTANDO…" : "ACEPTAR PEDIDO"}</button></> : readyAction ? <><p className="sunmi-action-hint">Cuando la bolsa esté completa, avisa al Rider</p><button type="button" className="sunmi-primary-action sunmi-ready" disabled={!canOperate || busy} onClick={onReady}>{busy ? "ACTUALIZANDO…" : "¡PEDIDO LISTO para recoger!"}</button></> : <div className="sunmi-complete-state"><strong>Pedido listo para el Rider</strong><span>El despacho y la recogida siguen sincronizados.</span></div>}
        <button type="button" className="sunmi-print-action" onClick={onPrint}><Printer size={20} /> Imprimir comanda 58 mm</button>
      </footer>
    </>}
    {message && <p className="sunmi-message" role="status">{message}</p>}
  </section>;
}
