import { useEffect, useMemo, useRef, useState } from "react";
import { BellRing, Bike, Car, ChevronRight, CircleAlert, Clock3, MapPinned, MessageSquare, Printer, RefreshCw, Send, Scooter, Wifi, WifiOff, XCircle } from "lucide-react";
import { PartnerOrderAlarmBanner, type PartnerKitchenOrder } from "./PartnerOrderAlarm";
import { apiOrigin, partnerHeaders } from "./partnerApi";
import { usePwaUpdateBlocker } from "./pwaUpdateRuntime";
import type { PikiRealtimeConnectionState } from "./realtime";
import PrintablePartnerTicket from "./PrintablePartnerTicket";
import { visibleOrderReference } from "./orderReference";
import { usePartnerKitchenReception } from "./PartnerKitchenReception";
import SunmiPdaBoard from "./SunmiPdaBoard";
import { printOrderToSunmi } from "./sunmiPrinter";

/* oxlint-disable react/set-state-in-effect -- effects synchronise external partner order data. */

export type PartnerOrder = PartnerKitchenOrder & {
  publicCode?: string;
  createdAt: string;
  restaurantName?: string;
  customer?: { name?: string; allergies?: string } | null;
  deliveryAddress?: string;
  deliveryNote?: string;
  items?: { name?: string; quantity?: number; unitPriceCents?: number; selectedOptions?: { optionName?: string }[] }[];
  totalCents?: number;
  paymentMethod?: "stripe" | "bizum" | "cash";
  cashDueAtDelivery?: boolean;
  paymentState?: string;
  assignmentState?: "unassigned" | "offered" | "assigned" | "expired" | "rejected";
  riderId?: string | null;
  acceptanceDeadline?: string;
  preparationDeadline?: string;
  estimatedReadyAt?: string;
  pickupQrUrl?: string | null;
  pickupPin?: string | null;
  partnerPrepDeadlineAt?: string | null;
  preparationMinutes?: number;
  riderTracking?: { riderId: string; name?: string; vehicle?: string; status?: string; latitude?: number | null; longitude?: number | null; lastLocationAt?: string | null; fresh?: boolean } | null;
};

type OrderStatus = "pending" | "accepted" | "preparing" | "ready_for_pickup" | "picked_up" | "on_the_way";
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
  { status: "picked_up", label: "Recogidos", hint: "El rider ya está en ruta" },
  { status: "on_the_way", label: "En reparto", hint: "Seguimiento activo" },
];

const filterLabels: Record<OrderFilter, string> = { all: "Todos", pending: "Nuevos", accepted: "Aceptados", preparing: "En preparación", ready_for_pickup: "Listos", picked_up: "Recogidos", on_the_way: "En reparto" };

function isCashOrder(order: PartnerOrder): boolean {
  return Boolean(order.cashDueAtDelivery || order.paymentMethod === "cash");
}

