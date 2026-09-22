import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  Activity,
  Bell,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  Menu,
  PackageOpen,
  RefreshCw,
  Settings,
  Store,
  Users,
  X,
} from "lucide-react";
import "./App.css";

type ApiStatus = "checking" | "ready" | "unavailable";
type View = "Resumen" | "Alta de comercio" | "Pedidos" | "Catálogo" | "Equipo" | "Ajustes";

type OnboardingResponse = {
  message: string;
  partner: {
    id?: string;
    name: string;
    email: string;
    phone: string;
    onboarding_status?: string;
  };
  status?: string;
};

const apiOrigin = (import.meta.env.VITE_API_URL ?? "https://piki-api-e0yg.onrender.com").replace(/\/$/, "");

const navigation: Array<{ label: View; icon: typeof LayoutDashboard }> = [
  { label: "Resumen", icon: LayoutDashboard },
  { label: "Alta de comercio", icon: Store },
  { label: "Pedidos", icon: ClipboardList },
  { label: "Catálogo", icon: PackageOpen },
  { label: "Equipo", icon: Users },
  { label: "Ajustes", icon: Settings },
];

function App() {
  const [activeView, setActiveView] = useState<View>("Resumen");
  const [menuOpen, setMenuOpen] = useState(false);
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");
  const [apiMessage, setApiMessage] = useState("Comprobando la disponibilidad de la plataforma.");
  const [formState, setFormState] = useState({ name: "", email: "", phone: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submission, setSubmission] = useState<OnboardingResponse | null>(null);
  const [formError, setFormError] = useState("");

  const checkApi = useCallback(async () => {
    try {
      const response = await fetch(`${apiOrigin}/ready`);
      const payload = (await response.json()) as { status?: string; database?: string };
      if (!response.ok || payload.status !== "ready") {
        throw new Error("API_NOT_READY");
      }
      setApiStatus("ready");
      setApiMessage("API y PostgreSQL de producción están conectados.");
    } catch {
      setApiStatus("unavailable");
      setApiMessage("La conexión no está disponible ahora. Inténtalo de nuevo en unos segundos.");
    }
  }, []);

  function refreshApiStatus() {
    setApiStatus("checking");
    setApiMessage("Comprobando la conexión segura con PIKI API.");
    void checkApi();
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void checkApi();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [checkApi]);

  async function submitOnboarding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setFormError("");
    setSubmission(null);

    try {
      const response = await fetch(`${apiOrigin}/api/v1/partners/onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formState),
      });
      const payload = (await response.json()) as OnboardingResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "No se ha podido registrar el comercio.");
      }
      setSubmission(payload);
      setFormState({ name: "", email: "", phone: "" });
      await checkApi();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "No se ha podido registrar el comercio.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function selectView(view: View) {
    setActiveView(view);
    setMenuOpen(false);
  }

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
                <button className="secondary-button" type="button" onClick={refreshApiStatus} disabled={apiStatus === "checking"}>
                  <RefreshCw size={17} className={apiStatus === "checking" ? "spin" : ""} />
                  Actualizar estado
                </button>
              </div>

              <section className={`connection-card connection-${apiStatus}`}>
                <div className="connection-icon">
                  {apiStatus === "ready" ? <CheckCircle2 size={24} /> : <Activity size={24} />}
                </div>
                <div className="connection-copy">
                  <p>{apiStatus === "ready" ? "Producción conectada" : apiStatus === "checking" ? "Verificando producción" : "Conexión pendiente"}</p>
                  <span>{apiMessage}</span>
                </div>
                <span className="connection-url">{apiOrigin.replace("https://", "")}</span>
              </section>

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

          {activeView === "Alta de comercio" && (
            <section className="onboarding-layout">
              <div className="page-heading compact">
                <div>
                  <p className="eyebrow">ONBOARDING</p>
                  <h1>Alta de comercio</h1>
                  <p className="lead">Envía una solicitud real a la API central de PIKI.</p>
                </div>
              </div>
              <div className="onboarding-grid">
                <div className="process-card">
                  <span className="step-number">01</span>
                  <h2>Datos de contacto</h2>
                  <p>Recopilamos la información mínima para iniciar la revisión comercial.</p>
                  <div className="process-line" />
                  <span className="step-number muted-step">02</span>
                  <h2 className="muted-text">Revisión y activación</h2>
                  <p className="muted-text">La configuración de catálogo y zonas se habilita tras la aprobación.</p>
                </div>
                <form className="partner-form" onSubmit={submitOnboarding}>
                  <label>
                    Nombre comercial
                    <input required minLength={2} value={formState.name} onChange={(event) => setFormState({ ...formState, name: event.target.value })} placeholder="Ej. La Cocina de Xàtiva" />
                  </label>
                  <label>
                    Correo electrónico
                    <input required type="email" value={formState.email} onChange={(event) => setFormState({ ...formState, email: event.target.value })} placeholder="contacto@comercio.es" />
                  </label>
                  <label>
                    Teléfono de contacto
                    <input required minLength={6} value={formState.phone} onChange={(event) => setFormState({ ...formState, phone: event.target.value })} placeholder="600 000 000" />
                  </label>
                  {formError && <p className="form-error" role="alert">{formError}</p>}
                  {submission && (
                    <div className="form-success" role="status">
                      <CheckCircle2 size={19} />
                      <span>{submission.message} Estado: {submission.partner.onboarding_status ?? submission.status ?? "pending_review"}.</span>
                    </div>
                  )}
                  <button className="primary-button form-submit" type="submit" disabled={isSubmitting || apiStatus !== "ready"}>
                    {isSubmitting ? "Enviando solicitud…" : "Enviar a revisión"}
                    {!isSubmitting && <ChevronRight size={17} />}
                  </button>
                  {apiStatus !== "ready" && <p className="form-hint">El envío se habilita cuando la API de producción esté disponible.</p>}
                </form>
              </div>
            </section>
          )}

          {activeView !== "Resumen" && activeView !== "Alta de comercio" && (
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
