import { useCallback, useEffect, useRef, useState } from "react";
import { connectPikiRealtime } from "./realtime";

type Order = { _id: string; status: string; paymentState?: string; createdAt: string; deliveryAddress?: string; items?: { name?: string; quantity?: number }[] };

const labels: Record<string, string> = { pending: "Nuevo", accepted: "Aceptado", preparing: "En preparación", ready_for_pickup: "Listo para recoger" };

export default function KitchenScreen({ apiOrigin, token, pdaMode = false }: { apiOrigin: string; token: string; pdaMode?: boolean }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [message, setMessage] = useState("");
  const alarmOrders = useRef(new Set<string>());
  const audioContext = useRef<AudioContext | null>(null);
  const headers = { Authorization: `Bearer ${token}` };
  const beep = useCallback(() => {
    try {
      const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return;
      const audio = audioContext.current ?? new AudioContextCtor();
      audioContext.current = audio;
      void audio.resume();
      const now = audio.currentTime;
      [0, 0.16].forEach((offset, index) => {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.type = "square";
        oscillator.frequency.value = index ? 980 : 740;
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.15, now + offset + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.12);
        oscillator.connect(gain); gain.connect(audio.destination);
        oscillator.start(now + offset); oscillator.stop(now + offset + 0.13);
      });
      if ("vibrate" in navigator) navigator.vibrate([140, 70, 140]);
    } catch { /* Audio may require a user gesture on the first alert. */ }
  }, []);
  const syncPendingAlarm = useCallback((nextOrders: Order[]) => {
    const next = new Set(nextOrders.filter((order) => order.status === "pending" && order.paymentState === "paid").map((order) => order._id));
    const hadAlarms = alarmOrders.current.size > 0;
    alarmOrders.current = next;
    if (!hadAlarms && next.size) beep();
  }, [beep]);
  const load = useCallback(async () => {
    const response = await fetch(`${apiOrigin}/api/v1/partners/kitchen/orders`, { headers });
    if (!response.ok) return;
    const next = ((await response.json()).orders || []) as Order[];
    setOrders(next); syncPendingAlarm(next);
  }, [apiOrigin, token, syncPendingAlarm]);
  useEffect(() => { void load(); const id = window.setInterval(() => void load(), 30_000); return () => window.clearInterval(id); }, [load]);
  useEffect(() => {
    const id = window.setInterval(() => { if (alarmOrders.current.size) beep(); }, 1_100);
    return () => window.clearInterval(id);
  }, [beep]);
  useEffect(() => connectPikiRealtime({ apiOrigin, token, surface: "partner", onEvent: (event) => {
    if (event.type === "order.awaiting_partner_acceptance") {
      const id = String(event.payload.orderId || "");
      if (id) alarmOrders.current.add(id);
      beep(); setMessage("Nuevo pedido pagado. Acepta el pedido para detener la alarma y activar el reparto.");
    }
    void load();
  } }), [apiOrigin, token, load, beep]);
  useEffect(() => () => { try { void audioContext.current?.close(); } catch { /* noop */ } }, []);
  async function move(id: string, status: string) {
    const response = await fetch(`${apiOrigin}/api/v1/partners/kitchen/orders/${id}/status`, { method: "PATCH", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (response.ok && status === "accepted") alarmOrders.current.delete(id);
    setMessage(response.ok ? status === "accepted" ? "Pedido aceptado. La alarma se ha detenido y Fleet podrá asignar un rider." : "Pedido actualizado correctamente" : "No se pudo actualizar el pedido");
    await load();
  }
  const activeAlarm = alarmOrders.current.size > 0;
  return <section className={`application-table ${pdaMode ? "pda-kitchen" : ""}`} aria-label="Pantalla de cocina PIKI">
    <div className="table-heading"><div><p className="eyebrow">{pdaMode ? "PIKI PDA · COCINA" : "OPERACIÓN DE COCINA"}</p><h1>Pedidos en cocina</h1><p className="lead">Los pedidos pagados llegan al instante. Acepta para detener la alarma y permitir que Fleet busque rider.</p></div><button className="secondary-button" onClick={() => void load()}>Actualizar</button></div>
    {activeAlarm && <p className="status-pill" role="alert">Alarma activa: hay {alarmOrders.current.size} pedido(s) pagado(s) esperando aceptación.</p>}
    {message && <p className="status-pill" role="status">{message}</p>}
    {orders.length ? <div className="pda-order-grid">{orders.map((order) => <article className="application-row pda-order-card" key={order._id}><div><strong>Pedido {order._id.slice(-6)}</strong><span className={`kitchen-status status-${order.status}`}>{labels[order.status] || order.status}</span><small>{new Date(order.createdAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })} · {order.deliveryAddress || "Dirección disponible"}</small><ul>{(order.items || []).map((item, index) => <li key={`${order._id}-${index}`}>{item.quantity || 1} × {item.name || "Producto"}</li>)}</ul></div><div className="pda-actions">{order.status === "pending" && <button className="primary-button" onClick={() => void move(order._id, "accepted")}>Aceptar pedido</button>}{order.status === "accepted" && <button className="primary-button" onClick={() => void move(order._id, "preparing")}>Comenzar preparación</button>}{order.status === "preparing" && <button className="primary-button" onClick={() => void move(order._id, "ready_for_pickup")}>Marcar listo</button>}<button className="secondary-button" onClick={() => void move(order._id, "cancelled")}>Incidencia</button></div></article>)}</div> : <p className="empty-copy">No hay pedidos pendientes en cocina.</p>}
  </section>;
}
