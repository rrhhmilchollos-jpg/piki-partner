export const PDA_UNIT_COST_CENTS = 20000;
export const MAX_DOCUMENT_BYTES = 2_500_000;
export const documentLabels = [
  { type: "tax_id", label: "NIF/CIF" },
  { type: "bank_certificate", label: "Certificado bancario" },
  { type: "activity_license", label: "Licencia de actividad" },
  { type: "insurance", label: "Seguro de responsabilidad civil" },
  { type: "food_sanitary_authorization", label: "Autorización sanitaria" },
] as const;
export type DocumentType = typeof documentLabels[number]["type"];
export type Documents = Partial<Record<DocumentType, File>>;
export const weekdays = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"] as const;
export type Weekday = typeof weekdays[number];
export type Slot = { open: string; close: string; closed: boolean };
export type OpeningDay = { morning: Slot; evening: Slot; closed: boolean };
export type OpeningHours = Record<Weekday, OpeningDay>;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export function initialOpeningHours(): OpeningHours {
  return Object.fromEntries(weekdays.map((day) => [day, {
    closed: true,
    morning: { open: "", close: "", closed: true },
    evening: { open: "", close: "", closed: true },
  }])) as OpeningHours;
}

export function openingHoursPayload(hours: OpeningHours): OpeningHours {
  let activeSlots = 0;
  const result = Object.fromEntries(weekdays.map((day) => {
    const value = hours[day];
    const slotPayload = (slot: Slot): Slot => {
      if (!value.closed && !slot.closed) {
        if (!timePattern.test(slot.open) || !timePattern.test(slot.close) || slot.open === slot.close) {
          throw new Error(`Configura apertura y cierre distintos en formato HH:MM para ${day}.`);
        }
        activeSlots += 1;
      }
      // The API requires HH:MM even for closed slots. 00:00 here is an
      // inactive structural marker, never an inferred active opening period.
      return { ...slot, open: timePattern.test(slot.open) ? slot.open : "00:00", close: timePattern.test(slot.close) ? slot.close : "00:00" };
    };
    return [day, { closed: value.closed, morning: slotPayload(value.morning), evening: slotPayload(value.evening) }];
  })) as OpeningHours;
  if (!activeSlots) throw new Error("Configura al menos una franja de apertura real antes de enviar el alta.");
  return result;
}

export function validateDocument(file: File, type: DocumentType): void {
  if (!documentLabels.some((document) => document.type === type)) throw new Error("Tipo de documento no admitido.");
  if (file.size <= 0 || file.size > MAX_DOCUMENT_BYTES) throw new Error("Cada archivo debe ocupar entre 1 byte y 2.500.000 bytes (2,5 MB).");
  const extensions: Record<string, RegExp> = {
    "application/pdf": /\.pdf$/i,
    "image/jpeg": /\.jpe?g$/i,
    "image/png": /\.png$/i,
  };
  if (!extensions[file.type]?.test(file.name)) throw new Error("Adjunta PDF, JPG o PNG con extensión y tipo MIME coincidentes.");
  if (!file.name.trim() || file.name.length > 180) throw new Error("El nombre de archivo debe tener entre 1 y 180 caracteres.");
}

async function filePayload(file: File, type: DocumentType) {
  validateDocument(file, type);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return { type, fileName: file.name, mimeType: file.type, sizeBytes: file.size, sha256, contentBase64: btoa(binary) };
}

export type Intake = {
  values: Record<string, string>;
  password: string;
  documents: Documents;
  hours: OpeningHours;
  vatRate: string;
  pdaUnits: number;
  pdaUnitCostCents: number;
  accepted: boolean;
  pdaCostAccepted: boolean;
};

function validateProfile(values: Record<string, string>): void {
  // Existing public API field rules, not a new legal/approval policy.
  const lengths: Record<string, [number, number]> = {
    name: [2, 160], phone: [6, 40], address: [5, 280], legalName: [2, 180],
    representativeName: [2, 160], representativeRole: [2, 100], representativeDocument: [5, 30],
    fiscalAddress: [5, 280], operatingAddress: [5, 280], city: [2, 100], province: [2, 100],
    bankAccountHolder: [2, 180], cuisine: [2, 100],
  };
  for (const [field, [min, max]] of Object.entries(lengths)) {
    if (typeof values[field] !== "string" || values[field].trim().length < min || values[field].length > max) throw new Error(`Completa correctamente el campo obligatorio: ${field}.`);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email || "")) throw new Error("Completa un email de contacto válido.");
  if (!/^[A-Za-z0-9-]{5,20}$/.test(values.taxId || "")) throw new Error("Completa un NIF/CIF válido.");
  if (!/^\d{5}$/.test(values.postalCode || "")) throw new Error("Completa un código postal de cinco dígitos.");
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(values.iban || "")) throw new Error("Completa un IBAN válido en mayúsculas.");
  if (values.legalForm && !["autonomo", "sl", "sa", "cooperativa", "otra"].includes(values.legalForm)) throw new Error("Selecciona una forma jurídica válida.");
}

