import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, BarChart3, Bell, BookOpen, ChevronDown, CircleHelp, Clock3, LogOut, Menu, PackageSearch, Phone, Store, X } from "lucide-react";
import "./App.css";
import "./partnerSafety.css";
import CookieConsent from "./components/CookieConsent";
import EmployeeAuthGate from "./EmployeeAuthGate";
import MenuEditor from "./MenuEditor";
import MenuAvailability from "./MenuAvailability";
import OrdersBoard from "./OrdersBoard";
import ArchivedOrdersBoard from "./ArchivedOrdersBoard";
import PerformanceView from "./PerformanceView";
import PartnerOnboarding from "./PartnerOnboarding";
import GoogleBusinessSettings from "./GoogleBusinessSettings";
import PartnerAccountSummary from "./PartnerAccountSummary";
import { apiOrigin, displayRole, hasPermission, normalisePartnerProfile, partnerHeaders, type PartnerLocation, type PartnerProfile } from "./partnerApi";
import { visiblePartnerViews, type PartnerView } from "./partnerNavigation";
import { usePwaUpdateBlocker } from "./pwaUpdateRuntime";
import { partnerSessionIssue, shouldClearPartnerSession } from "./sessionRecovery";
import PartnerNativeNotificationControl from "./PartnerNativeNotificationControl";
import { PartnerKitchenReceptionProvider } from "./PartnerKitchenReception";
import { isPartnerNativeAndroid, partnerNativeNotifications } from "./partnerNativeNotifications";

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
  { id: "settings", label: "Mi cuenta", icon: Clock3 },
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
  const [open, setOpen] = useState(location.isOpen ?? false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const consultative = location.readOnly === true;
  const ordersDisabled = consultative || location.ordersEnabled === false || location.availabilityStatus === "coming_soon";
  usePwaUpdateBlocker("partner-store-status", busy);

  useEffect(() => { setOpen(location.isOpen ?? false); setMessage(""); }, [location.id, location.isOpen]);

  const toggle = async () => {
    if (!enabled || consultative || busy) return;
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

  return <div className={`store-control ${open && !ordersDisabled ? "is-open" : "is-paused"}`}>
    <button type="button" role="switch" aria-checked={open && !ordersDisabled} disabled={!enabled || consultative || busy} onClick={() => void toggle()}>
      <span className="store-toggle"><span /></span>
      <span><b>{consultative ? "SOLO CONSULTA" : open ? "ABIERTO" : "PAUSADO"}</b><small>{busy ? "Confirmando…" : ordersDisabled ? "No operativo · sin pedidos" : open ? "Aceptando pedidos" : location.isOpen === undefined ? "Estado sin confirmar" : "No se reciben pedidos"}</small></span>
    </button>
    {message && <p role="status">{message}</p>}
  </div>;
}

const week = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"] as const;
type HoursWindow = { open: string; close: string; closed: boolean };
type OpeningHours = Record<string, { morning: HoursWindow; evening: HoursWindow; closed: boolean }>;
const defaultHours = (): OpeningHours => Object.fromEntries(week.map((day) => [day, { morning: { open: "10:00", close: "14:00", closed: day === "domingo" }, evening: { open: "18:00", close: "23:00", closed: day === "domingo" }, closed: day === "domingo" }])) as OpeningHours;
const englishDayBySpanish: Record<(typeof week)[number], string> = { lunes: "monday", martes: "tuesday", "miércoles": "wednesday", jueves: "thursday", viernes: "friday", "sábado": "saturday", domingo: "sunday" };
function normaliseOpeningHours(value: unknown): OpeningHours {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const defaults = defaultHours();
  return Object.fromEntries(week.map((day) => {
    const raw = source[day] ?? source[englishDayBySpanish[day]];
    const item = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const legacy = typeof item.open === "string" || typeof item.close === "string";
    const window = (candidate: unknown, fallback: HoursWindow): HoursWindow => {
      const value = candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate as Record<string, unknown> : {};
      return { open: typeof value.open === "string" && /^\d{2}:\d{2}$/.test(value.open) ? value.open : fallback.open, close: typeof value.close === "string" && /^\d{2}:\d{2}$/.test(value.close) ? value.close : fallback.close, closed: value.closed === true };
    };
    return [day, { morning: window(legacy ? item : item.morning, defaults[day].morning), evening: window(legacy ? item : item.evening, defaults[day].evening), closed: item.closed === true }];
  })) as OpeningHours;
}

function StoreHoursSettings({ token, location, enabled, onUnauthorized }: { token: string; location: PartnerLocation; enabled: boolean; onUnauthorized: () => void }) {
  const [hours, setHours] = useState<OpeningHours>(defaultHours);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let cancelled = false;
    fetch(`${apiOrigin}/api/v1/partners/store/hours`, { headers: partnerHeaders(token, location.id), cache: "no-store" }).then(async (response) => {
      if (response.status === 401) { onUnauthorized(); return; }
      const payload = await response.json().catch(() => ({}));
      if (!cancelled && response.ok) setHours(normaliseOpeningHours(payload.openingHours));
    }).catch(() => { if (!cancelled) setMessage("No se pudieron cargar los horarios guardados."); });
    return () => { cancelled = true; };
  }, [location.id, onUnauthorized, token]);
  const updateWindow = (day: string, period: "morning" | "evening", patch: Partial<HoursWindow>) => setHours((current) => ({ ...current, [day]: { ...current[day], [period]: { ...current[day][period], ...patch } } }));
  const updateDay = (day: string, patch: Partial<Pick<OpeningHours[string], "closed">>) => setHours((current) => ({ ...current, [day]: { ...current[day], ...patch } }));
  const save = async () => {
    if (!enabled || busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`${apiOrigin}/api/v1/partners/store/hours`, { method: "PATCH", headers: { ...partnerHeaders(token, location.id), "Content-Type": "application/json" }, body: JSON.stringify({ openingHours: normaliseOpeningHours(hours) }) });
      if (response.status === 401) { onUnauthorized(); return; }
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.message || payload?.error || `HTTP ${response.status}`);
      }
      setMessage("Horarios guardados. PIKI los usará para indicar cuándo se aceptan comandas.");
    } catch (error) { setMessage(`No se pudieron guardar los horarios${error instanceof Error && error.message ? `: ${error.message}` : "."}`); } finally { setBusy(false); }
  };
  return <><section className="hours-settings"><header><div><p className="section-kicker">CONFIGURACIÓN DEL LOCAL</p><h1>Horarios de apertura</h1><p>Configura una franja de mañana y otra de tarde-noche para cada día.</p></div><button type="button" className="support-trigger" disabled={!enabled || busy} onClick={() => void save()}>{busy ? "Guardando…" : "Guardar horarios"}</button></header><div className="hours-grid">{week.map((day) => { const value = hours[day]; return <div key={day} className="hours-row hours-row-split"><strong>{day}</strong><span className="hours-period-label">Mañana</span><input type="time" value={value.morning.open} disabled={value.closed || value.morning.closed || !enabled} onChange={(event) => updateWindow(day, "morning", { open: event.target.value })} /><span>—</span><input type="time" value={value.morning.close} disabled={value.closed || value.morning.closed || !enabled} onChange={(event) => updateWindow(day, "morning", { close: event.target.value })} /><span className="hours-period-label">Tarde-noche</span><input type="time" value={value.evening.open} disabled={value.closed || value.evening.closed || !enabled} onChange={(event) => updateWindow(day, "evening", { open: event.target.value })} /><span>—</span><input type="time" value={value.evening.close} disabled={value.closed || value.evening.closed || !enabled} onChange={(event) => updateWindow(day, "evening", { close: event.target.value })} /><label className="hours-closed"><input type="checkbox" checked={value.closed} disabled={!enabled} onChange={(event) => updateDay(day, { closed: event.target.checked })} /> Cerrado</label></div>; })}</div>{message && <p className="orders-message" role="status">{message}</p>}</section><GoogleBusinessSettings token={token} locationId={location.id} openingHours={hours} canEdit={enabled} onUnauthorized={onUnauthorized} onMessage={setMessage} /></>;
}

