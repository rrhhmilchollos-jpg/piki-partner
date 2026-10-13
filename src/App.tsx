import { useCallback, useEffect, useState } from "react";
import { Archive, BarChart3, Bell, BookOpen, ChevronDown, CircleHelp, LogOut, Menu, PackageSearch, Phone, Store, X } from "lucide-react";
import "./App.css";
import EmployeeAuthGate from "./EmployeeAuthGate";
import MenuEditor from "./MenuEditor";
import MenuAvailability from "./MenuAvailability";
import OrdersBoard from "./OrdersBoard";
import ArchivedOrdersBoard from "./ArchivedOrdersBoard";
import PerformanceView from "./PerformanceView";
import PartnerOnboarding from "./PartnerOnboarding";
import { apiOrigin, displayRole, hasPermission, normalisePartnerProfile, partnerHeaders, type PartnerLocation, type PartnerProfile } from "./partnerApi";
import { visiblePartnerViews, type PartnerView } from "./partnerNavigation";
import { usePwaUpdateBlocker } from "./pwaUpdateRuntime";
import { partnerSessionIssue, shouldClearPartnerSession } from "./sessionRecovery";

/* oxlint-disable react/set-state-in-effect -- effects reconcile authenticated profile and active location. */

type View = PartnerView;
const tokenKey = `piki-${location.hostname}-api-token`;
const isPdaMode = location.hostname === "partners-pda.pikidelivery.com" || location.hostname.startsWith("partners-pda.");
const navigation: Array<{ id: View; label: string; icon: typeof Bell }> = [
  { id: "orders", label: "Pedidos", icon: Bell },
  { id: "history", label: "Historial", icon: Archive },
  { id: "catalog", label: "Carta del restaurante", icon: BookOpen },
  { id: "menu", label: "Disponibilidad", icon: PackageSearch },
  { id: "performance", label: "Rendimiento", icon: BarChart3 },
];

function storedToken(): string { return localStorage.getItem(tokenKey) || sessionStorage.getItem(tokenKey) || ""; }
function saveToken(token: string): void { localStorage.setItem(tokenKey, token); sessionStorage.removeItem(tokenKey); }

function confirmedOpen(payload: unknown, fallback: boolean): boolean {
  const data = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  if (typeof data.isOpen === "boolean") return data.isOpen;
  if (typeof data.open === "boolean") return data.open;
  return typeof data.status === "string" ? data.status.toLowerCase() === "open" : fallback;
}