function riderAssignmentLabel(order: PartnerOrder): string {
  if (order.assignmentState === "offered") return "Rider avisado · esperando aceptación";
  if (order.assignmentState === "assigned") return "Rider asignado";
  if (order.assignmentState === "expired" || order.assignmentState === "rejected") return "Buscando otro Rider";
  return "Buscando Rider disponible…";
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

function vehicleLabel(vehicle?: string): string {
  const value = (vehicle || "").toLowerCase();
  if (value.includes("bike") || value.includes("bici") || value.includes("bicicleta")) return "Bicicleta";
  if (value.includes("scoot") || value.includes("patin")) return "Patinete eléctrico";
  if (value.includes("motor") || value.includes("moto")) return "Moto";
  return "Coche";
}
function vehicleIcon(vehicle?: string) {
  const value = vehicleLabel(vehicle);
  return value === "Bicicleta" ? Bike : value === "Patinete eléctrico" ? Scooter : Car;
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
  const [operationMessage, setMessage] = useState("");
  const [busyOrderId, setBusyOrderId] = useState("");
  const [activeFilter, setActiveFilter] = useState<OrderFilter>("all");
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportBusy, setSupportBusy] = useState(false);
  const [supportForm, setSupportForm] = useState({ orderId: "", priority: "normal", subject: "", description: "" });
  const [printingOrder, setPrintingOrder] = useState<PartnerOrder | null>(null);
  const [preparationMinutesByOrder, setPreparationMinutesByOrder] = useState<Record<string, number>>({});
  const transitionLockRef = useRef<string | null>(null);
  const { orders, loading, receptionMessage, realtimeState, now, load, activeCount, audioReady, prepareAudio, resolveOrder, notifyCancelledOrder } = usePartnerKitchenReception();
  const message = [receptionMessage, operationMessage].filter(Boolean).join(" · ");
  const headers = useMemo(() => partnerHeaders(token, locationId), [token, locationId]);
  usePwaUpdateBlocker("partner-order-operation", Boolean(busyOrderId) || supportBusy || supportOpen);

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

  const move = async (order: PartnerOrder, status: OrderStatus | "cancelled", preparationMinutes?: number) => {
    // State updates are asynchronous, so a ref closes the brief interval in
    // which a fast double tap could otherwise start two PATCH requests.
    if (transitionLockRef.current || !canRead || !canOperate) return;
    transitionLockRef.current = order._id;
    setBusyOrderId(order._id);
    try {
      const response = await fetch(`${apiOrigin}/api/v1/partners/kitchen/orders/${order._id}/status`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...(["accepted", "preparing"].includes(status) ? { preparationMinutes: preparationMinutes ?? 20 } : {}) }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; message?: string };
      if (response.status === 401) { onUnauthorized(); return; }
      if (response.status === 403) { setMessage("No tienes permiso para realizar esta acción en el pedido."); return; }
      if (!response.ok) throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
      if (status === "accepted") {
        resolveOrder(order._id);
        await printOrder({ ...order, status: "accepted" });
      }
      setMessage(status === "accepted" ? "Pedido aceptado. Empieza la preparación cuando el equipo esté listo." : "Pedido actualizado correctamente.");
      if (status === "cancelled") notifyCancelledOrder(order._id, order.publicCode);
      else if (status !== "pending") resolveOrder(order._id);
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

  const cancelOrder = (order: PartnerOrder) => {
    if (!window.confirm(`¿Cancelar el pedido ${visibleOrderReference(order.publicCode, order._id)}? Esta acción lo cerrará y avisará al cliente.`)) return;
    void move(order, "cancelled");
  };

  const printOrder = async (order: PartnerOrder) => {
    if (order.status === "pending") {
      setMessage("Antes de imprimir, acepta el pedido para avisar al Rider del plazo elegido (15–45 minutos).");
      return;
    }
    try {
      const printedNatively = await printOrderToSunmi(order);
      if (printedNatively) {
        setMessage("Comanda enviada a la impresora Sunmi.");
        return;
      }
    } catch {
      setMessage("La impresora Sunmi no respondió; abrimos la impresión web de respaldo.");
    }
    setPrintingOrder(order);
  };
  const submitSupportTicket = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); if (supportBusy) return; setSupportBusy(true); try { const response = await fetch(`${apiOrigin}/api/v1/partners/support/tickets`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ ...supportForm, orderId: supportForm.orderId || undefined }) }); const payload = await response.json().catch(() => ({})) as { error?: string; message?: string; ticket?: { ticketNumber?: string } }; if (response.status === 401) { onUnauthorized(); return; } if (!response.ok) throw new Error(payload.message || payload.error || "No se pudo enviar la incidencia."); setSupportForm({ orderId: "", priority: "normal", subject: "", description: "" }); setSupportOpen(false); setMessage(`Incidencia ${payload.ticket?.ticketNumber || "creada"}. Soporte ya puede atenderla.`); } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo enviar la incidencia."); } finally { setSupportBusy(false); } };
  const counts = useMemo(() => ({ all: orders.length, pending: orders.filter((order) => order.status === "pending").length, accepted: orders.filter((order) => order.status === "accepted").length, preparing: orders.filter((order) => order.status === "preparing").length, ready_for_pickup: orders.filter((order) => order.status === "ready_for_pickup").length, picked_up: orders.filter((order) => order.status === "picked_up").length, on_the_way: orders.filter((order) => order.status === "on_the_way").length }), [orders]);
  const isRealtimeConnected = realtimeState.status === "connected";
  const connectionLabel = realtimeStatusLabel(realtimeState, now);
  const pdaOrder = orders.find((order) => order.status === "pending") || orders.find((order) => ["accepted", "preparing"].includes(order.status)) || orders.find((order) => order.status === "ready_for_pickup") || null;
  if (pdaMode) return <SunmiPdaBoard
    order={pdaOrder}
    loading={loading}
    message={message}
    busy={Boolean(busyOrderId)}
    canOperate={canOperate}
    activeCount={activeCount}
    audioReady={audioReady}
    realtimeState={realtimeState}
    connectionLabel={connectionLabel}
    preparationMinutes={pdaOrder ? preparationMinutesByOrder[pdaOrder._id] ?? 20 : 20}
    onPreparationMinutesChange={(minutes) => { if (pdaOrder) setPreparationMinutesByOrder((previous) => ({ ...previous, [pdaOrder._id]: minutes })); }}
    onAccept={() => { if (pdaOrder) void move(pdaOrder, "accepted", preparationMinutesByOrder[pdaOrder._id] ?? 20); }}
    onReady={() => { if (pdaOrder) void move(pdaOrder, "ready_for_pickup", preparationMinutesByOrder[pdaOrder._id] ?? 20); }}
    onPrint={() => { if (pdaOrder) void printOrder(pdaOrder); }}
    onEnableAudio={() => { void prepareAudio(); }}
  />;
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
              {order.riderTracking && <div className="rider-tracking-card">
                <div className="rider-tracking-heading"><span><MapPinned size={16} /> Seguimiento del Rider</span><small className={order.riderTracking.fresh ? "tracking-live" : "tracking-stale"}>{order.riderTracking.fresh ? "En directo" : "Esperando GPS"}</small></div>
                <p><b>{order.riderTracking.name || "Rider PIKI"}</b> · {vehicleLabel(order.riderTracking.vehicle)} · {order.riderTracking.status || "disponible"}</p>
                {(() => { const Vehicle = vehicleIcon(order.riderTracking?.vehicle); return <Vehicle size={20} aria-label={vehicleLabel(order.riderTracking?.vehicle)} />; })()}
                {order.riderTracking.latitude != null && order.riderTracking.longitude != null ? <a className="tracking-map-link" href={`https://www.google.com/maps/search/?api=1&query=${order.riderTracking.latitude},${order.riderTracking.longitude}`} target="_blank" rel="noreferrer"><MapPinned size={14} /> Ver posición y distancia en el mapa</a> : <span className="tracking-no-gps">La última posición todavía no está disponible.</span>}
              </div>}
              <div className={`rider-readiness readiness-${order.status === "ready_for_pickup" ? "ready" : order.status === "pending" ? "pending" : "within_10_minutes"}`}>
                <strong>Información para el Rider</strong>
                {order.status === "ready_for_pickup" ? <span>✅ Listo para recoger · {riderAssignmentLabel(order)}{order.pickupPin ? <><br />PIN de recogida: <b>{order.pickupPin}</b></> : null}</span> : order.status === "pending" ? <span>Acepta el pedido para iniciar la preparación.</span> : <span>⏱️ Estará listo en {order.preparationMinutes ?? 20} minutos · {riderAssignmentLabel(order)}</span>}
              </div>
              {order.status === "accepted" && <label className="preparation-time-control">Tiempo estimado de preparación<select value={preparationMinutesByOrder[order._id] ?? 20} onChange={(event) => setPreparationMinutesByOrder((previous) => ({ ...previous, [order._id]: Number(event.target.value) }))}>{[15, 20, 30, 45].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutos</option>)}</select></label>}
              <div className="order-card-actions">
                {lane.action && <button type="button" className="order-action" disabled={!canOperate || Boolean(busyOrderId)} onClick={() => void move(order, lane.action!.to, preparationMinutesByOrder[order._id] ?? 20)}>{busyOrderId === order._id ? "Guardando…" : lane.action.label}{order.status === "accepted" ? ` · ${preparationMinutesByOrder[order._id] ?? 20} min` : ""}<ChevronRight size={17} /></button>}
                {lane.status === "ready_for_pickup" && <button type="button" className="ready-label" disabled>{riderAssignmentLabel(order)}</button>}
                <button type="button" className="print-control" onClick={() => printOrder(order)} aria-label={`Imprimir pedido ${order.publicCode || order._id}`} title={order.status === "pending" ? "Acepta primero para comunicar el plazo al Rider" : "Imprimir ticket"}><Printer size={16} /></button>
              </div>
              {canCancel && ["pending", "accepted", "preparing"].includes(lane.status) && <button type="button" className="incident-control" disabled={Boolean(busyOrderId)} onClick={() => cancelOrder(order)}><XCircle size={15} /> Cancelar pedido</button>}
            </article>)}
            {!laneOrders.length && <div className="lane-empty"><BellRing size={19} /><span>{activeFilter !== "all" ? `No hay pedidos ${filterLabels[activeFilter].toLowerCase()}` : lane.status === "pending" ? "Sin pedidos nuevos" : "Nada por hacer aquí"}</span></div>}
          </div>
        </section>;
      })}
    </div>}
    {printingOrder && <PrintablePartnerTicket order={printingOrder} />}
  </section>;
}
