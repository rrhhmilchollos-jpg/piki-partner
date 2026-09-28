import { useState } from "react";
import {
  Building2,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  Menu,
  PackageOpen,
  Settings,
  Store,
  TabletSmartphone,
  Users,
  X,
} from "lucide-react";
import "./App.css";
import PartnerOnboarding from "./PartnerOnboarding";
import EmployeeAuthGate from "./EmployeeAuthGate";
import MenuEditor from "./MenuEditor";
import KitchenScreen from "./KitchenScreen";
import NotificationCenter from "./NotificationCenter";

type View = "Resumen" | "Alta de comercio" | "Pedidos" | "PDA Cocina" | "Catálogo" | "Equipo" | "Ajustes";

const apiOrigin = (import.meta.env.VITE_API_URL ?? "https://api.pikidelivery.com").replace(/\/$/, "");

const navigation: Array<{ label: View; icon: typeof LayoutDashboard }> = [
  { label: "Resumen", icon: LayoutDashboard },
  { label: "Alta de comercio", icon: Store },
  { label: "Pedidos", icon: ClipboardList },
  { label: "PDA Cocina", icon: TabletSmartphone },
  { label: "Catálogo", icon: PackageOpen },
  { label: "Equipo", icon: Users },
  { label: "Ajustes", icon: Settings },
];

function App() {
  const pdaMode = new URLSearchParams(window.location.search).get("mode") === "pda";
  const [activeView, setActiveView] = useState<View>(pdaMode ? "PDA Cocina" : "Resumen");
  const [menuOpen, setMenuOpen] = useState(false);
  const [apiToken, setApiToken] = useState(() => sessionStorage.getItem(`piki-${location.hostname}-api-token`) || "");
  const [authRequired, setAuthRequired] = useState(false);
  const [publicOnboarding, setPublicOnboarding] = useState(false);

  function selectView(view: View) {
    if ((view === "Pedidos" || view === "PDA Cocina" || view === "Catálogo" || view === "Equipo" || view === "Ajustes") && !apiToken) setAuthRequired(true);
    setActiveView(view);
    setMenuOpen(false);
  }

  if (!apiToken || authRequired) return <main className="page-content">{publicOnboarding ? <PartnerOnboarding apiOrigin={apiOrigin} onComplete={() => { setPublicOnboarding(false); setActiveView("Resumen"); }} /> : <EmployeeAuthGate apiOrigin={apiOrigin} onStartOnboarding={() => { setAuthRequired(false); setPublicOnboarding(true); }} onAuthenticated={(token) => { sessionStorage.setItem(`piki-${location.hostname}-api-token`, token); setApiToken(token); setAuthRequired(false); setPublicOnboarding(false); window.dispatchEvent(new Event("piki-authenticated")); }} />}</main>;

  return (
    <div className={`app-shell ${pdaMode ? "pda-mode" : ""}`}>
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
            <NotificationCenter apiOrigin={apiOrigin} token={apiToken} surface="partner" />
            <div className="user-avatar" aria-label="Usuario de PIKI">P</div>
          </div>
        </header>

        <section className="page-content">
          {authRequired && <EmployeeAuthGate apiOrigin={apiOrigin} onStartOnboarding={() => { setAuthRequired(false); setActiveView("Alta de comercio"); }} onAuthenticated={(token) => { sessionStorage.setItem(`piki-${location.hostname}-api-token`, token); setApiToken(token); setAuthRequired(false); window.dispatchEvent(new Event("piki-authenticated")); }} />}
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
                <article className="empty-card primary-empty">
                  <div className="empty-card-top"><span>COMERCIOS</span><Store size={18} /></div>
                  <h2>Empieza con tu primer comercio</h2>
                  <p>Registra los datos de contacto del establecimiento. La solicitud se guarda en la API central y queda pendiente de revisión.</p>
                  <button className="primary-button" type="button" onClick={() => setActiveView("Alta de comercio")}>
                    Dar de alta un comercio <ChevronRight size={17} />
                  </button>
                </article>
                <article className="empty-card">
                  <div className="empty-card-top"><span>PEDIDOS</span><ClipboardList size={18} /></div>
                  <h2>Sin pedidos operativos</h2>
                  <p>Los pedidos aparecerán aquí cuando los comercios aprobados publiquen su catálogo y reciban su primera venta.</p>
                </article>
              </section>
            </>
          )}

          {activeView === "Alta de comercio" && <PartnerOnboarding apiOrigin={apiOrigin} />}

          {activeView === "Pedidos" && apiToken && <KitchenScreen apiOrigin={apiOrigin} token={apiToken} />}
          {activeView === "PDA Cocina" && apiToken && <KitchenScreen apiOrigin={apiOrigin} token={apiToken} pdaMode />}
          {activeView === "Catálogo" && apiToken && <MenuEditor apiOrigin={apiOrigin} token={apiToken} />}
          {activeView !== "Resumen" && activeView !== "Alta de comercio" && activeView !== "Pedidos" && activeView !== "Catálogo" && (
            <section className="feature-empty">
              <div className="feature-icon"><PackageOpen size={26} /></div>
              <p className="eyebrow">{activeView.toUpperCase()}</p>
              <h1>Esta área estará disponible al activar comercios.</h1>
              <p>El panel ya está conectado a producción. Completa el alta de un comercio para continuar con la configuración operativa.</p>
              <button className="primary-button" type="button" onClick={() => setActiveView("Alta de comercio")}>Ir al alta de comercio <ChevronRight size={17} /></button>
            </section>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
