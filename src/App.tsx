import { useEffect, useMemo, useState } from "react";
import { BarChart3, Bell, ChevronDown, ClipboardList, Headphones, LayoutDashboard, Menu, Megaphone, PackageOpen, Settings, ShieldCheck, Store, Users, WalletCards, X } from "lucide-react";
import "./App.css";
import EmployeeAuthGate from "./EmployeeAuthGate";
import PartnerDashboard from "./PartnerDashboard";
import { AnalyticsWorkspace, CatalogWorkspace, FinanceWorkspace, OrdersWorkspace, PromotionsWorkspace, SettingsWorkspace, SupportWorkspace, TeamWorkspace } from "./PartnerModules";

type View = "Resumen" | "Pedidos" | "Catálogo" | "Promociones" | "Analítica" | "Finanzas" | "Equipo" | "Soporte" | "Ajustes";
type NavItem = { label: View; icon: typeof LayoutDashboard; badge?: number };

const apiOrigin = (import.meta.env.VITE_API_URL ?? "https://api.pikidelivery.com").replace(/\/$/, "");
const partnerTokenKey = `piki-${location.hostname}-api-token`;
const demoMode = import.meta.env.DEV && new URLSearchParams(window.location.search).get("demo") === "1";

function readPartnerToken(): string {
  const persisted = localStorage.getItem(partnerTokenKey);
  if (persisted) return persisted;
  const legacy = sessionStorage.getItem(partnerTokenKey);
  if (legacy) { localStorage.setItem(partnerTokenKey, legacy); sessionStorage.removeItem(partnerTokenKey); return legacy; }
  return "";
}

function persistPartnerToken(token: string): void { localStorage.setItem(partnerTokenKey, token); sessionStorage.removeItem(partnerTokenKey); }

const navSections: Array<{ label: string; items: NavItem[] }> = [
  { label: "OPERACIONES", items: [{ label: "Resumen", icon: LayoutDashboard }, { label: "Pedidos", icon: ClipboardList, badge: 2 }, { label: "Catálogo", icon: PackageOpen }] },
  { label: "CRECIMIENTO", items: [{ label: "Promociones", icon: Megaphone }, { label: "Analítica", icon: BarChart3 }] },
  { label: "GESTIÓN", items: [{ label: "Finanzas", icon: WalletCards }, { label: "Equipo", icon: Users }, { label: "Soporte", icon: Headphones }, { label: "Ajustes", icon: Settings }] },
];

