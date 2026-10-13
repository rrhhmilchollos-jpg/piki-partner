import { useState } from "react";
import { CheckCircle2, FileText, LoaderCircle, ShieldCheck } from "lucide-react";
import { apiOrigin } from "./partnerApi";

type DocumentType = "tax_id" | "bank_certificate" | "activity_license" | "insurance" | "food_sanitary_authorization";
const documentLabels: Array<{ type: DocumentType; label: string }> = [
  { type: "tax_id", label: "NIF/CIF" },
  { type: "bank_certificate", label: "Certificado bancario" },
  { type: "activity_license", label: "Licencia de actividad" },
  { type: "insurance", label: "Seguro de responsabilidad civil" },
  { type: "food_sanitary_authorization", label: "Autorización sanitaria" },
];
const fields = [
  ["name", "Nombre comercial", "La Tasca de Xàtiva"], ["email", "Email de contacto", "hola@restaurante.es"], ["phone", "Teléfono", "600000000"], ["address", "Dirección operativa", "Calle, número y local"], ["legalName", "Razón social", "Empresa o nombre del autónomo"], ["taxId", "NIF/CIF", "B12345678"], ["representativeName", "Representante legal", "Nombre y apellidos"], ["representativeRole", "Cargo", "Administrador"], ["representativeDocument", "DNI/NIE del representante", "12345678A"], ["fiscalAddress", "Domicilio fiscal", "Dirección fiscal"], ["operatingAddress", "Dirección del local", "Dirección del restaurante"], ["postalCode", "Código postal", "46800"], ["city", "Localidad", "Xàtiva"], ["province", "Provincia", "Valencia"], ["iban", "IBAN", "ES00..."], ["bankAccountHolder", "Titular de la cuenta", "Razón social"], ["cuisine", "Tipo de cocina", "Mediterránea"],
] as const;
const initialValues: Record<string, string> = Object.fromEntries(fields.map(([key]) => [key, key === "city" ? "Xàtiva" : key === "province" ? "Valencia" : ""]));
function nowIso() { return new Date().toISOString(); }
async function filePayload(file: File, type: DocumentType) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte);
  return { type, fileName: file.name, mimeType: file.type || "application/pdf", sizeBytes: file.size, sha256, contentBase64: btoa(binary) };
}
export default function PartnerOnboarding() {
  const [values, setValues] = useState(initialValues); const [password, setPassword] = useState(""); const [documents, setDocuments] = useState<Partial<Record<DocumentType, File>>>({}); const [accepted, setAccepted] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [result, setResult] = useState<{ partnerCode: string; stripeUrl: string | null } | null>(null);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError("");
    if (!accepted) { setError("Debes aceptar las condiciones del marketplace y el tratamiento de datos."); return; }
    if (Object.keys(documents).length !== documentLabels.length) { setError("Adjunta los cinco documentos obligatorios en PDF."); return; }
    setBusy(true);
    try {
      const body = { ...values, password, legalForm: values.legalForm || "otra", vatRate: 21, commissionAccepted: true, termsAcceptedAt: nowIso(), contractAccepted: true, privacyAccepted: true, dataProcessingAccepted: true, pdaUnits: 1, pdaUnitCostCents: 30000, pdaCostAccepted: true, pdaCostAcceptedAt: nowIso(), privacyAcceptedAt: nowIso(), dataProcessingAcceptedAt: nowIso(), openingHours: { monday: { open: "09:00", close: "23:00", closed: false }, tuesday: { open: "09:00", close: "23:00", closed: false }, wednesday: { open: "09:00", close: "23:00", closed: false }, thursday: { open: "09:00", close: "23:00", closed: false }, friday: { open: "09:00", close: "23:00", closed: false }, saturday: { open: "09:00", close: "23:00", closed: false }, sunday: { open: "09:00", close: "23:00", closed: false } }, documents: await Promise.all(documentLabels.map(({ type }) => filePayload(documents[type]!, type))) };
      const response = await fetch(`${apiOrigin}/api/v1/partners/onboarding`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.message || payload.error || "No se pudo enviar el alta.");
      setResult({ partnerCode: payload.partner?.partnerCode || "PIKI-PARTNER", stripeUrl: payload.partner?.stripe_onboarding_url || null });
    } catch (submissionError) { setError(submissionError instanceof Error ? submissionError.message : "No se pudo completar el registro."); } finally { setBusy(false); }
  };
  if (result) return <main className="onboarding-public-page"><section className="onboarding-success"><CheckCircle2 size={48} /><p className="section-kicker">ALTA RECIBIDA</p><h1>Tu expediente PIKI está en marcha</h1><p>Código de partner: <strong>{result.partnerCode}</strong>. Hemos guardado tu perfil y documentación. Completa Stripe para que podamos liquidar tus ventas cuando el expediente sea aprobado.</p>{result.stripeUrl ? <a className="onboarding-submit" href={result.stripeUrl}>Completar verificación Stripe</a> : <p className="onboarding-note">El enlace Stripe estará disponible cuando el equipo active la configuración de pagos.</p>}</section></main>;
  return <main className="onboarding-public-page"><form className="onboarding-public-card" onSubmit={(event) => void submit(event)}><div className="onboarding-public-head"><ShieldCheck size={28} /><div><p className="section-kicker">PIKI MARKETPLACE</p><h1>Únete como partner</h1><p>Completa el expediente una sola vez. PIKI revisará la documentación y te guiará con Stripe Connect.</p></div></div><div className="onboarding-fields">{fields.map(([key, label, placeholder]) => <label key={key}>{label}<input required value={values[key]} placeholder={placeholder} type={key === "email" ? "email" : "text"} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} /></label>)}<label>Contraseña del panel<input required minLength={12} pattern="(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9]).*" type="password" value={password} placeholder="Mínimo 12 caracteres, mayúscula, minúscula y número" onChange={(event) => setPassword(event.target.value)} /></label></div><label>Forma jurídica<select value={values.legalForm || "otra"} onChange={(event) => setValues((current) => ({ ...current, legalForm: event.target.value }))}><option value="autonomo">Autónomo</option><option value="sl">Sociedad limitada</option><option value="sa">Sociedad anónima</option><option value="cooperativa">Cooperativa</option><option value="otra">Otra</option></select></label><section className="onboarding-documents"><h2>Documentación obligatoria</h2><p>Solo PDF, hasta 2,5 MB por archivo. Los ficheros se validan y escanean antes de guardarse.</p>{documentLabels.map(({ type, label }) => <label className="onboarding-file" key={type}><FileText size={18} /><span>{label}<small>{documents[type]?.name || "Seleccionar PDF"}</small></span><input required type="file" accept="application/pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) setDocuments((current) => ({ ...current, [type]: file })); }} /></label>)}</section><label className="onboarding-consent"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /> Acepto las condiciones del marketplace PIKI, el contrato de partner, la política de privacidad y el tratamiento de datos necesario para validar el negocio.</label>{error && <p className="onboarding-error" role="alert">{error}</p>}<button className="onboarding-submit" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={18} /> Validando expediente…</> : "Enviar expediente y continuar con Stripe"}</button></form></main>;
}
