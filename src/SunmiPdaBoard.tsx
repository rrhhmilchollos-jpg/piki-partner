import { AlertTriangle, Bike, Clock3, Printer, RefreshCw, Volume2 } from "lucide-react";
import type { PartnerOrder } from "./OrdersBoard";
import type { PikiRealtimeConnectionState } from "./realtime";
import { visibleOrderReference } from "./orderReference";
import { isPartnerNativeAndroid } from "./partnerNativeNotifications";

const prepOptions = [15, 20, 30, 45] as const;
type OrderGroup = "pending" | "preparing" | "ready";

const groupLabels: Record<OrderGroup, string> = {
  pending: "Nuevos",
  preparing: "Preparación",
  ready: "Listos",
};

const emptyLabels: Record<OrderGroup, string> = {
  pending: "No hay pedidos nuevos",
  preparing: "No hay pedidos en preparación",
  ready: "No hay pedidos listos",
};

type Props = {
  order: PartnerOrder | null;
  loading: boolean;
  message: string;
  busy: boolean;
  canAccept: boolean;
  canPrepare: boolean;
  canCancel?: boolean;
  onCancel?: () => void;
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
  orderGroups?: Array<{ id: OrderGroup; label: string; count: number }>;
  activeGroup?: OrderGroup;
  onGroupChange?: (group: OrderGroup) => void;
  queue?: PartnerOrder[];
  onSelectOrder?: (orderId: string) => void;
  onRefresh?: () => void;
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
  order, loading, message, busy, canAccept, canPrepare, activeCount, audioReady, realtimeState, connectionLabel,
  preparationMinutes, onPreparationMinutesChange, onAccept, onReady, onPrint, onEnableAudio,
  orderGroups, activeGroup, onGroupChange, queue = [], onSelectOrder, onRefresh, canCancel = false, onCancel,
}: Props) {
  const incoming = order?.status === "pending";
  const readyAction = Boolean(order && ["accepted", "preparing"].includes(order.status));
  const notes = (order?.deliveryNote || "").trim();
  const hasAlert = Boolean(notes || order?.customer?.allergies);
  const connected = realtimeState.status === "connected";
  const nativeAndroid = isPartnerNativeAndroid();
  const selectedGroup = activeGroup ?? (order?.status === "ready_for_pickup" ? "ready" : readyAction ? "preparing" : "pending");
  const groups = orderGroups ?? (["pending", "preparing", "ready"] as const).map((id) => {
    const fallbackCount = id === "pending" ? activeCount : id === "preparing" ? Number(readyAction) : Number(order?.status === "ready_for_pickup");
    return { id, label: groupLabels[id], count: fallbackCount };
  });
  const queueHasSelection = Boolean(order && queue.some((queuedOrder) => queuedOrder._id === order._id));

  return <section className="sunmi-pda-shell" aria-label="Piki Partner Orders para Sunmi">
    <header className="sunmi-pda-header">
      <h1>Pedidos</h1>
      <div className="sunmi-header-controls">
        <div className={`sunmi-connection ${connected ? "is-connected" : ""}`} role="status">
          <span className="sunmi-connection-dot" aria-hidden="true" />
          <span>{connectionLabel}</span>
        </div>
        {onRefresh && <button type="button" className="sunmi-refresh" onClick={onRefresh} disabled={loading || busy} aria-label="Actualizar pedidos"><RefreshCw size={20} aria-hidden="true" /></button>}
      </div>
    </header>

    <nav className="sunmi-order-groups" data-group-count={groups.length} aria-label="Estado de los pedidos">
      {groups.map((group) => <button key={group.id} type="button" className={selectedGroup === group.id ? "is-selected" : ""} aria-pressed={selectedGroup === group.id} disabled={!onGroupChange} onClick={() => onGroupChange?.(group.id)}>
        <span>{group.label}</span><b aria-label={`${group.count} pedidos`}>{group.count}</b>
      </button>)}
    </nav>

    {queue.length > 1 && <label className="sunmi-queue-selector">
      <span>Pedido de esta cola · {queue.length}</span>
      <select aria-label="Seleccionar pedido de esta cola" value={queueHasSelection ? order!._id : ""} disabled={!onSelectOrder || busy} onChange={(event) => onSelectOrder?.(event.target.value)}>
        {!queueHasSelection && <option value="" disabled>Selecciona un pedido</option>}
        {queue.map((queuedOrder) => <option key={queuedOrder._id} value={queuedOrder._id}>{visibleOrderReference(queuedOrder.publicCode, queuedOrder._id)} · {queuedOrder.customer?.name || "Cliente"} · {orderTime(queuedOrder.createdAt)}</option>)}
      </select>
    </label>}

    <div className="sunmi-order-scroll" aria-label="Detalle del pedido" tabIndex={0} aria-busy={loading}>
      {activeCount > 0 && <button type="button" className={`sunmi-alarm ${audioReady ? "is-ready" : "needs-gesture"}`} onClick={onEnableAudio} aria-label={nativeAndroid ? "Revisar canal Android de pedidos nuevos" : "Activar sonido de pedidos nuevos"}>
        <Volume2 size={22} aria-hidden="true" />
        <span><strong>{activeCount} pedido{activeCount === 1 ? "" : "s"} nuevo{activeCount === 1 ? "" : "s"}</strong><small>{nativeAndroid ? "Revisar avisos Android" : audioReady ? "Alarma activa" : "Activar sonido de cocina"}</small></span>
      </button>}

      {message && <p className="sunmi-message" role="status">{message}</p>}
      {loading ? <div className="sunmi-empty" role="status">Sincronizando pedidos…</div> : !order ? <div className="sunmi-empty">
        <Clock3 size={32} aria-hidden="true" /><strong>{emptyLabels[selectedGroup]}</strong><span>Los pedidos de esta cola aparecerán automáticamente aquí. Puedes revisar las otras pestañas.</span>
      </div> : <>
        <header className="sunmi-selected-order">
          <h2>{visibleOrderReference(order.publicCode, order._id)}</h2>
          <p><strong>{order.customer?.name || "Cliente"}</strong><span>Recibido a las {orderTime(order.createdAt)}</span></p>
        </header>

        {hasAlert && <div className="sunmi-alert-stack"><div className="sunmi-special-alert" role="note">
          <AlertTriangle size={24} aria-hidden="true" />
          <span><strong>ALERGIA / NOTA ESPECIAL</strong>{order.customer?.allergies && <small>{order.customer.allergies}</small>}{notes && <small>{notes}</small>}</span>
        </div></div>}

        <div className="sunmi-order-detail">
          <div className="sunmi-order-meta"><span>{incoming ? "PEDIDO ENTRANTE" : order.status === "ready_for_pickup" ? "LISTO PARA RECOGER" : "EN PREPARACIÓN"}</span></div>
          <div className="sunmi-items">{(order.items || []).map((item, index) => <article key={`${order._id}-${index}`} className="sunmi-item">
            <b>{item.quantity || 1}×</b><div><strong>{item.name || "Producto"}</strong>{item.selectedOptions?.map((option, optionIndex) => <span key={`${index}-${optionIndex}`}>↳ {option.optionName || "Modificador"}</span>)}</div>
          </article>)}</div>
          <div className="sunmi-rider-status"><Bike size={22} aria-hidden="true" /><span><small>ESTADO DEL RIDER</small><strong>{riderLabel(order)}</strong></span></div>
        </div>
        {canCancel && onCancel && <details className="sunmi-order-tools"><summary>Otras acciones del pedido</summary><button type="button" className="sunmi-cancel-action" disabled={busy} onClick={onCancel}>Cancelar pedido</button></details>}
      </>}
    </div>

    {!loading && order && <footer className={`sunmi-action-zone ${incoming ? "is-incoming" : "is-preparing"}`}>
      {incoming ? <>
        <p className="sunmi-action-hint">Tiempo estimado de preparación</p>
        <div className="sunmi-prep-options" role="radiogroup" aria-label="Tiempo estimado de preparación">{prepOptions.map((minutes) => <button key={minutes} type="button" role="radio" aria-checked={preparationMinutes === minutes} className={preparationMinutes === minutes ? "is-selected" : ""} onClick={() => onPreparationMinutesChange(minutes)} disabled={!canAccept || busy}>{minutes} min</button>)}</div>
        <button type="button" className="sunmi-primary-action sunmi-accept" disabled={!canAccept || busy} onClick={onAccept}>{busy ? "ACEPTANDO…" : "ACEPTAR PEDIDO"}</button>
      </> : readyAction ? <>
        <p className="sunmi-action-hint">Con la bolsa completa, avisa al Rider</p>
        <button type="button" className="sunmi-primary-action sunmi-ready" disabled={!canPrepare || busy} onClick={onReady}>{busy ? "ACTUALIZANDO…" : "¡PEDIDO LISTO para recoger!"}</button>
      </> : <div className="sunmi-complete-state"><strong>Pedido listo para el Rider</strong><span>El despacho y la recogida siguen sincronizados.</span></div>}
      <button type="button" className="sunmi-print-action" disabled={incoming || busy} onClick={onPrint}><Printer size={20} aria-hidden="true" /> Imprimir comanda 58 mm</button>
    </footer>}
  </section>;
}
