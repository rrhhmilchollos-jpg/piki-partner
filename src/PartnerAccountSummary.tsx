import { useEffect, useMemo, useState } from "react";
import { Check, LoaderCircle, Pencil, Save, X } from "lucide-react";
import { apiOrigin, partnerHeaders, type PartnerLocation } from "./partnerApi";
import { apiErrorMessage } from "./api";
import { editablePartnerProfilePayload, type EditablePartnerProfile } from "./partnerProfilePayload";
import { usePwaUpdateBlocker } from "./pwaUpdateRuntime";

type Props = {
  token: string;
  location: PartnerLocation;
  enabled: boolean;
  onUnauthorized: () => void;
  onSaved: (profile: Partial<PartnerLocation>) => void;
};

function draftFromLocation(location: PartnerLocation): EditablePartnerProfile {
  return {
    name: location.name || "",
    email: location.email || "",
    phone: location.phone || "",
    address: location.address || "",
    locality: location.locality || "",
    cuisine: location.cuisine || "",
    category: location.category || "",
  };
}

function profileFromPayload(value: unknown): Partial<PartnerLocation> {
  const profile = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>).profile : null;
  const source = profile && typeof profile === "object" && !Array.isArray(profile) ? profile as Record<string, unknown> : {};
  const text = (key: string) => typeof source[key] === "string" ? source[key] as string : undefined;
  return {
    id: text("id"),
    name: text("name"),
    email: text("email"),
    phone: text("phone"),
    address: text("address"),
    locality: text("locality"),
    cuisine: text("cuisine"),
    category: text("category"),
    deliveryFeeCents: typeof source.deliveryFeeCents === "number" ? source.deliveryFeeCents : undefined,
    commissionRateBps: typeof source.commissionRateBps === "number" ? source.commissionRateBps : undefined,
    promoted: typeof source.promoted === "boolean" ? source.promoted : undefined,
    availabilityStatus: source.availabilityStatus === "available" || source.availabilityStatus === "coming_soon" ? source.availabilityStatus : undefined,
    isOpen: typeof source.isOpen === "boolean" ? source.isOpen : undefined,
  };
}

export default function PartnerAccountSummary({ token, location, enabled, onUnauthorized, onSaved }: Props) {
  const [draft, setDraft] = useState<EditablePartnerProfile>(() => draftFromLocation(location));
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const displayProfile = useMemo(() => draftFromLocation(location), [location]);

  useEffect(() => {
    // The draft must reset when the active partner location changes or a save is confirmed.
    // oxlint-disable-next-line react/set-state-in-effect
    setDraft(displayProfile);
    setEditing(false);
    setMessage("");
    setError("");
  }, [displayProfile]);

  usePwaUpdateBlocker("partner-account-profile", busy);

  const loadCurrent = async () => {
    const response = await fetch(`${apiOrigin}/api/v1/partners/profile`, { headers: partnerHeaders(token, location.id), cache: "no-store" });
    if (response.status === 401) { onUnauthorized(); return; }
    if (!response.ok) throw new Error(await response.text());
    const profile = profileFromPayload(await response.json());
    setDraft((current) => ({ ...current, ...Object.fromEntries(Object.keys(current).map((key) => [key, profile[key as keyof PartnerLocation] ?? current[key as keyof EditablePartnerProfile]])) }) as EditablePartnerProfile);
  };

  const startEditing = async () => {
    if (!enabled || busy) return;
    setError("");
    setMessage("");
    setEditing(true);
    try {
      await loadCurrent();
    } catch {
      setError("No se pudieron cargar los datos actuales del partner.");
    }
  };

  const cancelEditing = () => {
    if (busy) return;
    setDraft(displayProfile);
    setEditing(false);
    setError("");
    setMessage("");
  };

  const save = async () => {
    if (!enabled || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${apiOrigin}/api/v1/partners/profile`, {
        method: "PATCH",
        headers: { ...partnerHeaders(token, location.id), "Content-Type": "application/json" },
        body: JSON.stringify(editablePartnerProfilePayload(draft)),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) { onUnauthorized(); return; }
      if (!response.ok) throw new Error(apiErrorMessage(payload, response.status, "No se pudieron guardar los datos del partner."));
      const profile = profileFromPayload(payload);
      onSaved(profile);
      setDraft((current) => ({ ...current, ...Object.fromEntries(Object.keys(current).map((key) => [key, profile[key as keyof PartnerLocation] ?? current[key as keyof EditablePartnerProfile]])) }) as EditablePartnerProfile);
      setEditing(false);
      setMessage("Datos guardados correctamente y sincronizados con PIKI.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron guardar los datos del partner.");
    } finally {
      setBusy(false);
    }
  };

  const field = (key: keyof EditablePartnerProfile, label: string, type = "text", placeholder?: string) => (
    <label className="partner-account-field" key={key}>
      <span>{label}</span>
      <input type={type} value={draft[key]} placeholder={placeholder} disabled={!enabled || busy} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} />
    </label>
  );

  return <section className="partner-account-summary" aria-label="Datos del establecimiento">
    <header className="partner-account-header">
      <div><p className="section-kicker">MI CUENTA · DATOS DEL PARTNER</p><h1>{location.name}</h1><p>Edita los datos básicos de tu establecimiento. Los cambios se guardan directamente en la cuenta de PIKI.</p></div>
      {!editing ? <button type="button" className="support-trigger" disabled={!enabled || busy} onClick={() => void startEditing()}><Pencil size={16} /> Editar datos</button> : <div className="partner-account-actions"><button type="button" className="link-button" disabled={busy} onClick={cancelEditing}><X size={16} /> Cancelar</button><button type="button" className="support-trigger" disabled={!enabled || busy} onClick={() => void save()}>{busy ? <><LoaderCircle className="spin" size={16} /> Guardando…</> : <><Save size={16} /> Guardar cambios</>}</button></div>}
    </header>
    {editing ? <div className="partner-account-edit-grid">{field("name", "Nombre comercial")} {field("address", "Dirección")} {field("locality", "Localidad")} {field("cuisine", "Cocina")} {field("category", "Categoría")} {field("phone", "Teléfono")} {field("email", "Email", "email")}</div> : <div className="partner-account-grid">
      <div><span>Dirección</span><strong>{location.address || "Pendiente"}</strong></div><div><span>Localidad</span><strong>{location.locality || "Pendiente"}</strong></div>
      <div><span>Cocina / categoría</span><strong>{[location.cuisine, location.category].filter(Boolean).join(" · ") || "Pendiente"}</strong></div><div><span>Contacto</span><strong>{location.phone || location.email || "Pendiente"}</strong></div>
      <div><span>Tarifa de entrega</span><strong>{((location.deliveryFeeCents || 0) / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</strong></div><div><span>Comisión PIKI</span><strong>{((location.commissionRateBps || 0) / 100).toFixed(2)}%</strong></div>
      <div><span>Estado comercial</span><strong>{location.availabilityStatus === "coming_soon" ? "Disponible próximamente" : location.isOpen ? "Activo y operativo" : "Pausado"}</strong></div><div><span>Promocionado</span><strong>{location.promoted ? "Sí" : "No"}</strong></div>
    </div>}
    {!enabled && <p className="partner-account-note">Este perfil tiene permisos de solo lectura para los datos del establecimiento.</p>}
    {message && <p className="orders-message"><Check size={17} />{message}</p>}
    {error && <p className="partner-account-error" role="alert">{error}</p>}
  </section>;
}
