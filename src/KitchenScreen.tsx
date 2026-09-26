import { useCallback, useEffect, useMemo, useState } from "react";
import { PartnerOrderAlarmBanner, type PartnerKitchenOrder, usePartnerOrderAlarm } from "./PartnerOrderAlarm";
import { connectPikiRealtime } from "./realtime";

type Order = PartnerKitchenOrder & {
  createdAt: string;
  deliveryAddress?: string;
  items?: { name?: string; quantity?: number }[];
  totalCents?: number;
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

export default function KitchenScreen({ apiOrigin, token, pdaMode = false }: { apiOrigin: string; token: string; pdaMode?: boolean }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [message, setMessage] = useState("");
  const [busyOrderId, setBusyOrderId] = useState("");
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
      if (!response.ok) { setMessage(response.status === 401 || response.status === 403 ? "Sesión de partner no autorizada. Vuelve a iniciar sesión." : `No se pudo sincronizar cocina (HTTP ${response.status}).`); return; }
      const next = ((await response.json()).orders || []) as Order[];
      setOrders(next);
      reconcileKitchenOrders(next);
    } catch {
      setMessage("No hay conexión con la API. Conserva la última lista hasta recuperar sincronización.");
    }
  }, [apiOrigin, headers, reconcileKitchenOrders]);

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
        setMessage(isCashOrder(event.payload) ? "Nuevo pedido en efectivo. El Rider cobrará el importe exacto al entregar." : "Nuevo pedido pagado. Acepta el pedido para detener la alarma y activar el reparto.");
      }
      void load();
    },
  }), [apiOrigin, token, load, notifyPaidOrder]);

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
          ? "Pedido aceptado. La alarma se ha detenido y Fleet podrá asignar un rider."
          : "Pedido actualizado correctamente"
        : body.message || body.error || `No se pudo actualizar el pedido (HTTP ${response.status}).`);
      await load();
    } catch {
      setMessage("Error de red actualizando el pedido. Revisa la conexión antes de repetir.");
      await load();
    } finally { setBusyOrderId(""); }
  }

  return <section className={`application-table ${pdaMode ? "pda-kitchen" : ""}`} aria-label="Pantalla de cocina PIKI">
    <div className="table-heading">
      <div>
        <p className="eyebrow">{pdaMode ? "PIKI PDA · COCINA" : "OPERACIÓN DE COCINA"}</p>
        <h1>Pedidos en cocina</h1>
        <p className="lead">Los pedidos activos llegan al instante. Si son en efectivo, el Rider cobrará el importe exacto al entregar.</p>
      </div>
      <button className="secondary-button" onClick={() => void load()}>Actualizar</button>
    </div>
    <PartnerOrderAlarmBanner count={activeCount} audioReady={audioReady} onEnableAudio={() => { void prepareAudio(); }} />
    {message && <p className="status-pill" role="status">{message}</p>}
    {orders.length
      ? <div className="pda-order-grid">{orders.map((order) => <article className="application-row pda-order-card" key={order._id}>
        <div>
          <strong>Pedido {order._id.slice(-6)}</strong>
          <span className={`kitchen-status status-${order.status}`}>{labels[order.status] || order.status}</span>
          <small>{new Date(order.createdAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })} · {order.deliveryAddress || "Dirección disponible"}</small><small>{isCashOrder(order) ? `EFECTIVO · cobra Rider ${(Number(order.totalCents || 0) / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}` : "Pago online confirmado"}</small>
          <ul>{(order.items || []).map((item, index) => <li key={`${order._id}-${index}`}>{item.quantity || 1} × {item.name || "Producto"}</li>)}</ul>
        </div>
        <div className="pda-actions">
          {order.status === "pending" && <button className="primary-button" disabled={busyOrderId === order._id} onClick={() => void move(order._id, "accepted")}>{busyOrderId === order._id ? "Aceptando…" : "Aceptar pedido"}</button>}
          {order.status === "accepted" && <button className="primary-button" disabled={busyOrderId === order._id} onClick={() => void move(order._id, "preparing")}>Comenzar preparación</button>}
          {order.status === "preparing" && <button className="primary-button" disabled={busyOrderId === order._id} onClick={() => void move(order._id, "ready_for_pickup")}>Marcar listo</button>}
          <button className="secondary-button" disabled={busyOrderId === order._id} onClick={() => void move(order._id, "cancelled")}>Incidencia</button>
        </div>
      </article>)}</div>
      : <p className="empty-copy">No hay pedidos pendientes en cocina.</p>}
  </section>;
}