function StoreStatusControl({ token, location, enabled, onUnauthorized }: { token: string; location: PartnerLocation; enabled: boolean; onUnauthorized: () => void }) {
  const [open, setOpen] = useState(location.isOpen ?? true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  usePwaUpdateBlocker("partner-store-status", busy);

  useEffect(() => { setOpen(location.isOpen ?? true); setMessage(""); }, [location.id, location.isOpen]);

  const toggle = async () => {
    if (!enabled || busy) return;
    const next = !open;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`${apiOrigin}/api/v1/partners/store/status`, {
        method: "PATCH",
        headers: { ...partnerHeaders(token, location.id), "Content-Type": "application/json" },
        body: JSON.stringify({ status: next ? "open" : "paused" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) { onUnauthorized(); return; }
      if (response.status === 403) { setMessage("Este perfil no puede cambiar el estado del local."); return; }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const applied = confirmedOpen(payload, next);
      setOpen(applied);
      setMessage(applied ? "Local abierto y confirmado." : "Local pausado y confirmado.");
    } catch {
      setMessage("El estado no se pudo sincronizar. El local conserva su último estado confirmado.");
    } finally { setBusy(false); }
  };

  return <div className={`store-control ${open ? "is-open" : "is-paused"}`}>
    <button type="button" role="switch" aria-checked={open} disabled={!enabled || busy} onClick={() => void toggle()}>
      <span className="store-toggle"><span /></span>
      <span><b>{open ? "ABIERTO" : "PAUSADO"}</b><small>{busy ? "Confirmando…" : open ? "Aceptando pedidos" : "No se reciben pedidos"}</small></span>
    </button>
    {message && <p role="status">{message}</p>}
  </div>;
}

function MissingAssignment({ onLogout }: { onLogout: () => void }) {
  return <main className="auth-page"><section className="orders-login-card">
    <p className="section-kicker">ACCESO PENDIENTE</p>
    <h2>No hay un local asignado</h2>
    <p>Tu sesión es válida, pero PIKI no ha recibido una asignación de establecimiento y permisos para este usuario. Contacta con tu administrador o soporte antes de operar pedidos.</p>
    <button type="button" className="login-submit" onClick={onLogout}>Cerrar sesión</button>
  </section></main>;
}

function SessionRecovery({ message, onRetry, onLogout }: { message: string; onRetry: () => void; onLogout: () => void }) {
  return <main className="auth-page"><section className="orders-login-card">
    <p className="section-kicker">CONEXIÓN PENDIENTE</p>
    <h2>Conservamos tu sesión</h2>
    <p>{message}</p>
    <button type="button" className="login-submit" onClick={onRetry}>Reintentar conexión</button>
    <button type="button" className="link-button" onClick={onLogout}>Cerrar sesión en este dispositivo</button>
  </section></main>;
}

function PartnerOperationsApp() {
  const [token, setToken] = useState(storedToken);
  const [profile, setProfile] = useState<PartnerProfile | null>(null);
  const [activeLocationId, setActiveLocationId] = useState("");
  const [checkingSession, setCheckingSession] = useState(Boolean(token));
  const [sessionIssue, setSessionIssue] = useState("");
  const [sessionRetry, setSessionRetry] = useState(0);
  const [activeView, setActiveView] = useState<View>("orders");
  const [menuOpen, setMenuOpen] = useState(false);

  const clearSession = useCallback(() => {
    localStorage.removeItem(tokenKey);
    sessionStorage.removeItem(tokenKey);
    setToken("");
    setProfile(null);
    setActiveLocationId("");
    setCheckingSession(false);
    setSessionIssue("");
  }, []);

  const retrySession = () => {
    setSessionIssue("");
    setCheckingSession(true);
    setSessionRetry((current) => current + 1);
  };

  useEffect(() => {
    if (!token) { setCheckingSession(false); return; }
    let cancelled = false;
    const validate = async () => {
      try {
        const response = await fetch(`${apiOrigin}/api/v1/auth/employee/me`, { headers: partnerHeaders(token), cache: "no-store" });
        if (!response.ok) {
          if (!cancelled) {
            if (shouldClearPartnerSession(response.status)) clearSession();
            else { setSessionIssue(partnerSessionIssue(response.status)); setCheckingSession(false); }
          }
          return;
        }
        const next = normalisePartnerProfile(await response.json());
        if (!cancelled) {
          setProfile(next);
          setActiveLocationId((current) => next.locations.some((location) => location.id === current) ? current : next.locations[0]?.id || "");
          setCheckingSession(false);
          setSessionIssue("");
        }
      } catch {
        if (!cancelled) { setSessionIssue(partnerSessionIssue()); setCheckingSession(false); }
      }
    };
    void validate();
    return () => { cancelled = true; };
  }, [clearSession, token, sessionRetry]);

  if (checkingSession) return <main className="auth-page"><p>Comprobando acceso seguro a PIKI Partner Orders…</p></main>;
  if (token && !profile && sessionIssue) return <SessionRecovery message={sessionIssue} onRetry={retrySession} onLogout={clearSession} />;
  if (!token || !profile) return <main className="auth-page"><EmployeeAuthGate apiOrigin={apiOrigin} onAuthenticated={(nextToken) => { saveToken(nextToken); setToken(nextToken); setCheckingSession(true); window.dispatchEvent(new Event("piki-authenticated")); }} /></main>;
  if (!profile.locations.length) return <MissingAssignment onLogout={clearSession} />;

  const location = profile.locations.find((item) => item.id === activeLocationId) ?? profile.locations[0];
  const canStore = hasPermission(location, "store:write");
  const canOrdersRead = hasPermission(location, "orders:read");
  const canOrdersOperate = hasPermission(location, "orders:write") || hasPermission(location, "orders:prepare");
  const canCancel = hasPermission(location, "orders:cancel");
  const canMenuRead = hasPermission(location, "menu:read");
  const canMenu = hasPermission(location, "menu:write");
  const canMetrics = hasPermission(location, "metrics:read");
  const visibleViews = new Set(visiblePartnerViews({
    ordersRead: canOrdersRead,
    menuRead: canMenuRead,
    menuWrite: canMenu,
    metricsRead: canMetrics,
  }));
  const availableNavigation = navigation.filter((item) => visibleViews.has(item.id));
  const currentView = availableNavigation.some((item) => item.id === activeView) ? activeView : availableNavigation[0]?.id;
  const role = location.roles[0] || "operador";

  return <div className={`orders-app-shell ${isPdaMode ? "pda-mode" : ""}`} data-surface={isPdaMode ? "partner-pda" : "partner-orders"}>
    <aside className={`orders-sidebar ${menuOpen ? "is-visible" : ""}`} aria-label="Navegación de PIKI Partner Orders">
      <div className="orders-brand"><img src="/piki-rider-bee-192.png" alt="Rider abeja PIKI" /><div><strong>PIKI</strong><span>PARTNER ORDERS</span><small className="brand-vibe">Cada pedido cuenta.</small>{isPdaMode && <small className="pda-brand-badge">MODO PDA OPERATIVO</small>}</div><button type="button" className="mobile-close" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú"><X size={20} /></button></div>
      <div className="partner-establishment-card" aria-label={`Establecimiento activo: ${location.name}`}>
        <span className="partner-establishment-icon"><Store size={18} /></span>
        <div><small>ESTABLECIMIENTO ACTIVO</small><strong>{location.name}</strong><span>{location.partnerCode || location.address || "Panel operativo del Partner"}</span></div>
      </div>
      <nav>{availableNavigation.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={currentView === id ? "active" : ""} onClick={() => { setActiveView(id); setMenuOpen(false); }}><Icon size={20} /><span>{label}</span></button>)}</nav>
      <a className="sidebar-help" href="tel:+34960500685" aria-label="Llamar a Soporte PIKI al 960 500 685"><CircleHelp size={18} /><span><b>Soporte PIKI</b><small>Preparación y reparto · 960 500 685</small></span><Phone size={15} /></a>
    </aside>
    {menuOpen && <button type="button" className="sidebar-scrim" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)} />}

    <main className="orders-main">
      <header className="orders-topbar">
        <button type="button" className="mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Abrir menú"><Menu size={22} /></button>
        <div className="location-select"><Store size={18} /><div><span>LOCAL ACTIVO</span>{profile.locations.length > 1 ? <label><select value={location.id} onChange={(event) => setActiveLocationId(event.target.value)} aria-label="Seleccionar local">{profile.locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={16} /></label> : <strong>{location.name}</strong>}</div></div>
        <div className="topbar-right"><StoreStatusControl token={token} location={location} enabled={canStore} onUnauthorized={clearSession} /><div className="profile-chip" aria-label={`Perfil ${profile.name} en ${location.name}`}><span>{location.name.slice(0, 1).toUpperCase()}</span><div><b>{location.name}</b><small>{profile.name} · {displayRole(role)}</small></div><button type="button" onClick={clearSession} aria-label="Cerrar sesión"><LogOut size={17} /></button></div></div>
      </header>
      <div className="orders-page">
        {!currentView && <div className="orders-loading">Este perfil no tiene permisos operativos para el local seleccionado. Contacta con el administrador de tu cuenta PIKI.</div>}
        {currentView === "orders" && <OrdersBoard token={token} locationId={location.id} canRead={canOrdersRead} canOperate={canOrdersOperate} canCancel={canCancel} pdaMode={isPdaMode} onUnauthorized={clearSession} />}
        {currentView === "history" && <ArchivedOrdersBoard token={token} locationId={location.id} canRead={canOrdersRead} onUnauthorized={clearSession} />}
        {currentView === "catalog" && canMenu && <MenuEditor key={location.id} apiOrigin={apiOrigin} token={token} locationId={location.id} onUnauthorized={clearSession} />}
        {currentView === "menu" && <MenuAvailability token={token} locationId={location.id} canRead={canMenuRead} canEdit={canMenu} onUnauthorized={clearSession} />}
        {currentView === "performance" && <PerformanceView token={token} locationId={location.id} canRead={canMetrics} onUnauthorized={clearSession} />}
      </div>
    </main>
  </div>;
}

function App() {
  return location.hash.startsWith("#onboarding") ? <PartnerOnboarding /> : <PartnerOperationsApp />;
}

export default App;
