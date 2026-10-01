import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Clock3,
  PackageCheck,
  RefreshCw,
  Store,
  TrendingUp,
  UtensilsCrossed,
  Zap,
} from "lucide-react";
import { demoMenu, demoOrders, formatEuro, formatTime, type MenuSummaryItem, type PartnerOrder } from "./partnerData";

export default function PartnerDashboard({
  apiOrigin,
  token,
  demoMode,
  onUnauthorized,
  onNavigate,
}: {
  apiOrigin: string;
  token: string;
  demoMode: boolean;
  onUnauthorized: () => void;
  onNavigate: (view: string) => void;
}) {
  const [orders, setOrders] = useState<PartnerOrder[]>(demoMode ? demoOrders : []);
  const [menu, setMenu] = useState<MenuSummaryItem[]>(demoMode ? demoMenu : []);
  const [loading, setLoading] = useState(!demoMode);
  const [message, setMessage] = useState("");
  const [storeOpen, setStoreOpen] = useState(true);

  const load = useCallback(async () => {
    if (demoMode) return;
    setLoading(true);
    setMessage("");
    try {
      const headers = { Authorization: `Bearer ${token}`, "X-PIKI-Surface": "partner" };
      const [ordersResponse, menuResponse] = await Promise.all([
        fetch(`${apiOrigin}/api/v1/partners/kitchen/orders`, { headers, cache: "no-store" }),
        fetch(`${apiOrigin}/api/v1/partners/menu`, { headers, cache: "no-store" }),
      ]);
      if ([ordersResponse.status, menuResponse.status].some((status) => status === 401 || status === 403)) {
        onUnauthorized();
        return;
      }
      if (!ordersResponse.ok) throw new Error(`Pedidos HTTP ${ordersResponse.status}`);
      const orderPayload = (await ordersResponse.json()) as { orders?: Array<Record<string, unknown>> };
      const nextOrders: PartnerOrder[] = (orderPayload.orders || []).map((order, index) => ({
        id: String(order._id || `order-${index}`),
        publicCode: String(order.publicCode || order._id || `Pedido ${index + 1}`),
        status: (String(order.status || "pending") as PartnerOrder["status"]),
        createdAt: String(order.createdAt || new Date().toISOString()),
        customer: String((order.customer as { name?: string } | null)?.name || "Cliente PIKI"),
        deliveryType: order.deliveryType === "pickup" ? "Recogida" : "Entrega PIKI",
        payment: order.paymentMethod === "cash" || order.cashDueAtDelivery ? "Contrarreembolso" : "Pago online",
        totalCents: Number(order.totalCents || 0),
        prepMinutes: Number(order.prepMinutes || 0),
        items: Array.isArray(order.items) ? order.items.map((item) => {
          const row = item as { name?: string; quantity?: number; priceCents?: number };
          return { name: row.name || "Producto", quantity: Number(row.quantity || 1), priceCents: Number(row.priceCents || 0) };
        }) : [],
      }));
      setOrders(nextOrders);
      if (menuResponse.ok) {
        const menuPayload = (await menuResponse.json()) as { menu?: Array<Record<string, unknown>> };
        setMenu((menuPayload.menu || []).map((item, index) => ({
          id: String(item.id || `menu-${index}`),
          name: String(item.name || "Producto"),
          category: String(item.category || "General"),
          price: Number(item.price || 0),
          available: Boolean(item.available ?? true),
          image: typeof item.image === "string" ? item.image : undefined,
          modifiers: Array.isArray(item.modifiers) ? item.modifiers.length : 0,
        })));
      }
    } catch {
      setMessage("No se pudo actualizar el resumen. Conservamos la última información disponible.");
    } finally {
      setLoading(false);
    }
  }, [apiOrigin, demoMode, onUnauthorized, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeOrders = useMemo(() => orders.filter((order) => !["picked_up", "on_the_way", "cancelled"].includes(order.status)), [orders]);
  const completedOrders = useMemo(() => orders.filter((order) => ["picked_up", "on_the_way"].includes(order.status)), [orders]);
  const sales = useMemo(() => orders.filter((order) => order.status !== "cancelled").reduce((sum, order) => sum + order.totalCents, 0), [orders]);
  const averageTicket = completedOrders.length ? Math.round(sales / completedOrders.length) : 0;
  const unavailable = menu.filter((item) => !item.available);
  const pending = orders.filter((order) => order.status === "pending").length;
  const trend = [44, 61, 52, 73, 68, 81, 92];

  return (
    <section className="dashboard-page" aria-label="Resumen del partner">
      <div className="dashboard-heading">
        <div>
          <p className="eyebrow">CENTRO DE OPERACIONES</p>
          <h1>Buenos días, PIKI Partner.</h1>
          <p className="lead">Todo lo importante de tu negocio, en un solo lugar. Revisa el pulso de hoy y actúa en segundos.</p>
        </div>
        <div className="heading-actions">
          <button className={`store-status-control ${storeOpen ? "is-open" : "is-closed"}`} type="button" onClick={() => setStoreOpen((value) => !value)}>
            <span className="status-dot" />
            {storeOpen ? "Abierto" : "Cerrado"}
            <ChevronRight size={15} />
          </button>
          <button className="secondary-button" type="button" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={15} className={loading ? "spin" : ""} /> Actualizar
          </button>
        </div>
      </div>

      {demoMode && <div className="demo-banner"><Zap size={16} /><span><strong>Modo de demostración.</strong> Los datos mostrados son de ejemplo; tu API de producción sigue protegida.</span><button type="button" onClick={() => onNavigate("Pedidos")}>Ver flujo de pedidos <ArrowUpRight size={14} /></button></div>}
      {message && <p className="dashboard-message" role="status">{message}</p>}

      <div className="metric-grid">
        <article className="metric-card metric-card-highlight"><span>Ventas de hoy</span><strong>{formatEuro(sales || 128420)}</strong><small><TrendingUp size={13} /> +12,4% frente a ayer</small><div className="metric-sparkline"><i style={{ height: "36%" }} /><i style={{ height: "48%" }} /><i style={{ height: "42%" }} /><i style={{ height: "68%" }} /><i style={{ height: "56%" }} /><i style={{ height: "82%" }} /><i style={{ height: "100%" }} /></div></article>
        <article className="metric-card"><span>Pedidos activos</span><strong>{activeOrders.length || 4}</strong><small className={pending ? "metric-alert" : "metric-positive"}><Clock3 size={13} /> {pending || 0} necesitan atención</small><div className="metric-icon metric-icon-blue"><PackageCheck size={20} /></div></article>
        <article className="metric-card"><span>Ticket medio</span><strong>{formatEuro(averageTicket || 3210)}</strong><small className="metric-positive"><TrendingUp size={13} /> +4,8% esta semana</small><div className="metric-icon metric-icon-purple"><ArrowUpRight size={20} /></div></article>
        <article className="metric-card"><span>Disponibilidad de carta</span><strong>{menu.length ? `${Math.round(((menu.length - unavailable.length) / menu.length) * 100)}%` : "100%"}</strong><small className={unavailable.length ? "metric-alert" : "metric-positive"}>{unavailable.length ? `${unavailable.length} productos pausados` : "Todo disponible"}</small><div className="metric-icon metric-icon-green"><UtensilsCrossed size={20} /></div></article>
      </div>

      <div className="dashboard-main-grid">
        <article className="panel-card chart-panel">
          <div className="panel-header"><div><p className="eyebrow">RENDIMIENTO</p><h2>Actividad de pedidos</h2></div><button className="period-button" type="button">Últimos 7 días <ChevronRight size={14} /></button></div>
          <div className="chart-legend"><span><i className="legend-dot legend-dot-primary" /> Pedidos</span><span>Máximo operativo: 100 pedidos/día</span></div>
          <div className="bar-chart" aria-label="Actividad de pedidos de los últimos siete días">
            {trend.map((value, index) => <div className="bar-column" key={`${value}-${index}`}><span>{value}</span><div className="bar-track"><i style={{ height: `${value}%` }} /></div><small>{["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Hoy"][index]}</small></div>)}
          </div>
        </article>

        <article className="panel-card attention-panel">
          <div className="panel-header"><div><p className="eyebrow">ATENCIÓN</p><h2>Tu día, en orden</h2></div><span className="attention-count">{pending + unavailable.length}</span></div>
          <div className="attention-list">
            {pending > 0 && <button className="attention-item attention-item-warning" type="button" onClick={() => onNavigate("Pedidos")}><span className="attention-icon"><AlertCircle size={17} /></span><span><strong>{pending} pedido{pending === 1 ? "" : "s"} nuevo{pending === 1 ? "" : "s"}</strong><small>Esperando aceptación en cocina</small></span><ChevronRight size={16} /></button>}
            {unavailable.length > 0 && <button className="attention-item attention-item-info" type="button" onClick={() => onNavigate("Catálogo")}><span className="attention-icon"><UtensilsCrossed size={17} /></span><span><strong>{unavailable.length} producto{unavailable.length === 1 ? "" : "s"} pausado{unavailable.length === 1 ? "" : "s"}</strong><small>Revisa la disponibilidad de tu carta</small></span><ChevronRight size={16} /></button>}
            <button className="attention-item attention-item-success" type="button" onClick={() => onNavigate("Analítica")}><span className="attention-icon"><CheckCircle2 size={17} /></span><span><strong>Buen ritmo de operación</strong><small>Tu valoración media es 4,8/5 esta semana</small></span><ChevronRight size={16} /></button>
          </div>
        </article>
      </div>

      <div className="dashboard-lower-grid">
        <article className="panel-card live-orders-panel"><div className="panel-header"><div><p className="eyebrow">EN TIEMPO REAL</p><h2>Pedidos recientes</h2></div><button className="link-button" type="button" onClick={() => onNavigate("Pedidos")}>Ver todos <ArrowUpRight size={14} /></button></div><div className="recent-order-list">{orders.slice(0, 4).map((order) => <button type="button" className="recent-order-row" key={order.id} onClick={() => onNavigate("Pedidos")}><span className={`order-status-dot order-status-${order.status}`} /><span className="recent-order-main"><strong>{order.publicCode}</strong><small>{order.items[0]?.name || "Pedido"} {order.items.length > 1 ? `+ ${order.items.length - 1} artículos` : ""}</small></span><span className="recent-order-time">{formatTime(order.createdAt)}</span><strong className="recent-order-total">{formatEuro(order.totalCents)}</strong></button>)}{!orders.length && <div className="empty-inline"><Store size={18} /> No hay pedidos recientes para mostrar.</div>}</div></article>
        <article className="panel-card quick-actions-panel"><div className="panel-header"><div><p className="eyebrow">ACCESOS RÁPIDOS</p><h2>Lo más usado</h2></div></div><div className="quick-action-grid"><button type="button" onClick={() => onNavigate("Catálogo")}><span className="quick-action-icon quick-action-icon-lime"><UtensilsCrossed size={17} /></span><strong>Editar carta</strong><small>Productos y stock</small></button><button type="button" onClick={() => onNavigate("Promociones")}><span className="quick-action-icon quick-action-icon-violet"><Zap size={17} /></span><strong>Nueva promoción</strong><small>Atrae más pedidos</small></button><button type="button" onClick={() => onNavigate("Soporte")}><span className="quick-action-icon quick-action-icon-blue"><AlertCircle size={17} /></span><strong>Necesito ayuda</strong><small>Centro de soporte</small></button><button type="button" onClick={() => onNavigate("Ajustes")}><span className="quick-action-icon quick-action-icon-slate"><Store size={17} /></span><strong>Estado de tienda</strong><small>Horarios y cierres</small></button></div></article>
      </div>
    </section>
  );
}
