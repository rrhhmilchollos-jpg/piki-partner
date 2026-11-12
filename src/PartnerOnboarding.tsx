import { useState } from "react";
import { CheckCircle2, FileText, LoaderCircle, ShieldCheck } from "lucide-react";
import { apiOrigin } from "./partnerApi";
import { buildPartnerOnboardingPayload, documentLabels, initialOpeningHours, parsePartnerReceipt, PDA_UNIT_COST_CENTS, validateDocument, weekdays } from "./partnerOnboardingPayload";
import type { Documents, OpeningDay, PartnerReceipt, Slot, Weekday } from "./partnerOnboardingPayload";
import "./PartnerOnboarding.css";

const fields = [
  ["name", "Nombre comercial", "La Tasca de Xàtiva"], ["email", "Email de contacto", "hola@restaurante.es"], ["phone", "Teléfono", "600000000"], ["address", "Dirección operativa", "Calle, número y local"], ["legalName", "Razón social", "Empresa o nombre del autónomo"], ["taxId", "NIF/CIF", "B12345678"], ["representativeName", "Representante legal", "Nombre y apellidos"], ["representativeRole", "Cargo", "Administrador"], ["representativeDocument", "DNI/NIE del representante", "12345678A"], ["fiscalAddress", "Domicilio fiscal", "Dirección fiscal"], ["operatingAddress", "Dirección del local", "Dirección del restaurante"], ["postalCode", "Código postal", "46800"], ["city", "Localidad", "Xàtiva"], ["province", "Provincia", "Valencia"], ["iban", "IBAN", "ES00..."], ["bankAccountHolder", "Titular de la cuenta", "Razón social"], ["cuisine", "Tipo de cocina", "Mediterránea"],
] as const;
const initialValues: Record<string, string> = Object.fromEntries(fields.map(([key]) => [key, key === "city" ? "Xàtiva" : key === "province" ? "Valencia" : ""]));
const euro = (cents: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);

