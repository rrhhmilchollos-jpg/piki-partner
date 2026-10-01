import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, CircleAlert, RefreshCw, TrendingUp } from "lucide-react";
import { apiOrigin, partnerHeaders } from "./partnerApi";

/* oxlint-disable react/set-state-in-effect -- effects synchronise external reporting data. */

type Metrics = { orders?: number; revenueCents?: number; cancellations?: number; rating?: number; trend?: number };

function numeric(value: unknown): number | undefined { return typeof value === "number" && Number.isFinite(value) ? value : undefined; }
function extractMetrics(value: unknown): Metrics {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const overview = data.overview && typeof data.overview === "object" ? data.overview as Record<string, unknown> : data;
  return {
    orders: numeric(overview.orders ?? overview.totalOrders ?? overview.ordersToday),
    revenueCents: numeric(overview.revenueCents ?? overview.grossSalesCents ?? overview.salesCents),
    cancellations: numeric(overview.cancellations ?? overview.cancelledOrders),
    rating: numeric(overview.rating ?? overview.averageRating),
    trend: numeric(overview.trend ?? overview.orderTrend),
  };
}

function displayMoney(value?: number): string { return value == null ? "—" : (value / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" }); }

export default function PerformanceView({ token, locationId, canRead, onUnauthorized }: { token: string; locationId?: string; canRead: boolean; onUnauthorized: () => void }) {
  const [metrics, setMetrics] = useState<Metrics>({});
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");
  const headers = useMemo(() => partnerHeaders(token, locationId), [token, locationId]);

  const load = useCallback(async () => {
    if (!canRead) { setState("unavailable"); return; }
    setState("loading");
    try {
      const response = await fetch(`${apiOrigin}/api/v1/partners/metrics/overview?period=today`, { headers, cache: "no-store" });
      if (response.status === 401 || response.status === 403) { onUnauthorized(); return; }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setMetrics(extractMetrics(await response.json()));
      setState("ready");
    } catch { setMetrics({}); setState("unavailable"); }
  }, [canRead, headers, onUnauthorized]);

  useEffect(() => { void load(); }, [load]);
  const cards = [
    { label: "Pedidos hoy", value: metrics.orders?.toLocaleString("es-ES") ?? "—", hint: "Pedidos recibidos" },
    { label: "Ventas brutas", value: displayMoney(metrics.revenueCents), hint: "Antes de comisiones" },
    { label: "Cancelaciones", value: metrics.cancellations?.toLocaleString("es-ES") ?? "—", hint: "Pedidos cancelados" },
    { label: "Valoración", value: metrics.rating == null ? "—" : `${metrics.rating.toFixed(1)} / 5`, hint: "Media de clientes" },
  ];

  return <section className="performance-workspace" aria-label="Rendimiento del local">
    <header className="availability-heading"><div><p className="section-kicker">RESULTADOS DEL DÍA</p><h1>Rendimiento</h1><p>Una lectura rápida de la jornada, calculada con datos de PIKI.</p></div><button type="button" className="secondary-control" onClick={() => void load()}><RefreshCw size={17} />Actualizar</button></header>
    <div className="performance-hero"><div><TrendingUp size={25} /><span>HOY</span><strong>{metrics.trend == null ? "—" : `${metrics.trend >= 0 ? "+" : ""}${metrics.trend.toFixed(0)}%`}</strong><p>Variación de pedidos frente al periodo anterior.</p></div><BarChart3 size={92} aria-hidden="true" /></div>
    <div className="performance-grid">{cards.map((card) => <article key={card.label}><span>{card.label}</span><strong>{state === "loading" ? "…" : card.value}</strong><small>{card.hint}</small></article>)}</div>
    {state === "unavailable" && <aside className="metrics-unavailable"><CircleAlert size={20} /><div><strong>Aún no hay métricas sincronizadas para este local.</strong><p>La pantalla está lista para mostrar datos reales cuando el backend habilite el resumen `GET /api/v1/partners/metrics/overview`. No se muestran cifras de ejemplo.</p></div></aside>}
    {!canRead && <p className="permission-note">Este perfil no tiene acceso a indicadores de rendimiento.</p>}
  </section>;
}
