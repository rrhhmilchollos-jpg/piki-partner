import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, RefreshCw } from "lucide-react";
import { apiOrigin, partnerHeaders } from "./partnerApi";
import { visibleOrderReference } from "./orderReference";

type ArchivedOrder = {
  _id: string;
  publicCode?: string;
  status: "delivered" | "cancelled";
  createdAt: string;
  archivedAt?: string | null;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
  deliveryAddress?: string;
  totalCents?: number;
  customer?: { name?: string } | null;
  items?: { name?: string; quantity?: number }[];
};

function money(cents?: number): string {
  return ((cents ?? 0) / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}
function dateLabel(order: ArchivedOrder): string {
  const value = order.archivedAt || order.deliveredAt || order.cancelledAt || order.createdAt;
  return new Date(value).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });
}

export default function ArchivedOrdersBoard({ token, locationId, canRead, onUnauthorized }: { token: string; locationId?: string; canRead: boolean; onUnauthorized: () => void }) {
  const [orders, setOrders] = useState<ArchivedOrder[]>([]);
  const nextBeforeRef = useRef<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const headers = useMemo(() => partnerHeaders(token, locationId), [token, locationId]);

  const load = useCallback(async (append = false) => {
    if (!canRead) { setOrders([]); setMessage("Este perfil no tiene permiso para consultar el historial de este local."); setLoading(false); return; }
    setLoading(true);
    try {
      const before = append && nextBeforeRef.current ? `&before=${encodeURIComponent(nextBeforeRef.current)}` : "";
      const response = await fetch(`${apiOrigin}/api/v1/partners/kitchen/orders/archive?limit=100${before}`, { headers, cache: "no-store" });
      if (response.status === 401) { onUnauthorized(); return; }
      if (response.status === 403) { setMessage("No tienes permiso para consultar el historial de este local."); return; }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json() as { orders?: ArchivedOrder[]; nextBefore?: string | null; hasMore?: boolean };
      setOrders((current) => append ? [...current, ...(payload.orders ?? [])] : (payload.orders ?? []));
      nextBeforeRef.current = payload.nextBefore ?? null;
      setHasMore(Boolean(payload.hasMore));
      setMessage("");
    } catch { setMessage("No se ha podido cargar el archivo. Conservamos la última consulta."); }
    finally { setLoading(false); }
  }, [canRead, headers, onUnauthorized]);

  useEffect(() => {
    // Reload when the selected partner location changes.
    // oxlint-disable-next-line react/set-state-in-effect
    void load(false);
  }, [load, locationId]);

  return <section className="orders-workspace" aria-label="Historial de pedidos PIKI Partner Orders">
    <header className="orders-heading">
      <div><p className="section-kicker">ARCHIVO DEL PARTNER</p><h1>Historial de pedidos</h1><p>Las comandas entregadas o canceladas salen de la operación activa y quedan guardadas aquí para revisión.</p></div>
      <button type="button" className="support-trigger" onClick={() => void load(false)} disabled={loading}><RefreshCw size={16} /> Actualizar</button>
    </header>
    {message && <p className="orders-message" role="status"><Archive size={17} />{message}</p>}
    {loading && !orders.length ? <div className="orders-loading">Cargando archivo…</div> : orders.length ? <div className="orders-board archive-board">
      <section className="order-lane lane-archived" aria-label="Pedidos archivados"><header className="lane-header"><div><h2>Completados y cerrados<span>{orders.length}</span></h2><p>Solo lectura · los pedidos no se pueden modificar</p></div></header>
        <div className="lane-cards">{orders.map((order) => <article key={order._id} className="order-card archived-order-card">
          <div className="order-card-top"><div><span className="order-code">{visibleOrderReference(order.publicCode, order._id)}</span><small>{order.customer?.name || "Cliente PIKI"}</small><small>{dateLabel(order)}</small></div><strong className={`archive-status archive-status-${order.status}`}>{order.status === "delivered" ? "ENTREGADO" : "CANCELADO"}</strong></div>
          <ul className="order-items">{(order.items ?? []).map((item, index) => <li key={`${order._id}-${index}`}><b>{item.quantity ?? 1}×</b><span><strong>{item.name || "Producto"}</strong></span></li>)}</ul>
          {order.deliveryAddress && <p className="order-address"><span>Dirección</span>{order.deliveryAddress}</p>}
          <div className="order-meta"><span>Importe final</span><strong>{money(order.totalCents)}</strong></div>
        </article>)}</div>
      </section>
    </div> : <div className="orders-loading"><Archive size={24} />Todavía no hay pedidos archivados en este local.</div>}
    {hasMore && <button type="button" className="support-submit archive-load-more" onClick={() => void load(true)} disabled={loading}>{loading ? "Cargando…" : "Cargar más pedidos"}</button>}
  </section>;
}