export default function PartnerOnboarding() {
  const [values, setValues] = useState(initialValues);
  const [password, setPassword] = useState("");
  const [documents, setDocuments] = useState<Documents>({});
  const [accepted, setAccepted] = useState(false);
  const [hours, setHours] = useState(initialOpeningHours);
  const [vatRate, setVatRate] = useState("");
  const [pdaUnits, setPdaUnits] = useState(1);
  const [pdaCostAccepted, setPdaCostAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PartnerReceipt | null>(null);
  const [uploadedCount, setUploadedCount] = useState(0);
  const changed = () => { setPdaCostAccepted(false); setError(""); };
  const changeDay = (day: Weekday, patch: Partial<OpeningDay>) => {
    changed(); setHours((current) => ({ ...current, [day]: { ...current[day], ...patch } }));
  };
  const changeSlot = (day: Weekday, period: "morning" | "evening", patch: Partial<Slot>) => {
    changed(); setHours((current) => ({ ...current, [day]: { ...current[day], [period]: { ...current[day][period], ...patch } } }));
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError(""); setBusy(true);
    try {
      const body = await buildPartnerOnboardingPayload({ values, password, documents, hours, vatRate, pdaUnits, pdaUnitCostCents: PDA_UNIT_COST_CENTS, accepted, pdaCostAccepted });
      const response = await fetch(`${apiOrigin}/api/v1/partners/onboarding`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = payload && typeof payload === "object" ? (payload as Record<string, unknown>).message || (payload as Record<string, unknown>).error : null;
        throw new Error(typeof message === "string" ? message : "No se pudo enviar el alta.");
      }
      const receipt = parsePartnerReceipt(payload);
      setUploadedCount(Object.keys(documents).length); setResult(receipt);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "No se pudo completar el registro.");
    } finally { setBusy(false); }
  };
  if (result) return <main className="onboarding-public-page"><section className="onboarding-success">
    <CheckCircle2 size={48} /><p className="section-kicker">ALTA RECIBIDA · PENDIENTE DE REVISIÓN</p><h1>Tu expediente PIKI está en marcha</h1>
    <p>Código de partner: <strong>{result.partnerCode}</strong>. El servidor ha recibido tu perfil{uploadedCount ? ` y ${uploadedCount} documento(s) aportado(s)` : ", sin adjuntos"}. La solicitud sigue pendiente de revisión: no implica aprobación legal ni activación del negocio.</p>
    {result.stripeUrl ? <a className="onboarding-submit" href={result.stripeUrl}>Completar verificación Stripe</a> : <p className="onboarding-note">El enlace Stripe estará disponible cuando el equipo active la configuración de pagos.</p>}
  </section></main>;
  return <main className="onboarding-public-page"><form className="onboarding-public-card" onSubmit={submit}>
    <div className="onboarding-public-head"><ShieldCheck size={28} /><div><p className="section-kicker">PIKI MARKETPLACE</p><h1>Únete como partner</h1><p>Completa tu perfil y configura tus horarios. Los adjuntos son opcionales en esta fase; la revisión de PIKI y la verificación Stripe siguen siendo necesarias.</p></div></div>
    <fieldset className="onboarding-inputs" disabled={busy}>
      <div className="onboarding-fields">{fields.map(([key, label, placeholder]) => <label key={key}>{label}<input name={key} required value={values[key]} placeholder={placeholder} type={key === "email" ? "email" : "text"} onChange={(event) => { changed(); setValues((current) => ({ ...current, [key]: event.target.value })); }} /></label>)}
        <label>Contraseña del panel<input name="password" required minLength={12} maxLength={200} pattern="(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9]).*" type="password" value={password} placeholder="Mínimo 12 caracteres, mayúscula, minúscula y número" onChange={(event) => { changed(); setPassword(event.target.value); }} /></label>
        <label>Forma jurídica<select name="legalForm" value={values.legalForm || "otra"} onChange={(event) => { changed(); setValues((current) => ({ ...current, legalForm: event.target.value })); }}><option value="autonomo">Autónomo</option><option value="sl">Sociedad limitada</option><option value="sa">Sociedad anónima</option><option value="cooperativa">Cooperativa</option><option value="otra">Otra</option></select></label>
        <label>IVA aplicable<select name="vatRate" required value={vatRate} onChange={(event) => { changed(); setVatRate(event.target.value); }}><option value="" disabled>Selecciona el tipo aplicable</option>{[4, 10, 21].map((rate) => <option key={rate} value={rate}>{rate} %</option>)}</select></label>
      </div>
      <section className="onboarding-documents"><h2>Horarios de apertura</h2><p>Europe/Madrid · formato 24 h (HH:MM). Activa y configura las franjas reales de cada día. Cierre 00:00 y turnos nocturnos admitidos; si el cierre es anterior a la apertura, corresponde al día siguiente. No hay horarios preseleccionados.</p>
        {weekdays.map((day) => <fieldset className="onboarding-day" key={day}><legend>{day.charAt(0).toUpperCase() + day.slice(1)}</legend>
          <label className="onboarding-consent"><input type="checkbox" aria-label={`${day}: día cerrado`} checked={hours[day].closed} onChange={(event) => changeDay(day, { closed: event.target.checked })} />Día cerrado</label>
          <div className="onboarding-fields">{(["morning", "evening"] as const).map((period) => <div className="onboarding-slot" key={period}>
            <label className="onboarding-consent"><input type="checkbox" aria-label={`${day}: ${period === "morning" ? "mañana" : "tarde-noche"} cerrada`} disabled={hours[day].closed} checked={hours[day][period].closed} onChange={(event) => changeSlot(day, period, { closed: event.target.checked })} />{period === "morning" ? "Mañana" : "Tarde-noche"} cerrada</label>
            {(["open", "close"] as const).map((bound) => <label key={bound}>{bound === "open" ? "Apertura" : "Cierre"}<input type="time" step={60} aria-label={`${day}: ${period === "morning" ? "mañana" : "tarde-noche"} ${bound === "open" ? "apertura" : "cierre"}`} disabled={hours[day].closed || hours[day][period].closed} required={!hours[day].closed && !hours[day][period].closed} value={hours[day][period][bound]} onChange={(event) => changeSlot(day, period, { [bound]: event.target.value })} /></label>)}
          </div>)}</div>
        </fieldset>)}
      </section>
      <section className="onboarding-documents"><h2>Documentación opcional</h2><p>Puedes aportar de cero a cinco archivos. PDF, JPG o PNG, hasta 2.500.000 bytes (2,5 MB) por archivo. Los aportados mantienen la validación y el escáner del servidor. No aportar adjuntos no supone aprobación ni exención de requisitos legales.</p>
        {documentLabels.map(({ type, label }) => <label className="onboarding-file" key={type}><FileText size={18} /><span>{label}<small>{documents[type]?.name || "Opcional · seleccionar archivo"}</small></span><input type="file" name={type} accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" onChange={(event) => {
          changed(); const file = event.target.files?.[0];
          setDocuments((current) => { const next = { ...current }; delete next[type]; return next; });
          if (!file) return;
          try { validateDocument(file, type); setDocuments((current) => ({ ...current, [type]: file })); }
          catch (fileError) { event.target.value = ""; setError(fileError instanceof Error ? fileError.message : "Archivo no válido."); }
        }} /></label>)}
      </section>
      <section className="onboarding-documents"><h2>Equipamiento PDA</h2><p>200 € por unidad. Esta aceptación del coste no realiza un cobro.</p>
        <label>Unidades PDA<input type="number" name="pdaUnits" min={1} max={50} step={1} required value={Number.isNaN(pdaUnits) ? "" : pdaUnits} onChange={(event) => { changed(); setPdaUnits(event.target.value === "" ? NaN : Number(event.target.value)); }} /></label>
        <p aria-live="polite">Total PDA: <strong>{Number.isInteger(pdaUnits) && pdaUnits >= 1 && pdaUnits <= 50 ? euro(PDA_UNIT_COST_CENTS * pdaUnits) : "Selecciona entre 1 y 50 unidades"}</strong></p>
        <label className="onboarding-consent"><input type="checkbox" name="pdaCostAccepted" required checked={pdaCostAccepted} onChange={(event) => setPdaCostAccepted(event.target.checked)} />Acepto expresamente el coste de {Number.isNaN(pdaUnits) ? "las" : pdaUnits} PDA a 200 € por unidad. Debo volver a confirmarlo si cambio los datos del alta.</label>
      </section>
      <label className="onboarding-consent"><input type="checkbox" name="accepted" required checked={accepted} onChange={(event) => { changed(); setAccepted(event.target.checked); }} /> Acepto las condiciones del marketplace PIKI, el contrato de partner, la política de privacidad y el tratamiento de datos necesario para validar el negocio.</label>
    </fieldset>
    {error && <p className="onboarding-error" role="alert">{error}</p>}
    <button className="onboarding-submit" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={18} /> Validando expediente…</> : "Enviar expediente"}</button>
  </form></main>;
}
