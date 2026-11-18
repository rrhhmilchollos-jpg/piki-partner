import { useEffect, useState, type FormEvent } from "react";
import { getStoredEmail, storeEmail } from "./authStorage";
import { ArrowRight, Eye, EyeOff, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { apiErrorMessage, getApiErrorMessage, getNetworkErrorMessage } from "./api";
import { readPasswordRecoveryLink } from "./passwordRecoveryLink";
import PartnerConnectionCheck from "./PartnerConnectionCheck";
import { getPartnerTransportErrorMessage } from "./partnerConnectionDiagnostics";

type AuthMode = "login" | "change" | "request" | "reset";

type Props = { apiOrigin: string; onAuthenticated: (token: string) => void };

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  visible,
  onToggle,
  placeholder,
  minLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  visible: boolean;
  onToggle: () => void;
  placeholder: string;
  minLength?: number;
}) {
  return (
    <label>
      {label}
      <span className="password-control">
        <input
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          minLength={minLength}
          required
        />
        <button type="button" onClick={onToggle} aria-label={visible ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`}>
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </span>
    </label>
  );
}

export default function EmployeeAuthGate({ apiOrigin, onAuthenticated }: Props) {
  const [recoveryLink] = useState(() => readPasswordRecoveryLink(window.location.href));
  const [mode, setMode] = useState<AuthMode>(() => recoveryLink.token ? "reset" : "login");
  const [token, setToken] = useState(recoveryLink.token);
  const [email, setEmail] = useState(() => getStoredEmail());
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (recoveryLink.cleanPath) window.history.replaceState({}, "", recoveryLink.cleanPath);
  }, [recoveryLink.cleanPath]);

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError("");
    setMessage("");
    setCurrent("");
    setNext("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "request") {
        const response = await fetch(`${apiOrigin}/api/v1/auth/employee/password-reset/request`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-PIKI-Surface": "partner" },
          body: JSON.stringify({ email }),
        });
        const data = await response.json().catch(() => ({})) as { message?: string };
        if (!response.ok) throw new Error(data.message || "No se ha podido solicitar la recuperación.");
        setMessage(data.message || "Si el correo es válido, recibirás un enlace de recuperación.");
        return;
      }
      if (mode === "reset") {
        const response = await fetch(`${apiOrigin}/api/v1/auth/employee/password-reset/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-PIKI-Surface": "partner" },
          body: JSON.stringify({ token, newPassword: next }),
        });
        if (!response.ok) throw new Error(await getApiErrorMessage(response, "No se ha podido cambiar la contraseña."));
        setMode("login");
        setError("");
        setCurrent("");
        setNext("");
        setMessage("Contraseña actualizada. Ya puedes iniciar sesión.");
        return;
      }
      if (mode === "login") {
        const response = await fetch(`${apiOrigin}/api/v1/auth/employee/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-PIKI-Surface": "partner" },
          body: JSON.stringify({ identifier: email, password: current, role: "partner" }),
        });
        const data = await response.json().catch(() => ({})) as { accessToken?: string; requiresPasswordChange?: boolean };
        if (!response.ok || !data.accessToken) throw new Error(apiErrorMessage(data, response.status, "No se ha podido iniciar sesión."));
        setToken(data.accessToken); if (email.includes("@")) storeEmail(email);
        if (data.requiresPasswordChange) setMode("change");
        else onAuthenticated(data.accessToken);
        return;
      }
      const response = await fetch(`${apiOrigin}/api/v1/auth/employee/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-PIKI-Surface": "partner" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, "No se ha podido cambiar la contraseña."));
      onAuthenticated(token);
    } catch (reason) {
      setError(getPartnerTransportErrorMessage(reason) || getNetworkErrorMessage());
    } finally {
      setBusy(false);
    }
  }

  const isPasswordReset = mode === "reset";
  const title = mode === "login" ? "Entra a tu local" : mode === "change" ? "Actualiza tu contraseña" : mode === "request" ? "Recupera tu acceso" : "Crea una contraseña nueva";
  const description = mode === "login"
    ? "Utiliza tu correo corporativo o ID PIKI (PIKI-E-XXXXXXXX) y la contraseña entregada por PIKI."
    : mode === "change"
      ? "Por seguridad, cambia la contraseña temporal antes de gestionar pedidos."
      : mode === "request"
        ? "Te enviaremos un enlace seguro al correo de tu cuenta Partner."
        : "El enlace es válido durante 30 minutos y solo puede utilizarse una vez.";

  return (
    <div className="login-layout">
      <section className="login-brand-panel">
        <img src="/piki-icon-512.png" alt="Logotipo de PIKI Partner Orders" />
        <p>PIKI PARTNER ORDERS</p>
        <h1>El pulso de tu local, siempre en marcha.</h1>
        <span>Gestiona pedidos, disponibilidad y operación desde una sola pantalla.</span>
      </section>
      <form className="orders-login-card" onSubmit={submit}>
        <div className="login-icon">{mode === "request" || isPasswordReset ? <KeyRound size={23} /> : <LockKeyhole size={23} />}</div>
        <p className="section-kicker">ACCESO SEGURO</p>
        <h2>{title}</h2>
        <p>{description}</p>
        {mode !== "reset" && <label>{mode === "login" ? "Correo corporativo o ID PIKI" : "Correo corporativo"}<input type={mode === "login" ? "text" : "email"} autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={mode === "login" ? "correo@empresa.es o PIKI-E-XXXXXXXX" : "correo@empresa.es"} required /></label>}
        {mode === "login" && <PasswordField label="Contraseña" value={current} onChange={setCurrent} autoComplete="current-password" visible={showCurrent} onToggle={() => setShowCurrent((value) => !value)} placeholder="••••••••" />}
        {mode === "change" && <PasswordField label="Contraseña temporal" value={current} onChange={setCurrent} autoComplete="current-password" visible={showCurrent} onToggle={() => setShowCurrent((value) => !value)} placeholder="••••••••" />}
        {(mode === "change" || mode === "reset") && <PasswordField label="Nueva contraseña" value={next} onChange={setNext} autoComplete="new-password" visible={showNext} onToggle={() => setShowNext((value) => !value)} placeholder="12 caracteres o más" minLength={12} />}
        {error && <p className="login-error" role="alert">{error}</p>}
        {message && <p className="login-success" role="status">{message}</p>}
        <button type="submit" className="login-submit" disabled={busy}>{busy ? "Procesando…" : mode === "login" ? <>Iniciar sesión <ArrowRight size={18} /></> : mode === "request" ? "Enviar enlace de recuperación" : mode === "reset" ? "Guardar contraseña" : "Guardar contraseña"}</button>
        {mode === "login" && <button type="button" className="link-button login-help" onClick={() => switchMode("request")}>He olvidado mi contraseña</button>}
        {(mode === "request" || mode === "reset") && <button type="button" className="link-button login-help" onClick={() => switchMode("login")}>Volver al inicio de sesión</button>}
        <PartnerConnectionCheck apiOrigin={apiOrigin} disabled={busy} />
        <small><ShieldCheck size={14} />Acceso protegido para establecimientos PIKI.</small>
      </form>
    </div>
  );
}
