import { useState } from "react";
import {
  Bell,
  Building2,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  Menu,
  PackageOpen,
  Settings,
  X,
} from "lucide-react";
import "./App.css";
import EmployeeAuthGate from "./EmployeeAuthGate";
import MenuEditor from "./MenuEditor";
import KitchenScreen from "./KitchenScreen";

type View = "Resumen" | "Pedidos" | "Catálogo" | "Ajustes";

const apiOrigin = (import.meta.env.VITE_API_URL ?? "https://api.pikidelivery.com").replace(/\/$/, "");

const navigation: Array<{ label: View; icon: typeof LayoutDashboard }> = [
  { label: "Resumen", icon: LayoutDashboard },
  { label: "Pedidos", icon: ClipboardList },
  { label: "Catálogo", icon: PackageOpen },
  { label: "Ajustes", icon: Settings },
];

function App() {
  const [activeView, setActiveView] = useState<View>("Resumen");
  const [menuOpen, setMenuOpen] = useState(false);
  const [apiToken, setApiToken] = useState(() => sessionStorage.getItem(`piki-${location.hostname}-api-token`) || "");
  const [authRequired, setAuthRequired] = useState(false);

  function selectView(view: View) {
    if ((view === "Pedidos" || view === "Catálogo" || view === "Ajustes") && !apiToken) setAuthRequired(true);
    setActiveView(view);
    setMenuOpen(false);
  }

  if (!apiToken || authRequired) return <main className="page-content"><EmployeeAuthGate apiOrigin={apiOrigin} onAuthenticated={(token) => { sessionStorage.setItem(`piki-${location.hostname}-api-token`, token); setApiToken(token); setAuthRequired(false); window.dispatchEvent(new Event("piki-authenticated")); }} /></main>;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`} aria-label="Navegación principal">
        <div className="brand-block">
          <div className="brand-mark">P</div>
          <div>
            <strong>piki</strong>
            <span>Partners</span>
          </div>
          <button className="close-menu" type="button" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <nav className="nav-list">
          <p className="nav-label">OPERACIONES</p>
          {navigation.map(({ label, icon: Icon }) => (
            <button
              className={`nav-item ${activeView === label ? "nav-item-active" : ""}`}
              key={label}
              type="button"
              onClick={() => selectView(label)}
            >
              <Icon size={18} strokeWidth={activeView === label ? 2.4 : 2} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="support-dot" />
          <div>
            <strong>Centro de ayuda</strong>
            <span>Soporte de partners</span>
          </div>
          <ChevronRight size={16} />
        </div>
      </aside>

      {menuOpen && <button className="backdrop" type="button" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)} />}

      <main className="main-content">
        <header className="topbar">
          <button className="menu-button" type="button" aria-label="Abrir menú" onClick={() => setMenuOpen(true)}>
            <Menu size={21} />
          </button>
          <div className="location-pill">
            <Building2 size={16} />
            <span>Panel de partners</span>
            <span className="status-dot" aria-hidden="true" />
          </div>
          <div className="topbar-actions">
            <button className="icon-button" type="button" aria-label="Notificaciones" onClick={() => setActiveView("Pedidos")}>
              <Bell size={19} />
            </button>
            <div className="user-avatar" aria-label="Usuario de PIKI">P</div>
          </div>
        </header>

        <section className="page-content">
          {activeView === "Resumen" && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">PLATAFORMA DE DELIVERY</p>
                  <h1>Buenas decisiones, desde el primer pedido.</h1>
                  <p className="lead">El panel está conectado al núcleo de producción de PIKI. Da de alta comercios y prepara la operativa real.</p>
                </div>
              </div>


              <section className="empty-state-grid">
                <article className="empty-card">
                  <div className="empty-card-top"><span>PEDIDOS</span><ClipboardList size={18} /></div>
                  <h2>Sin pedidos operativos</h2>
                  <p>Los pedidos aparecerán aquí cuando los comercios aprobados publiquen su catálogo y reciban su primera venta.</p>
                </article>
              </section>
            </>
          )}


          {activeView === "Pedidos" && apiToken && <KitchenScreen apiOrigin={apiOrigin} token={apiToken} />}
          {activeView === "Catálogo" && apiToken && <MenuEditor apiOrigin={apiOrigin} token={apiToken} />}
          {activeView !== "Resumen" && activeView !== "Pedidos" && activeView !== "Catálogo" && (
            <section className="feature-empty">
              <div className="feature-icon"><PackageOpen size={26} /></div>
              <p className="eyebrow">{activeView.toUpperCase()}</p>
              <h1>Esta área estará disponible al activar comercios.</h1>
              <p>El panel ya está conectado a producción. Las altas de comercios las gestiona el equipo comercial desde piki-admin.</p>
            </section>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
