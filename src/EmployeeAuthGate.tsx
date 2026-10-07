import { useState, type FormEvent } from "react";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { getApiErrorMessage, getNetworkErrorMessage } from "./api";

export default function EmployeeAuthGate({ apiOrigin, onAuthenticated }: { apiOrigin: string; onAuthenticated: (token: string) => void }) {
  const [mode, setMode] = useState<"login" | "change">("login");
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "login") {
        const response = await fetch(`${apiOrigin}/api/v1/auth/employee/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-PIKI-Surface": "partner" },
          body: JSON.stringify({ email, password: current, role: "partner" }),
        });
        const data = await response.json().catch(() => ({})) as { accessToken?: string; requiresPasswordChange?: boolean };
        if (!response.ok || !data.accessToken) throw new Error(await getApiErrorMessage(response, "No se ha podido iniciar sesión."));
        setToken(data.accessToken);
        if (data.requiresPasswordChange) setMode("change");
        else onAuthenticated(data.accessToken);
      } else {
        const response = await fetch(`${apiOrigin}/api/v1/auth/employee/change-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-PIKI-Surface": "partner" },
          body: JSON.stringify({ currentPassword: current, newPassword: next }),
        });
        if (!response.ok) throw new Error(await getApiErrorMessage(response, "No se pudo cambiar la contraseña."));
        onAuthenticated(token);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : getNetworkErrorMessage());
    } finally {
      setBusy(false);
    }
  }

  return <div className="login-layout"><section className="login-brand-panel"><img src="/piki-rider-bee-512.png" alt="Rider abeja de PIKI" /><p>PIKI PARTNER ORDERS</p><h1>El pulso de tu local, siempre en marcha.</h1><span>Gestiona pedidos, disponibilidad y operación desde una sola pantalla.</span></section><form className="orders-login-card" onSubmit={submit}><div className="login-icon"><LockKeyhole size={23} /></div><p className="section-kicker">ACCESO SEGURO</p><h2>{mode === "login" ? "Entra a tu local" : "Actualiza tu contraseña"}</h2><p>{mode === "login" ? "Utiliza las credenciales del equipo Partner que te entregó PIKI." : "Por seguridad, cambia la contraseña temporal antes de gestionar pedidos."}</p>{mode === "login" && <label>Correo corporativo<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="correo@empresa.es" required /></label>}<label>{mode === "login" ? "Contraseña" : "Contraseña temporal"}<input type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} placeholder="••••••••" required /></label>{mode === "change" && <label>Nueva contraseña<input type="password" autoComplete="new-password" value={next} onChange={(event) => setNext(event.target.value)} placeholder="12 caracteres o más" minLength={12} required /></label>}{error && <p className="login-error" role="alert">{error}</p>}<button type="submit" className="login-submit" disabled={busy}>{busy ? "Validando acceso…" : mode === "login" ? <>Iniciar sesión <ArrowRight size={18} /></> : "Guardar contraseña"}</button><small><ShieldCheck size={14} />Acceso protegido para establecimientos PIKI. <a href="/privacidad.html" target="_blank" rel="noreferrer">Política de privacidad</a></small></form></div>;
}
