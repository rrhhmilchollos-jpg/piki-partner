import { useEffect, useState } from "react";
import { BarChart3, Bell, ChevronDown, CircleHelp, LogOut, Menu, PackageSearch, Store, X } from "lucide-react";
import "./App.css";
import EmployeeAuthGate from "./EmployeeAuthGate";
import MenuAvailability from "./MenuAvailability";
import OrdersBoard from "./OrdersBoard";
import PerformanceView from "./PerformanceView";
import { apiOrigin, displayRole, hasPermission, normalisePartnerProfile, partnerHeaders, type PartnerLocation, type PartnerProfile } from "./partnerApi";

/* oxlint-disable react/set-state-in-effect -- effects reconcile authenticated profile and active location. */

type View = "orders" | "menu" | "performance";
const tokenKey = `piki-${location.hostname}-api-token`;

const navigation: Array<{ id: View; label: string; icon: typeof Bell }> = [
  { id: "orders", label: "Pedidos", icon: Bell },
  { id: "menu", label: "Disponibilidad", icon: PackageSearch },
  { id: "performance", label: "Rendimiento", icon: BarChart3 },
];

function storedToken(): string { return localStorage.getItem(tokenKey) || sessionStorage.getItem(tokenKey) || ""; }
function saveToken(token: string): void { localStorage.setItem(tokenKey, token); sessionStorage.removeItem(tokenKey); }

function StoreStatusControl({ token, location, enabled }: { token: string; location: PartnerLocation; enabled: boolean }) {
  const [open, setOpen] = useState(location.isOpen ?? true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => { setOpen(location.isOpen ?? true); setMessage(""); }, [location.id, location.isOpen]);

  const toggle = async () => {
    if (!enabled || busy) return;
    const next = !open;
    setBusy(true);
    setOpen(next);
    try {
      const response = await fetch(`${apiOrigin}/api/v1/partners/store/status`, {
        method: "PATCH",
        headers: { ...partnerHeaders(token, location.id), "Content-Type": "application/json" },
        body: JSON.stringify({ status: next ? "open" : "paused" }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setMessage(next ? "Local abierto" : "Local pausado");
    } catch {
      setOpen(!next);
      setMessage("El estado no se pudo sincronizar. Reintenta cuando el API de disponibilidad esté activo.");
    } finally { setBusy(false); }
  };

  return <div className={`store-control ${open ? "is-open" : "is-paused"}`}>
    <button type="button" role="switch" aria-checked={open} disabled={!enabled || busy} onClick={() => void toggle()}>
      <span className="store-toggle"><span /></span>
      <span><b>{open ? "ABIERTO" : "PAUSADO"}</b><small>{busy ? "Guardando…" : open ? "Aceptando pedidos" : "No se reciben pedidos"}</small></span>
    </button>
    {message && <p role="status">{message}</p>}
  </div>;
}

function App() {
  const [token, setToken] = useState(storedToken);
  const [profile, setProfile] = useState<PartnerProfile | null>(null);
  const [activeLocationId, setActiveLocationId] = useState("");
  const [checkingSession, setCheckingSession] = useState(Boolean(token));
  const [activeView, setActiveView] = useState<View>("orders");
  const [menuOpen, setMenuOpen] = useState(false);

  const clearSession = () => {
    localStorage.removeItem(tokenKey);
    sessionStorage.removeItem(tokenKey);
    setToken("");
    setProfile(null);
    setActiveLocationId("");
    setCheckingSession(false);
  };

  useEffect(() => {
    if (!token) { setCheckingSession(false); return; }
    let cancelled = false;
    const validate = async () => {
      try {
        const response = await fetch(`${apiOrigin}/api/v1/auth/employee/me`, { headers: partnerHeaders(token), cache: "no-store" });
        if (!response.ok) { if (!cancelled) clearSession(); return; }
        const next = normalisePartnerProfile(await response.json());
        if (!cancelled) {
          setProfile(next);
          setActiveLocationId((current) => next.locations.some((location) => location.id === current) ? current : next.locations[0]?.id || "");
          setCheckingSession(false);
        }
      } catch {
        if (!cancelled) setCheckingSession(false);
      }
    };
    void validate();
    return () => { cancelled = true; };
  }, [token]);

  if (checkingSession) return <main className="auth-page"><p>Comprobando acceso seguro a PIKI Partner Orders…</p></main>;
  if (!token || !profile) return <main className="auth-page"><EmployeeAuthGate apiOrigin={apiOrigin} onAuthenticated={(nextToken) => { saveToken(nextToken); setToken(nextToken); setCheckingSession(true); window.dispatchEvent(new Event("piki-authenticated")); }} /></main>;

  const location = profile.locations.find((item) => item.id === activeLocationId) ?? profile.locations[0];
  const canStore = hasPermission(profile, "store:write");
  const canOrders = hasPermission(profile, "orders:write") || hasPermission(profile, "orders:prepare");
  const canCancel = hasPermission(profile, "orders:cancel");
  const canMenu = hasPermission(profile, "menu:write");
  const canMetrics = hasPermission(profile, "metrics:read");

  return <div className="orders-app-shell">
    <aside className={`orders-sidebar ${menuOpen ? "is-visible" : ""}`} aria-label="Navegación de PIKI Partner Orders">
      <div className="orders-brand"><img src="/piki-rider-bee-192.png" alt="Rider abeja PIKI" /><div><strong>PIKI</strong><span>PARTNER ORDERS</span></div><button type="button" className="mobile-close" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú"><X size={20} /></button></div>
      <nav>{navigation.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={activeView === id ? "active" : ""} onClick={() => { setActiveView(id); setMenuOpen(false); }}><Icon size={20} /><span>{label}</span></button>)}</nav>
      <div className="sidebar-help"><CircleHelp size={18} /><span><b>¿Necesitas ayuda?</b><small>Soporte PIKI para Partners</small></span></div>
    </aside>
    {menuOpen && <button type="button" className="sidebar-scrim" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)} />}

    <main className="orders-main">
      <header className="orders-topbar">
        <button type="button" className="mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Abrir menú"><Menu size={22} /></button>
        <div className="location-select"><Store size={18} /><div><span>LOCAL ACTIVO</span>{profile.locations.length > 1 ? <label><select value={location.id} onChange={(event) => setActiveLocationId(event.target.value)} aria-label="Seleccionar local">{profile.locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={16} /></label> : <strong>{location.name}</strong>}</div></div>
        <div className="topbar-right"><StoreStatusControl token={token} location={location} enabled={canStore} /><div className="profile-chip"><span>{profile.name.slice(0, 1).toUpperCase()}</span><div><b>{profile.name}</b><small>{displayRole(profile.role)}</small></div><button type="button" onClick={clearSession} aria-label="Cerrar sesión"><LogOut size={17} /></button></div></div>
      </header>
      <div className="orders-page">
        {activeView === "orders" && <OrdersBoard token={token} locationId={location.id} canOperate={canOrders} canCancel={canCancel} onUnauthorized={clearSession} />}
        {activeView === "menu" && <MenuAvailability token={token} locationId={location.id} canEdit={canMenu} onUnauthorized={clearSession} />}
        {activeView === "performance" && <PerformanceView token={token} locationId={location.id} canRead={canMetrics} onUnauthorized={clearSession} />}
      </div>
    </main>
  </div>;
}

export default App;