export async function buildPartnerOnboardingPayload(input: Intake) {
  if (!input.accepted) throw new Error("Debes aceptar las condiciones del marketplace y el tratamiento de datos.");
  if (!Number.isInteger(input.pdaUnits) || input.pdaUnits < 1 || input.pdaUnits > 50) throw new Error("Elige entre 1 y 50 unidades PDA.");
  if (input.pdaUnitCostCents !== PDA_UNIT_COST_CENTS) throw new Error("Las nuevas altas requieren un coste de 200 € por PDA.");
  if (!input.pdaCostAccepted) throw new Error("Confirma expresamente el coste de las unidades PDA seleccionadas.");
  const vatRate = Number(input.vatRate);
  if (![4, 10, 21].includes(vatRate)) throw new Error("Selecciona el IVA aplicable: 4 %, 10 % o 21 %.");
  if (input.password.length < 12 || input.password.length > 200 || !/[A-Z]/.test(input.password) || !/[a-z]/.test(input.password) || !/[0-9]/.test(input.password)) throw new Error("La contraseña requiere 12–200 caracteres, mayúscula, minúscula y número.");
  validateProfile(input.values);
  const openingHours = openingHoursPayload(input.hours);
  const entries = Object.entries(input.documents) as Array<[DocumentType, File]>;
  if (entries.length > 5) throw new Error("Puedes aportar hasta cinco documentos.");
  const documents = await Promise.all(entries.map(([type, file]) => filePayload(file, type)));
  const acceptedAt = new Date().toISOString();
  return {
    ...input.values, password: input.password, legalForm: input.values.legalForm || "otra", vatRate,
    commissionAccepted: true, termsAcceptedAt: acceptedAt, contractAccepted: true, privacyAccepted: true,
    dataProcessingAccepted: true, privacyAcceptedAt: acceptedAt, dataProcessingAcceptedAt: acceptedAt,
    pdaUnits: input.pdaUnits, pdaUnitCostCents: PDA_UNIT_COST_CENTS, pdaCostAccepted: true, pdaCostAcceptedAt: acceptedAt,
    openingHours, ...(documents.length ? { documents } : {}),
  };
}

export type PartnerReceipt = { id: string; partnerCode: string; status: "pending_review"; stripeUrl: string | null };
export function parsePartnerReceipt(payload: unknown): PartnerReceipt {
  const partner = payload && typeof payload === "object" ? (payload as Record<string, unknown>).partner : null;
  if (!partner || typeof partner !== "object") throw new Error("El servidor no confirmó un expediente válido. No se puede confirmar el alta; consulta con PIKI antes de reenviar.");
  const record = partner as Record<string, unknown>;
  // Actual public handler returns Mongoose `partner.id`, not `_id`.
  // server.ts onboardingCode("P", id) returns PIKI-P- plus the uppercase id.
  if (typeof record.id !== "string" || !/^[a-f\d]{24}$/i.test(record.id) || record.partnerCode !== `PIKI-P-${record.id.toUpperCase()}` || record.onboarding_status !== "pending_review") {
    throw new Error("El servidor no confirmó un expediente pendiente con identificador y código reales. Consulta con PIKI antes de reenviar.");
  }
  let stripeUrl: string | null = null;
  if (record.stripe_onboarding_url != null) {
    if (typeof record.stripe_onboarding_url !== "string") throw new Error("Enlace de verificación Stripe no válido en el recibo.");
    const url = new URL(record.stripe_onboarding_url);
    if (url.protocol !== "https:" || url.hostname !== "connect.stripe.com" || url.username || url.password) throw new Error("Enlace de verificación Stripe no válido en el recibo.");
    stripeUrl = record.stripe_onboarding_url;
  }
  return { id: record.id, partnerCode: record.partnerCode, status: "pending_review", stripeUrl };
}
