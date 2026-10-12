import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BellRing, ChevronRight, CircleAlert, Clock3, MessageSquare, Printer, RefreshCw, Send, Wifi, WifiOff } from "lucide-react";
import { PartnerOrderAlarmBanner, type PartnerKitchenOrder, usePartnerOrderAlarm } from "./PartnerOrderAlarm";
import { apiOrigin, partnerHeaders } from "./partnerApi";
import { usePwaUpdateBlocker } from "./pwaUpdateRuntime";
import { connectPikiRealtime, type PikiRealtimeConnectionState } from "./realtime";
import PrintablePartnerTicket from "./PrintablePartnerTicket";
import { visibleOrderReference } from "./orderReference";

/* oxlint-disable react/set-state-in-effect -- effects synchronise external partner order data. */

export type PartnerOrder = PartnerKitchenOrder & {
  publicCode?: string;
  createdAt: string;
  customer?: { name?: string } | null;
  deliveryAddress?: string;
  items?: { name?: string; quantity?: number; unitPriceCents?: number; selectedOptions?: { optionName?: string }[] }[];
  totalCents?: number;
  paymentMethod?: "stripe" | "bizum" | "cash";
  cashDueAtDelivery?: boolean;
  paymentState?: string;
  acceptanceDeadline?: string;
  preparationDeadline?: string;
  estimatedReadyAt?: string;
  partnerPrepDeadlineAt?: string | null;
  preparationMinutes?: number;
};

type OrderStatus = "pending" | "accepted" | "preparing" | "ready_for_pickup";
type OrderFilter = "all" | OrderStatus;

type Lane = {
  status: OrderStatus;
  label: string;
  hint: string;
  action?: { label: string; to: OrderStatus };
};

const lanes: Lane[] = [
  { status: "pending", label: "Nuevos", hint: "Revisa y acepta", action: { label: "Aceptar pedido", to: "accepted" } },
  { status: "accepted", label: "Aceptados", hint: "Pendientes de cocina", action: { label: "Iniciar preparación", to: "preparing" } },
  { status: "preparing", label: "En preparación", hint: "Cocina en marcha", action: { label: "Marcar como listo", to: "ready_for_pickup" } },
  { status: "ready_for_pickup", label: "Listos", hint: "Esperando al Rider" },
];

const filterLabels: Record<OrderFilter, string> = { all: "Todos", pending: "Nuevos", accepted: "Aceptados", preparing: "En preparación", ready_for_pickup: "Listos" };

function isCashOrder(order: PartnerOrder): boolean {
  return Boolean(order.cashDueAtDelivery || order.paymentMethod === "cash");
}

function orderDeadline(order: PartnerOrder): number {
  const explicit = order.acceptanceDeadline || order.preparationDeadline || order.estimatedReadyAt;
  const parsed = explicit ? new Date(explicit).getTime() : Number.NaN;
  if (Number.isFinite(parsed)) return parsed;
  return new Date(order.createdAt).getTime() + 12 * 60_000;
}