function App() {
  const [activeView, setActiveView] = useState<View>("Resumen");
  const [menuOpen, setMenuOpen] = useState(false);
  const [apiToken, setApiToken] = useState(demoMode ? "demo-token" : readPartnerToken);
  const [authRequired, setAuthRequired] = useState(false);
  const [checkingSession, setCheckingSession] = useState(!demoMode && Boolean(apiToken));
  const [storeOpen, setStoreOpen] = useState(true);

  function clearSession() { localStorage.removeItem(partnerTokenKey); sessionStorage.removeItem(partnerTokenKey); setApiToken(""); setAuthRequired(true); setCheckingSession(false); }

  useEffect(() => {
    if (demoMode || !apiToken) { setCheckingSession(false); return; }
    let cancelled = false;
    void fetch(`${apiOrigin}/api/v1/auth/employee/me`, { headers: { Authorization: `Bearer ${apiToken}`, "X-PIKI-Surface": "partner" }, cache: "no-store" }).then((response) => {
      if (cancelled) return;
      if (!response.ok) clearSession(); else setCheckingSession(false);
    }).catch(() => { if (!cancelled) setCheckingSession(false); });
    return () => { cancelled = true; };
  }, [apiToken]);

  const activeNavigation = useMemo(() => navSections.flatMap((section) => section.items), []);
  const currentNav = activeNavigation.find((item) => item.label === activeView);
  function selectView(view: View) { if (!demoMode && !apiToken) setAuthRequired(true); setActiveView(view); setMenuOpen(false); }
  if (checkingSession) return <main className="page-content"><p className="status-pill">Comprobando sesión de partner…</p></main>;
  if (!demoMode && (!apiToken || authRequired)) return <main className="page-content auth-page"><EmployeeAuthGate apiOrigin={apiOrigin} onAuthenticated={(token) => { persistPartnerToken(token); setApiToken(token); setAuthRequired(false); window.dispatchEvent(new Event("piki-authenticated")); }} /></main>;

  const renderView = () => {
    if (activeView === "Resumen") return <PartnerDashboard apiOrigin={apiOrigin} token={apiToken} demoMode={demoMode} onUnauthorized={clearSession} onNavigate={(view) => selectView(view as View)} />;
    if (activeView === "Pedidos") return <OrdersWorkspace apiOrigin={apiOrigin} token={apiToken} demoMode={demoMode} onUnauthorized={clearSession} />;
    if (activeView === "Catálogo") return <CatalogWorkspace apiOrigin={apiOrigin} token={apiToken} onUnauthorized={clearSession} />;
    if (activeView === "Promociones") return <PromotionsWorkspace />;
    if (activeView === "Analítica") return <AnalyticsWorkspace />;
    if (activeView === "Finanzas") return <FinanceWorkspace />;
    if (activeView === "Equipo") return <TeamWorkspace />;
    if (activeView === "Soporte") return <SupportWorkspace />;
    return <SettingsWorkspace storeOpen={storeOpen} onToggleStore={() => setStoreOpen((value) => !value)} />;
  };

  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`} aria-label="Navegación principal">
      <div className="brand-block"><div className="brand-mark">P</div><div><strong>piki</strong><span>Partners</span></div><button className="close-menu" type="button" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)}><X size={20} /></button></div>
      <div className="sidebar-store-card"><span className="store-avatar"><Store size={16} /></span><span><strong>La Esquina de PIKI</strong><small>{storeOpen ? "Abierto ahora" : "Cerrado"}</small></span><ChevronDown size={14} /></div>
      <nav className="nav-list">{navSections.map((section) => <div className="nav-section" key={section.label}><p className="nav-label">{section.label}</p>{section.items.map(({ label, icon: Icon, badge }) => <button className={`nav-item ${activeView === label ? "nav-item-active" : ""}`} key={label} type="button" onClick={() => selectView(label)}><Icon size={17} strokeWidth={activeView === label ? 2.4 : 1.9} /><span>{label}</span>{badge && <b className="nav-badge">{badge}</b>}</button>)}</div>)}</nav>
      <div className="sidebar-footer"><span className="support-dot" /><div><strong>Todo funciona bien</strong><span>API de PIKI conectada</span></div><ShieldCheck size={15} /></div>
    </aside>
    {menuOpen && <button className="backdrop" type="button" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)} />}
    <main className="main-content"><header className="topbar"><button className="menu-button" type="button" aria-label="Abrir menú" onClick={() => setMenuOpen(true)}><Menu size={21} /></button><div className="breadcrumb"><span>Partners</span><span className="breadcrumb-separator">/</span><strong>{currentNav?.label || "Resumen"}</strong></div><div className="topbar-actions"><button className="help-topbar" type="button" onClick={() => selectView("Soporte")}><CircleHelpIcon size={16} /> Ayuda</button><button className="icon-button notification-button" type="button" aria-label="Notificaciones" onClick={() => selectView("Pedidos")}><Bell size={18} /><i /></button><div className="user-avatar" aria-label="Usuario de PIKI">LM</div></div></header><section className="page-content">{renderView()}</section></main>
  </div>;
}

function CircleHelpIcon({ size }: { size?: number }) { return <span style={{ display: "inline-grid", placeItems: "center", width: size || 16, height: size || 16, border: "1.5px solid currentColor", borderRadius: "50%", fontSize: size ? `${Math.max(10, size - 5)}px` : "11px", lineHeight: 1, fontWeight: 800 }}>?</span>; }

export default App;
