import { useCallback, useEffect, useState } from "react";
import { PartnerOrderAlarmBanner, type PartnerKitchenOrder, usePartnerOrderAlarm } from "./PartnerOrderAlarm";
import { connectPikiRealtime } from "./realtime";

type Order = PartnerKitchenOrder & {
  createdAt: string;
  deliveryAddress?: string;
  items?: { name?: string; quantity?: number }[];
};

const labels: Record<string, string> = {
  pending: "Nuevo",
  accepted: "Aceptado",
  preparing: "En preparación",
  ready_for_pickup: "Listo para recoger",
};

export default function KitchenScreen({ apiOrigin, token, pdaMode = false }: { apiOrigin: string; token: string; pdaMode?: boolean }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [message, setMessage] = useState("");
  const {
    activeCount,
    audioReady,
    prepareAudio,
    reconcileKitchenOrders,
    notifyPaidOrder,
    resolveOrder,
  } = usePartnerOrderAlarm();
  const headers = { Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    const response = await fetch(`${apiOrigin}/api/v1/partners/kitchen/orders`, { headers });
    if (!response.ok) return;
    const next = ((await response.json()).orders || []) as Order[];
    setOrders(next);
    reconcileKitchenOrders(next);
  }, [apiOrigin, token, reconcileKitchenOrders]);

  useEffect(() => {
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
        setMessage("Nuevo pedido pagado. Acepta el pedido para detener la alarma y activar el reparto.");
      }
      void load();
    },
  }), [apiOrigin, token, load, notifyPaidOrder]);

  async function move(id: string, status: string) {
    const response = await fetch(`${apiOrigin}/api/v1/partners/kitchen/orders/${id}/status`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (response.ok && status === "accepted") resolveOrder(id);
    setMessage(response.ok
      ? status === "accepted"
        ? "Pedido aceptado. La alarma se ha detenido y Fleet podrá asignar un rider."
        : "Pedido actualizado correctamente"
      : "No se pudo actualizar el pedido");
    await load();
  }

  return <section className={`application-table ${pdaMode ? "pda-kitchen" : ""}`} aria-label="Pantalla de cocina PIKI">
    <div className="table-heading">
      <div>
        <p className="eyebrow">{pdaMode ? "PIKI PDA · COCINA" : "OPERACIÓN DE COCINA"}</p>
        <h1>Pedidos en cocina</h1>
        <p className="lead">Los pedidos pagados llegan al instante. Acepta para detener la alarma y permitir que Fleet busque rider.</p>
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
          <small>{new Date(order.createdAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })} · {order.deliveryAddress || "Dirección disponible"}</small>
          <ul>{(order.items || []).map((item, index) => <li key={`${order._id}-${index}`}>{item.quantity || 1} × {item.name || "Producto"}</li>)}</ul>
        </div>
        <div className="pda-actions">
          {order.status === "pending" && <button className="primary-button" onClick={() => void move(order._id, "accepted")}>Aceptar pedido</button>}
          {order.status === "accepted" && <button className="primary-button" onClick={() => void move(order._id, "preparing")}>Comenzar preparación</button>}
          {order.status === "preparing" && <button className="primary-button" onClick={() => void move(order._id, "ready_for_pickup")}>Marcar listo</button>}
          <button className="secondary-button" onClick={() => void move(order._id, "cancelled")}>Incidencia</button>
        </div>
      </article>)}</div>
      : <p className="empty-copy">No hay pedidos pendientes en cocina.</p>}
  </section>;
}
