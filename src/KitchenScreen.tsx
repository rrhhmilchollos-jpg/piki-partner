import { useCallback, useEffect, useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { PartnerOrderAlarmBanner, type PartnerKitchenOrder, usePartnerOrderAlarm } from "./PartnerOrderAlarm";
import { connectPikiRealtime } from "./realtime";

type Order = PartnerKitchenOrder & {
	publicCode?: string;
  createdAt: string;
  deliveryAddress?: string;
  items?: { name?: string; quantity?: number; priceCents?: number; unitPriceCents?: number; selectedOptions?: { groupName?: string; optionName?: string; unitPriceCents?: number }[] }[];
  totalCents?: number;
  pickupQrUrl?: string | null;
  pickupPin?: string | null;
  restaurant?: { name?: string; address?: string; phone?: string; cuisine?: string } | null;
  customer?: { name?: string; email?: string } | null;
};

const labels: Record<string, string> = {
  pending: "Nuevo",
  accepted: "Aceptado",
  preparing: "En preparación",
  ready_for_pickup: "Listo para recoger",
  picked_up: "Recogido por el Rider",
  on_the_way: "En ruta al cliente",
};

const isCashOrder = (order: { cashDueAtDelivery?: boolean; paymentMethod?: string }) => Boolean(order.cashDueAtDelivery || order.paymentMethod === "cash");

export default function KitchenScreen({ apiOrigin, token, onUnauthorized }: { apiOrigin: string; token: string; onUnauthorized: () => void }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [message, setMessage] = useState("");
  const [busyOrderId, setBusyOrderId] = useState("");
  const [printingOrder, setPrintingOrder] = useState<Order | null>(null);
  const {
    activeCount,
    audioReady,
    prepareAudio,
    reconcileKitchenOrders,
    notifyPaidOrder,
    resolveOrder,
  } = usePartnerOrderAlarm();
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${apiOrigin}/api/v1/partners/kitchen/orders`, { headers });
      if (!response.ok) { if (response.status === 401 || response.status === 403) { onUnauthorized(); return; } setMessage(`No se pudo sincronizar cocina (HTTP ${response.status}).`); return; }
      const next = ((await response.json()).orders || []) as Order[];
      setOrders(next);
      reconcileKitchenOrders(next);
    } catch {
      setMessage("No hay conexión con la API. Conserva la última lista hasta recuperar sincronización.");
    }
  }, [apiOrigin, headers, onUnauthorized, reconcileKitchenOrders]);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    void load();
    const id = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => connectPikiRealtime({
    apiOrigin,
    token,
    surface: "partner",
    onEvent: (event) => {
      if (event.type === "order.awaiting_partner_acceptance") {
        const orderId = String(event.payload.orderId || "");
        notifyPaidOrder(orderId);
        setMessage(isCashOrder(event.payload) ? "Nuevo pedido a contrarreembolso. No se cobra ahora; el Rider cobrará en efectivo al entregar." : "Nuevo pedido pagado online. PIKI busca Rider en paralelo mientras empiezas la preparación.");
      }
      void load();
    },
  }), [apiOrigin, token, load, notifyPaidOrder]);

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

  async function move(id: string, status: string) {
    if (busyOrderId) return;
    setBusyOrderId(id);
    try {
      const response = await fetch(`${apiOrigin}/api/v1/partners/kitchen/orders/${id}/status`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string; message?: string };
      if (response.ok && status === "accepted") resolveOrder(id);
      setMessage(response.ok
        ? status === "accepted"
          ? "Pedido aceptado. La alarma se ha detenido; PIKI sigue coordinando el Rider mientras lo preparas."
          : "Pedido actualizado correctamente"
        : body.message || body.error || `No se pudo actualizar el pedido (HTTP ${response.status}).`);
      await load();
    } catch {
      setMessage("Error de red actualizando el pedido. Revisa la conexión antes de repetir.");
      await load();
    } finally { setBusyOrderId(""); }
  }

  function printThermalTicket(order: Order) {
    setPrintingOrder(order);
  }

  return <section className="application-table" aria-label="Pantalla de cocina PIKI">
    <div className="table-heading">
      <div>
        <p className="eyebrow">OPERACIÓN DE COCINA</p>
        <h1>Pedidos en cocina</h1>
        <p className="lead">Los pedidos activos llegan al instante. En los pedidos a contrarreembolso, el Rider cobra al cliente al entregar; el Partner no gestiona el efectivo.</p>
      </div>
      <button className="secondary-button" onClick={() => void load()}>Actualizar</button>
    </div>
    <PartnerOrderAlarmBanner count={activeCount} audioReady={audioReady} onEnableAudio={() => { void prepareAudio(); }} />
    {message && <p className="status-pill" role="status">{message}</p>}
    {orders.length
      ? <div className="pda-order-grid">{orders.map((order) => <article className="application-row pda-order-card" key={order._id}>
        <div>
          <strong>Pedido {order.publicCode || order._id}</strong>
          <span className={`kitchen-status status-${order.status}`}>{labels[order.status] || order.status}</span>
          <small>{new Date(order.createdAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })} · {order.deliveryAddress || "Dirección disponible"}</small><small>{isCashOrder(order) ? `CONTRARREEMBOLSO · cobra el Rider al entregar ${(Number(order.totalCents || 0) / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}` : "PAGO ONLINE CONFIRMADO"}</small>
          <ul>{(order.items || []).map((item, index) => <li key={`${order._id}-${index}`}>{item.quantity || 1} × {item.name || "Producto"}</li>)}</ul>
          {order.status === "ready_for_pickup" && order.pickupQrUrl && <div className="pickup-verification" aria-label="Código único del pedido para autorizar la recogida del rider"><div><strong>Entrega al rider · {order.publicCode || "Pedido"}</strong><span>QR del pedido · muéstralo al rider</span><b>PIN de recogida: {order.pickupPin || "—"}</b><small>Este código pertenece solo a este pedido.</small></div><img src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&margin=4&data=${encodeURIComponent(order.pickupQrUrl)}`} alt={`QR del pedido ${order.publicCode || ""}`} /></div>}
        </div>
        <div className="pda-actions">
          {order.status === "pending" && <button className="primary-button" disabled={busyOrderId === order._id} onClick={() => void move(order._id, "accepted")}>{busyOrderId === order._id ? "Aceptando…" : "Aceptar pedido"}</button>}
          {order.status === "accepted" && <button className="primary-button" disabled={busyOrderId === order._id} onClick={() => void move(order._id, "preparing")}>Comenzar preparación</button>}
          {order.status === "preparing" && <button className="primary-button" disabled={busyOrderId === order._id} onClick={() => void move(order._id, "ready_for_pickup")}>Marcar listo</button>}
          <button className="secondary-button" type="button" onClick={() => printThermalTicket(order)}><Printer size={16} /> Imprimir ticket 58 mm</button>
          <button className="secondary-button" disabled={busyOrderId === order._id} onClick={() => void move(order._id, "cancelled")}>Incidencia</button>
        </div>
      </article>)}</div>
      : <p className="empty-copy">No hay pedidos pendientes en cocina.</p>}
    {printingOrder && <div className="thermal-ticket" aria-hidden="true">
      <header><strong>{printingOrder.restaurant?.name || "ESTABLECIMIENTO PARTNER"}</strong><span>TICKET OFICIAL DE PEDIDO · PIKI DELIVERY</span>{printingOrder.restaurant?.address && <span>{printingOrder.restaurant.address}</span>}{printingOrder.restaurant?.phone && <span>{printingOrder.restaurant.phone}</span>}</header>
      <div className="thermal-rule" />
      <section className="thermal-order-id"><b>#{printingOrder.publicCode || printingOrder._id}</b><span>{new Date(printingOrder.createdAt).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}</span></section>
      <p className="thermal-status">{labels[printingOrder.status] || printingOrder.status}</p>
      <p className="thermal-line"><span>Cliente</span><b>{printingOrder.customer?.name || "Cliente PIKI"}</b></p>
      <p className="thermal-line"><span>Dirección</span><b>{printingOrder.deliveryAddress || "—"}</b></p>
      <div className="thermal-rule" />
      <ul>{(printingOrder.items || []).map((item, index) => { const unitPriceCents = item.priceCents ?? item.unitPriceCents; return <li key={`${printingOrder._id}-ticket-${index}`}><span>{item.quantity || 1} × {item.name || "Producto"}{(item.selectedOptions || []).map((option, optionIndex) => <small key={`${printingOrder._id}-ticket-${index}-option-${optionIndex}`}>+ {option.groupName ? `${option.groupName}: ` : ""}{option.optionName || "Opción"}</small>)}</span>{unitPriceCents != null && <b>{((unitPriceCents * (item.quantity || 1)) / 100).toFixed(2).replace(".", ",")} €</b>}</li>; })}</ul>
      <div className="thermal-rule" />
      <p className="thermal-line"><span>Pago</span><b>{isCashOrder(printingOrder) ? "EFECTIVO · cobra Rider" : "PAGADO ONLINE"}</b></p>
      <p className="thermal-line"><span>Total</span><b>{(Number(printingOrder.totalCents || 0) / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</b></p>
      {printingOrder.pickupPin && <><div className="thermal-rule" /><p className="thermal-pickup-label">ENTREGA AL RIDER</p><p className="thermal-pin">{printingOrder.pickupPin}</p><p className="thermal-help">Muestra este PIN o el QR de recogida cuando el pedido esté listo.</p></>}
      <footer>Gracias por colaborar con PIKI<br />partners.pikidelivery.com</footer>
    </div>}
  </section>;
}