function countdown(order: PartnerOrder, now: number): string {
  const seconds = Math.max(0, Math.floor((orderDeadline(order) - now) / 1_000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function money(cents?: number): string {
  return ((cents ?? 0) / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

function orderTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Hora no disponible" : date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function realtimeStatusLabel(state: PikiRealtimeConnectionState, now: number): string {
  if (state.status === "connected") return "Conectado en directo";
  if (state.status === "offline") return "Sin red · reintentaremos al recuperar señal";
  if (state.status === "reconnecting") {
    if (!state.retryAt) return `Reconectando pedidos · intento ${state.attempt}`;
    const seconds = Math.max(1, Math.ceil((state.retryAt - now) / 1_000));
    return `Reconexión en ${seconds} s · intento ${state.attempt}`;
  }
  return "Conectando pedidos…";
}

export default function OrdersBoard({
  token,
  locationId,
  canRead,
  canOperate,
  canCancel,
  pdaMode = false,
  onUnauthorized,
}: {
  token: string;
  locationId?: string;
  canRead: boolean;
  canOperate: boolean;
  canCancel: boolean;
  pdaMode?: boolean;
  onUnauthorized: () => void;
}) {
  const [orders, setOrders] = useState<PartnerOrder[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyOrderId, setBusyOrderId] = useState("");
  const [realtimeState, setRealtimeState] = useState<PikiRealtimeConnectionState>({ status: "connecting", attempt: 0 });
  const [now, setNow] = useState<number>(() => Date.now());
  const [activeFilter, setActiveFilter] = useState<OrderFilter>("all");
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportBusy, setSupportBusy] = useState(false);
  const [supportForm, setSupportForm] = useState({ orderId: "", priority: "normal", subject: "", description: "" });
  const [printingOrder, setPrintingOrder] = useState<PartnerOrder | null>(null);
  const transitionLockRef = useRef<string | null>(null);
  const { activeCount, audioReady, prepareAudio, reconcileKitchenOrders, notifyPaidOrder, resolveOrder } = usePartnerOrderAlarm();
  const headers = useMemo(() => partnerHeaders(token, locationId), [token, locationId]);
  usePwaUpdateBlocker("partner-order-operation", Boolean(busyOrderId) || supportBusy || supportOpen);

  const load = useCallback(async () => {
    if (!canRead) {
      setOrders([]);
      setMessage("Este perfil no tiene permiso para consultar pedidos de este local.");
      setLoading(false);
      return;
    }
    try {
      const response = await fetch(`${apiOrigin}/api/v1/partners/kitchen/orders`, { headers, cache: "no-store" });
      if (response.status === 401) { onUnauthorized(); return; }
      if (response.status === 403) {
        setOrders([]);
        setMessage("No tienes permiso para consultar pedidos de este local.");
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json() as { orders?: PartnerOrder[] };
      const next = payload.orders ?? [];
      setOrders(next);
      reconcileKitchenOrders(next);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error && error.message.startsWith("HTTP")
        ? `No se ha podido sincronizar pedidos (${error.message}).`
        : "Sin conexión con PIKI. Conservamos la última lista mientras vuelve la señal.");
    } finally {
      setLoading(false);
    }
  }, [canRead, headers, onUnauthorized, reconcileKitchenOrders]);

  useEffect(() => {
    void load();
    const polling = window.setInterval(() => void load(), 30_000);
    const ticker = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => { window.clearInterval(polling); window.clearInterval(ticker); };
  }, [load]);

  useEffect(() => {
    if (!canRead) return undefined;
    return connectPikiRealtime({
      apiOrigin,
      token,
      locationId,
      surface: "partner",
      onState: setRealtimeState,
      onEvent: (event) => {
        if (event.type === "order.awaiting_partner_acceptance") {
          notifyPaidOrder(String(event.payload.orderId ?? ""));
          setMessage(isCashOrder(event.payload as PartnerOrder)
            ? "Nuevo pedido contra reembolso: el rider cobrará al entregar."
            : "Nuevo pedido recibido. PIKI ya coordina el rider mientras lo preparas.");
        }
        void load();
      },
    });
  }, [canRead, locationId, load, notifyPaidOrder, token]);

  useEffect(() => {
    if (!printingOrder) return;
    let cancelled = false;
    const firstFrame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (!cancelled) window.print();
      });
    });
    const closeTicket = () => setPrintingOrder(null);
    window.addEventListener("afterprint", closeTicket, { once: true });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(firstFrame);
      window.removeEventListener("afterprint", closeTicket);
    };
  }, [printingOrder]);

  const move = async (order: PartnerOrder, status: OrderStatus | "cancelled") => {
    // State updates are asynchronous, so a ref closes the brief interval in
    // which a fast double tap could otherwise start two PATCH requests.
    if (transitionLockRef.current || !canRead || !canOperate) return;
    transitionLockRef.current = order._id;
    setBusyOrderId(order._id);
    try {
      const response = await fetch(`${apiOrigin}/api/v1/partners/kitchen/orders/${order._id}/status`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; message?: string };
      if (response.status === 401) { onUnauthorized(); return; }
      if (response.status === 403) { setMessage("No tienes permiso para realizar esta acción en el pedido."); return; }
      if (!response.ok) throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
      if (status === "accepted") resolveOrder(order._id);
      setMessage(status === "accepted" ? "Pedido aceptado. Empieza la preparación cuando el equipo esté listo." : "Pedido actualizado correctamente.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se ha podido actualizar el pedido.");
    } finally {
      if (transitionLockRef.current === order._id) {
        transitionLockRef.current = null;
        setBusyOrderId("");
      }
    }
  };

  const printOrder = (order: PartnerOrder) => {
    if (order.status === "pending") {
      setMessage("Antes de imprimir, acepta el pedido para avisar al Rider del plazo máximo de 10 minutos.");
      return;
    }
    setPrintingOrder(order);
  };
  const submitSupportTicket = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); if (supportBusy) return; setSupportBusy(true); try { const response = await fetch(`${apiOrigin}/api/v1/partners/support/tickets`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ ...supportForm, orderId: supportForm.orderId || undefined }) }); const payload = await response.json().catch(() => ({})) as { error?: string; message?: string; ticket?: { ticketNumber?: string } }; if (response.status === 401) { onUnauthorized(); return; } if (!response.ok) throw new Error(payload.message || payload.error || "No se pudo enviar la incidencia."); setSupportForm({ orderId: "", priority: "normal", subject: "", description: "" }); setSupportOpen(false); setMessage(`Incidencia ${payload.ticket?.ticketNumber || "creada"}. Soporte ya puede atenderla.`); } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo enviar la incidencia."); } finally { setSupportBusy(false); } };
  const counts = useMemo(() => ({ all: orders.length, pending: orders.filter((order) => order.status === "pending").length, accepted: orders.filter((order) => order.status === "accepted").length, preparing: orders.filter((order) => order.status === "preparing").length, ready_for_pickup: orders.filter((order) => order.status === "ready_for_pickup").length }), [orders]);
  const isRealtimeConnected = realtimeState.status === "connected";
  const connectionLabel = realtimeStatusLabel(realtimeState, now);
  return <section className={`orders-workspace ${pdaMode ? "pda-orders-workspace" : ""}`} aria-label={pdaMode ? "PDA operativa PIKI Partner" : "Pedidos PIKI Partner Orders"}>
    <header className="orders-heading">
      <div>
        <p className="section-kicker">{pdaMode ? "PDA · OPERACIÓN EN VIVO" : "OPERACIÓN EN VIVO"}</p>
        <h1>{pdaMode ? "Pedidos del establecimiento" : "Pedidos"}</h1>
        <p>{pdaMode ? "Acepta, prepara y entrega cada pedido desde una sola pantalla." : "Gestiona cada comanda sin perder el ritmo del local."}</p>
      </div>
      <div className="orders-heading-actions"><button type="button" className="support-trigger" onClick={() => setSupportOpen((current) => !current)}><MessageSquare size={16} /> {supportOpen ? "Cerrar soporte" : "Contactar con soporte"}</button><div className={`connection-status ${isRealtimeConnected ? "is-live" : ""} is-${realtimeState.status}`} aria-live="polite">
        {isRealtimeConnected ? <Wifi size={16} /> : realtimeState.status === "reconnecting" ? <RefreshCw className="connection-retrying" size={16} /> : <WifiOff size={16} />}
        <span>{connectionLabel}</span>
        <button type="button" className="icon-control" onClick={() => void load()} aria-label="Actualizar pedidos"><RefreshCw size={17} /></button>
      </div></div>
    </header>

    <div className="partner-operation-strip"><div><span className="operation-dot" /> <strong>Operación activa</strong><small>{counts.pending ? `${counts.pending} ${counts.pending === 1 ? "pedido pendiente de aceptación" : "pedidos pendientes de aceptación"}` : "Los pedidos nuevos aparecen aquí automáticamente"}</small></div><strong>{counts.all} {counts.all === 1 ? "pedido activo" : "pedidos activos"}</strong></div>
    <div className="order-filter-tabs" role="tablist" aria-label="Filtrar pedidos">{(Object.keys(filterLabels) as OrderFilter[]).map((filter) => <button key={filter} type="button" role="tab" aria-selected={activeFilter === filter} className={activeFilter === filter ? "is-active" : ""} onClick={() => setActiveFilter(filter)}>{filterLabels[filter]}<span>{counts[filter]}</span></button>)}</div>
    <PartnerOrderAlarmBanner count={activeCount} audioReady={audioReady} onEnableAudio={() => { void prepareAudio(); }} />
    {message && <p className="orders-message" role="status"><CircleAlert size={17} />{message}</p>}{supportOpen && <form className="partner-support-panel" onSubmit={(event) => void submitSupportTicket(event)}><div><p className="section-kicker">SOPORTE OPERATIVO</p><h2>Enviar incidencia a PIKI Support</h2><p>El equipo recibirá el local, tu cuenta y el pedido seleccionado.</p></div><label>Pedido afectado (opcional)<select value={supportForm.orderId} onChange={(event) => setSupportForm((current) => ({ ...current, orderId: event.target.value }))}><option value="">Sin pedido concreto</option>{orders.map((order) => <option key={order._id} value={order._id}>{visibleOrderReference(order.publicCode, order._id)} · {order.status}</option>)}</select></label><label>Prioridad<select value={supportForm.priority} onChange={(event) => setSupportForm((current) => ({ ...current, priority: event.target.value }))}><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></label><label>Asunto<input required minLength={3} maxLength={180} value={supportForm.subject} onChange={(event) => setSupportForm((current) => ({ ...current, subject: event.target.value }))} placeholder="Ej. El rider no aparece en el local" /></label><label>Qué ha ocurrido<textarea required minLength={3} maxLength={4000} rows={4} value={supportForm.description} onChange={(event) => setSupportForm((current) => ({ ...current, description: event.target.value }))} placeholder="Incluye los datos operativos necesarios." /></label><button type="submit" className="support-submit" disabled={supportBusy}><Send size={15} />{supportBusy ? "Enviando…" : "Enviar a soporte"}</button></form>}

    <div className="orders-summary" aria-label="Resumen de pedidos">
      <div><span>Pedidos activos</span><strong>{orders.filter((order) => lanes.some((lane) => lane.status === order.status)).length}</strong></div>
      <div><span>Nuevos por aceptar</span><strong>{orders.filter((order) => order.status === "pending").length}</strong></div>
      <div><span>Alarma</span><strong>{activeCount ? `${activeCount} activa` : "Sin alertas"}</strong></div>
    </div>

    {loading ? <div className="orders-loading">Cargando operación…</div> : <div className="orders-board">
      {lanes.map((lane) => {
        const laneOrders = orders.filter((order) => order.status === lane.status && (activeFilter === "all" || activeFilter === lane.status));
        return <section key={lane.status} className={`order-lane lane-${lane.status}`} aria-label={lane.label}>
          <header className="lane-header"><div><h2>{lane.label}<span>{laneOrders.length}</span></h2><p>{lane.hint}</p></div></header>
          <div className="lane-cards">
            {laneOrders.map((order) => <article key={order._id} className={`order-card ${lane.status === "pending" ? "is-new" : ""}`}>
              <div className="order-card-top">
                <div><div className="order-card-status"><span className="status-dot" />{filterLabels[lane.status]}</div><span className="order-code">{visibleOrderReference(order.publicCode, order._id)}</span><small>{order.customer?.name || "Cliente PIKI"}</small><small>Recibido a las {orderTime(order.createdAt)}</small></div>
                <div className={`countdown ${orderDeadline(order) <= now ? "is-late" : ""}`}><Clock3 size={15} /><b>{countdown(order, now)}</b></div>
              </div>
              <ul className="order-items">{(order.items ?? []).map((item, index) => <li key={`${order._id}-${index}`}><b>{item.quantity ?? 1}×</b><span><strong>{item.name || "Producto"}</strong>{item.selectedOptions?.length ? <small>{item.selectedOptions.map((option) => option.optionName).filter(Boolean).join(" · ")}</small> : null}</span></li>)}</ul>
              {order.deliveryAddress && <p className="order-address"><span>Entrega</span>{order.deliveryAddress}</p>}
              <div className="order-meta"><span>{isCashOrder(order) ? "Contra reembolso" : "Pago online"}</span><strong>{money(order.totalCents)}</strong></div>
              <div className={`rider-readiness readiness-${order.status === "ready_for_pickup" ? "ready" : order.status === "pending" ? "pending" : "within_10_minutes"}`}>
                <strong>Información para el Rider</strong>
                {order.status === "ready_for_pickup" ? <span>✅ Listo para recoger · Rider avisado</span> : order.status === "pending" ? <span>Acepta el pedido para iniciar el plazo máximo de 10 minutos.</span> : <span>⏱️ Preparación comunicada: máximo 10 minutos · el Rider puede dirigirse al local.</span>}
              </div>
              <div className="order-card-actions">
                {lane.action && <button type="button" className="order-action" disabled={!canOperate || Boolean(busyOrderId)} onClick={() => void move(order, lane.action!.to)}>{busyOrderId === order._id ? "Guardando…" : lane.action.label}<ChevronRight size={17} /></button>}
                {lane.status === "ready_for_pickup" && <button type="button" className="ready-label" disabled>Rider avisado</button>}
                <button type="button" className="print-control" onClick={() => printOrder(order)} aria-label={`Imprimir pedido ${order.publicCode || order._id}`} title={order.status === "pending" ? "Acepta primero para comunicar el plazo al Rider" : "Imprimir ticket"}><Printer size={16} /></button>
              </div>
              {canCancel && lane.status !== "ready_for_pickup" && <button type="button" className="incident-control" disabled={Boolean(busyOrderId)} onClick={() => void move(order, "cancelled")}>Registrar incidencia</button>}
            </article>)}
            {!laneOrders.length && <div className="lane-empty"><BellRing size={19} /><span>{activeFilter !== "all" ? `No hay pedidos ${filterLabels[activeFilter].toLowerCase()}` : lane.status === "pending" ? "Sin pedidos nuevos" : "Nada por hacer aquí"}</span></div>}
          </div>
        </section>;
      })}
    </div>}
    {printingOrder && <PrintablePartnerTicket order={printingOrder} />}
  </section>;
}