function MissingAssignment({ onLogout, detail }: { onLogout: () => void; detail?: string }) {
  return <main className="auth-page"><section className="orders-login-card">
    <p className="section-kicker">ACCESO PENDIENTE</p>
    <h2>No hay un local asignado</h2>
    <p>Tu sesión es válida, pero PIKI no ha recibido una asignación de establecimiento y permisos para este usuario. Contacta con tu administrador o soporte antes de operar pedidos.</p>
    {detail && <p role="status">{detail}</p>}
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
  const [sessionEpoch, setSessionEpoch] = useState(0);
  const currentSession = useRef({ token, epoch: 0 });
  const [profile, setProfile] = useState<PartnerProfile | null>(null);
  const [activeLocationId, setActiveLocationId] = useState("");
  const [checkingSession, setCheckingSession] = useState(Boolean(token));
  const [sessionIssue, setSessionIssue] = useState("");
  const [sessionRetry, setSessionRetry] = useState(0);
  const [activeView, setActiveView] = useState<View>("orders");
  const [menuOpen, setMenuOpen] = useState(false);

  const isCurrentSession = useCallback(() => currentSession.current.token === token && currentSession.current.epoch === sessionEpoch, [token, sessionEpoch]);
  const clearSession = useCallback(() => {
    if (!isCurrentSession()) return;
    // Invalidate synchronously, before React rerenders or another login can reuse the token.
    const epoch = currentSession.current.epoch + 1;
    currentSession.current = { token: "", epoch };
    setSessionEpoch(epoch);
    if (isPartnerNativeAndroid()) void partnerNativeNotifications.clearAllOrders().catch(() => undefined);
    localStorage.removeItem(tokenKey);
    sessionStorage.removeItem(tokenKey);
    setToken("");
    setProfile(null);
    setActiveLocationId("");
    setCheckingSession(false);
    setSessionIssue("");
  }, [isCurrentSession]);

  const retrySession = () => {
    setSessionIssue("");
    setCheckingSession(true);
    setSessionRetry((current) => current + 1);
  };

  useEffect(() => {
    if (!token) { setCheckingSession(false); return; }
    let cancelled = false;
    let validationSequence = 0;
    let validationRequest: AbortController | null = null;
    const validate = async () => {
      const sequence = ++validationSequence;
      validationRequest?.abort();
      const request = new AbortController();
      validationRequest = request;
      const timeout = window.setTimeout(() => request.abort(), 8_000);
      try {
        const response = await fetch(`${apiOrigin}/api/v1/auth/employee/me`, { headers: partnerHeaders(token), cache: "no-store", signal: request.signal });
        if (cancelled || request.signal.aborted || sequence !== validationSequence || !isCurrentSession()) return;
        if (!response.ok) {
          if (!cancelled) {
            if (shouldClearPartnerSession(response.status)) clearSession();
            else {
              if (response.status === 403) setProfile(null);
              setSessionIssue(partnerSessionIssue(response.status)); setCheckingSession(false);
            }
          }
          return;
        }
        const next = normalisePartnerProfile(await response.json());
        if (!cancelled && !request.signal.aborted && sequence === validationSequence && isCurrentSession()) {
          setProfile(next);
          setActiveLocationId((current) => next.locations.some((location) => location.id === current) ? current : next.locations[0]?.id || "");
          setCheckingSession(false);
          setSessionIssue("");
        }
      } catch {
        if (!cancelled && sequence === validationSequence && isCurrentSession()) { setSessionIssue(partnerSessionIssue()); setCheckingSession(false); }
      } finally {
        window.clearTimeout(timeout);
      }
    };
    void validate();
    const wake = () => { if (document.visibilityState === "visible") void validate(); };
    document.addEventListener("visibilitychange", wake);
    const timer = window.setInterval(wake, 60_000);
    return () => { cancelled = true; validationRequest?.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", wake); };
  }, [clearSession, isCurrentSession, token, sessionRetry]);

  if (checkingSession) return <main className="auth-page"><p>Comprobando acceso seguro a PIKI Partner Orders…</p></main>;
  if (token && !profile && sessionIssue) return <SessionRecovery message={sessionIssue} onRetry={retrySession} onLogout={clearSession} />;
  if (!token || !profile) return <main className="auth-page"><EmployeeAuthGate apiOrigin={apiOrigin} onAuthenticated={(nextToken) => {
    const epoch = currentSession.current.epoch + 1;
    currentSession.current = { token: nextToken, epoch };
    setSessionEpoch(epoch);
    saveToken(nextToken); setToken(nextToken); setCheckingSession(true); window.dispatchEvent(new Event("piki-authenticated"));
  }} /></main>;
  if (!profile.locations.length) return <MissingAssignment onLogout={clearSession} detail={profile.accessIssue} />;

  const location = profile.locations.find((item) => item.id === activeLocationId) ?? profile.locations[0];
  const canStore = hasPermission(location, "store:write");
  const canOrdersRead = hasPermission(location, "orders:read");
  const canAccept = hasPermission(location, "orders:write");
  const canPrepare = hasPermission(location, "orders:prepare");
  const canCancel = hasPermission(location, "orders:cancel");
  const canMenuRead = hasPermission(location, "menu:read");
  const canMenu = hasPermission(location, "menu:write");
  const canMetrics = hasPermission(location, "metrics:read");
  const visibleViews = new Set(visiblePartnerViews({
    ordersRead: canOrdersRead,
    menuRead: canMenuRead,
    menuWrite: canMenu,
    metricsRead: canMetrics,
    storeWrite: canStore,
  }));
  const availableNavigation = navigation.filter((item) => visibleViews.has(item.id));
  const currentView = availableNavigation.some((item) => item.id === activeView) ? activeView : availableNavigation[0]?.id;
  const role = location.roles[0] || "operador";

  return <div className={`orders-app-shell ${isPdaMode ? "pda-mode" : ""}`} data-surface={isPdaMode ? "partner-pda" : "partner-orders"}>
    <aside className={`orders-sidebar ${menuOpen ? "is-visible" : ""}`} aria-label="Navegación de PIKI Partner Orders">
      <div className="orders-brand"><img src="/piki-icon-192.png" alt="Logotipo de PIKI Partner Orders" /><div><strong>PIKI</strong><span>PARTNER ORDERS</span><small className="brand-vibe">Cada pedido cuenta.</small>{isPdaMode && <small className="pda-brand-badge">MODO PDA OPERATIVO</small>}</div><button type="button" className="mobile-close" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú"><X size={20} /></button></div>
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
      <PartnerKitchenReceptionProvider key={`${profile.tenant || "assigned"}:${location.id}:${canOrdersRead}`} token={token} locationId={location.id} canRead={canOrdersRead} onUnauthorized={clearSession}>
      <div className="orders-page">
        {canOrdersRead && <PartnerNativeNotificationControl />}
        {location.readOnly && <div className="orders-loading" role="status">Local en consulta, no operativo. La aprobación comercial, disponibilidad y carta deben estar confirmadas antes de recibir pedidos.</div>}
        {!currentView && <div className="orders-loading">Este perfil no tiene permisos operativos para el local seleccionado. Contacta con el administrador de tu cuenta PIKI.</div>}
        {currentView === "orders" && <OrdersBoard token={token} locationId={location.id} canRead={canOrdersRead} canAccept={canAccept} canPrepare={canPrepare} canCancel={canCancel} pdaMode={isPdaMode} onUnauthorized={clearSession} />}
        {currentView === "history" && <ArchivedOrdersBoard token={token} locationId={location.id} canRead={canOrdersRead} onUnauthorized={clearSession} />}
        {currentView === "catalog" && canMenu && <MenuEditor key={location.id} apiOrigin={apiOrigin} token={token} locationId={location.id} identityKey={`${profile.tenant || ""}:${profile.email}:${location.tenant || ""}`} onUnauthorized={clearSession} />}
        {currentView === "menu" && <MenuAvailability key={location.id} token={token} locationId={location.id} identityKey={`${profile.tenant || ""}:${profile.email}:${location.tenant || ""}`} canRead={canMenuRead} canEdit={canMenu} onUnauthorized={clearSession} />}
        {currentView === "performance" && <PerformanceView token={token} locationId={location.id} canRead={canMetrics} onUnauthorized={clearSession} />}
        {currentView === "settings" && <><PartnerAccountSummary token={token} location={location} enabled={canStore} onUnauthorized={clearSession} onSaved={(patch) => setProfile((current) => current ? { ...current, locations: current.locations.map((item) => item.id === location.id ? { ...item, ...patch } : item) } : current)} /><StoreHoursSettings token={token} location={location} enabled={canStore} onUnauthorized={clearSession} /></>}
      </div>
      </PartnerKitchenReceptionProvider>
    </main>
  </div>;
}

function App() {
  return <>
    <CookieConsent />
    {location.hash.startsWith("#onboarding") ? <PartnerOnboarding /> : <PartnerOperationsApp />}
  </>;
}

export default App;
