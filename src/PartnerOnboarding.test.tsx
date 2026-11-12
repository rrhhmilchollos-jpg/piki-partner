/// <reference types="node" />
import { beforeEach, describe, expect, it, vi } from "vitest";
import PartnerOnboarding from "./PartnerOnboarding";
import { buildPartnerOnboardingPayload, documentLabels, initialOpeningHours, openingHoursPayload, parsePartnerReceipt, validateDocument, weekdays } from "./partnerOnboardingPayload";
import type { DocumentType, Intake } from "./partnerOnboardingPayload";

const runtime = vi.hoisted(() => ({ slots: [] as any[], cursor: 0 }));
vi.mock("react", async () => {
  const original = await vi.importActual<typeof import("react")>("react");
  return { ...original, useState: (initial: any) => {
    const index = runtime.cursor++;
    if (!(index in runtime.slots)) runtime.slots[index] = typeof initial === "function" ? initial() : initial;
    return [runtime.slots[index], (next: any) => { runtime.slots[index] = typeof next === "function" ? next(runtime.slots[index]) : next; }];
  } };
});
const validProfile = {
  name: "Fixture local", email: "owner@fixture.invalid", phone: "600000000", address: "Calle fixture 1", legalName: "Fixture SL", taxId: "B12345678", legalForm: "sl",
  representativeName: "Fixture Owner", representativeRole: "Administrador", representativeDocument: "12345678A", fiscalAddress: "Calle fixture 1", operatingAddress: "Calle fixture 1", postalCode: "46800", city: "Xàtiva", province: "Valencia", iban: "ES9121000418450200051332", bankAccountHolder: "Fixture SL", cuisine: "Mediterránea",
};
const receipt = { partner: { id: "507f1f77bcf86cd799439011", partnerCode: "PIKI-P-507F1F77BCF86CD799439011", onboarding_status: "pending_review", stripe_onboarding_url: null } };
function intake(): Intake {
  const hours = initialOpeningHours();
  hours.lunes = { closed: false, morning: { open: "10:15", close: "13:45", closed: false }, evening: { open: "19:30", close: "00:00", closed: false } };
  return { values: validProfile, password: "FixturePassword123", documents: {}, hours, vatRate: "10", pdaUnits: 2, pdaUnitCostCents: 20000, accepted: true, pdaCostAccepted: true };
}
function nodes(tree: any): any[] {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function render() { runtime.cursor = 0; return PartnerOnboarding(); }
function input(name: string) { return nodes(render()).find((node) => node.props?.name === name)!; }
function aria(label: string) { return nodes(render()).find((node) => node.props?.["aria-label"] === label)!; }
function change(name: string, value: unknown) { input(name).props.onChange({ target: { value, checked: value } }); }
function setupForm() {
  for (const [name, value] of Object.entries(validProfile)) change(name, value);
  change("password", "FixturePassword123"); change("vatRate", "10");
  aria("lunes: día cerrado").props.onChange({ target: { checked: false } });
  aria("lunes: mañana cerrada").props.onChange({ target: { checked: false } });
  aria("lunes: mañana apertura").props.onChange({ target: { value: "10:15" } });
  aria("lunes: mañana cierre").props.onChange({ target: { value: "13:45" } });
  change("accepted", true); change("pdaCostAccepted", true);
}
async function submit() { await nodes(render()).find((node) => node.type === "form")!.props.onSubmit({ preventDefault: vi.fn() }); }
function mockedFetch(response = Response.json(receipt, { status: 201 })) {
  const mock = vi.fn(async (url: string, init: RequestInit) => {
    if (!url.endsWith("/api/v1/partners/onboarding") || init.method !== "POST" || (init.headers as Record<string, string>)["Content-Type"] !== "application/json") throw new Error("Unexpected offline request");
    return response;
  });
  vi.stubGlobal("fetch", mock); return mock;
}
beforeEach(() => { runtime.slots = []; runtime.cursor = 0; });

describe("new Partner intake payload (offline)", () => {
  it("omits optional documents, sends exact 20000 and chosen VAT/hours, keeps required profile/consents", async () => {
    const body = await buildPartnerOnboardingPayload(intake());
    expect(body).not.toHaveProperty("documents");
    expect(body).toMatchObject({ ...validProfile, vatRate: 10, pdaUnits: 2, pdaUnitCostCents: 20000, pdaCostAccepted: true, commissionAccepted: true, contractAccepted: true, privacyAccepted: true, dataProcessingAccepted: true });
    expect(body.pdaCostAcceptedAt).toMatch(/^\d{4}-/);
    expect(body.openingHours.lunes.evening).toEqual({ open: "19:30", close: "00:00", closed: false });
    expect(body.openingHours.martes.closed).toBe(true);
    expect(body.openingHours).not.toHaveProperty("monday");
  });
  it.each([1, 5])("encodes only %i provided files, exact bytes and SHA-256", async (count) => {
    const value = intake();
    for (const { type } of documentLabels.slice(0, count)) value.documents[type] = new File(["%PDF-1.7\nfixture attachment bytes"], `${type}.pdf`, { type: "application/pdf" });
    const body = await buildPartnerOnboardingPayload(value);
    expect(body.documents).toHaveLength(count);
    for (const file of body.documents!) {
      expect(file.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(atob(file.contentBase64).length).toBe(file.sizeBytes);
      expect(file.mimeType).toBe("application/pdf");
    }
  });
  it.each(["4", "10", "21"])("allows explicitly selected VAT %s", async (vatRate) => expect((await buildPartnerOnboardingPayload({ ...intake(), vatRate })).vatRate).toBe(Number(vatRate)));
  it.each([0, 51, 1.5, NaN])("rejects invalid PDA units %s", async (pdaUnits) => await expect(buildPartnerOnboardingPayload({ ...intake(), pdaUnits })).rejects.toThrow("1 y 50"));
  it.each([30000, 19999])("rejects legacy/other explicit price %s", async (pdaUnitCostCents) => await expect(buildPartnerOnboardingPayload({ ...intake(), pdaUnitCostCents })).rejects.toThrow("200 €"));
  it.each([{ accepted: false }, { pdaCostAccepted: false }, { vatRate: "" }, { password: "weak" }])("rejects missing explicit consent/VAT/valid password %j", async (patch) => await expect(buildPartnerOnboardingPayload({ ...intake(), ...patch })).rejects.toThrow());
  it.each([{ legalName: "" }, { taxId: "bad" }, { iban: "not-an-iban" }, { bankAccountHolder: "" }])("optional files never bypass required legal/bank field %j", async (patch) => await expect(buildPartnerOnboardingPayload({ ...intake(), values: { ...validProfile, ...patch } })).rejects.toThrow());
  it("accepts maximum 50 units at the same explicit unit cost", async () => expect(await buildPartnerOnboardingPayload({ ...intake(), pdaUnits: 50 })).toMatchObject({ pdaUnits: 50, pdaUnitCostCents: 20000, pdaCostAccepted: true }));
  it("starts closed with blank times and rejects unconfigured/all-closed schedule", () => {
    const hours = initialOpeningHours();
    for (const day of weekdays) expect(hours[day]).toEqual({ closed: true, morning: { open: "", close: "", closed: true }, evening: { open: "", close: "", closed: true } });
    expect(() => openingHoursPayload(hours)).toThrow("al menos una franja");
    hours.lunes.closed = false; hours.lunes.morning.closed = false;
    expect(() => openingHoursPayload(hours)).toThrow("HH:MM");
  });
  it.each(["24:00", "9:00", "12:60", "13:45"])("rejects invalid/equal active opening %s", (open) => {
    const { hours } = intake(); hours.lunes.morning.open = open;
    expect(() => openingHoursPayload(hours)).toThrow("HH:MM");
  });
  it("allows overnight 00:00 and independent closure without filling active defaults", () => {
    const { hours } = intake(); hours.lunes.morning.closed = true;
    const body = openingHoursPayload(hours);
    expect(body.lunes.morning.closed).toBe(true); expect(body.lunes.evening.closed).toBe(false);
    expect(body.martes).toEqual({ closed: true, morning: { open: "00:00", close: "00:00", closed: true }, evening: { open: "00:00", close: "00:00", closed: true } });
  });
  it.each([["doc.jpg", "image/jpeg"], ["doc.jpeg", "image/jpeg"], ["doc.png", "image/png"], ["doc.pdf", "application/pdf"]])("accepts optional %s/%s", (name, type) => expect(() => validateDocument(new File(["fixture"], name, { type }), "tax_id")).not.toThrow());
  it.each([["doc.pdf", ""], ["doc.exe", "application/pdf"], ["doc.pdf", "text/plain"], ["doc.png", "application/pdf"]])("rejects local MIME/extension mismatch %s/%s", (name, type) => expect(() => validateDocument(new File(["fixture"], name, { type }), "tax_id")).toThrow("MIME"));
  it("rejects oversized/empty uploads and unknown document type", () => {
    expect(() => validateDocument(new File([new Uint8Array(2_500_001)], "doc.pdf", { type: "application/pdf" }), "tax_id")).toThrow("2.500.000");
    expect(() => validateDocument(new File([], "doc.pdf", { type: "application/pdf" }), "tax_id")).toThrow();
    expect(() => validateDocument(new File(["fixture"], "doc.pdf", { type: "application/pdf" }), "unknown" as DocumentType)).toThrow("Tipo");
    expect(() => validateDocument(new File([new Uint8Array(2_500_000)], "doc.pdf", { type: "application/pdf" }), "tax_id")).not.toThrow();
  });
});

describe("real Partner form callbacks (offline)", () => {
  it("has optional uploads, empty VAT selection and seven accessible split days", () => {
    for (const { type } of documentLabels) expect(input(type).props.required).not.toBe(true);
    expect(input("vatRate").props.value).toBe("");
    for (const day of weekdays) {
      expect(aria(`${day}: día cerrado`).props.checked).toBe(true);
      expect(aria(`${day}: mañana apertura`).props.value).toBe("");
      expect(aria(`${day}: tarde-noche cierre`).props.value).toBe("");
    }
  });
  it("posts the real zero-file 200 EUR body and displays only pending receipt", async () => {
    setupForm(); const mock = mockedFetch(); await submit();
    expect(mock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(mock.mock.calls[0][1].body as string);
    expect(body).toMatchObject({ pdaUnits: 1, pdaUnitCostCents: 20000, vatRate: 10 });
    expect(body.documents).toBeUndefined(); expect(body.openingHours.lunes.morning.open).toBe("10:15");
    expect(JSON.stringify(render())).toContain("PENDIENTE DE REVISIÓN"); expect(JSON.stringify(render())).toContain(receipt.partner.partnerCode);
  });
  it.each(["pdaUnits", "vatRate", "name", "password", "accepted"])("invalidates PDA consent on changed %s", async (name) => {
    setupForm(); change(name, name === "pdaUnits" ? 3 : name === "accepted" ? true : name === "vatRate" ? "21" : "ChangedFixture123");
    expect(input("pdaCostAccepted").props.checked).toBe(false);
    const mock = mockedFetch(); await submit(); expect(mock).not.toHaveBeenCalled();
  });
  it("shows total 200×units and requires renewed consent before real new body", async () => {
    setupForm(); change("pdaUnits", 3); expect(JSON.stringify(render())).toContain("600"); change("pdaCostAccepted", true);
    const mock = mockedFetch(); await submit(); expect(JSON.parse(mock.mock.calls[0][1].body as string)).toMatchObject({ pdaUnits: 3, pdaUnitCostCents: 20000, pdaCostAccepted: true });
  });
  it("preserves operator hours through day/slot closure and renews cost consent", () => {
    setupForm(); aria("lunes: mañana cerrada").props.onChange({ target: { checked: true } });
    expect(input("pdaCostAccepted").props.checked).toBe(false);
    expect(aria("lunes: mañana apertura").props.value).toBe("10:15");
    aria("lunes: día cerrado").props.onChange({ target: { checked: true } });
    aria("lunes: día cerrado").props.onChange({ target: { checked: false } });
    expect(aria("lunes: mañana cerrada").props.checked).toBe(true);
    expect(aria("lunes: mañana cierre").props.value).toBe("13:45");
  });
  it("uploads only the selected optional PDF through the real submit", async () => {
    setupForm(); input("tax_id").props.onChange({ target: { files: [new File(["%PDF-1.7\nfixture attachment bytes"], "doc.pdf", { type: "application/pdf" })] } });
    expect(input("pdaCostAccepted").props.checked).toBe(false); change("pdaCostAccepted", true);
    const mock = mockedFetch(); await submit(); expect(JSON.parse(mock.mock.calls[0][1].body as string).documents).toHaveLength(1);
  });
  it.each([new File([new Uint8Array(2_500_001)], "big.pdf", { type: "application/pdf" }), new File(["fixture"], "fake.pdf", { type: "text/plain" })])("rejects provided invalid upload locally and drops stale file", (file) => {
    setupForm(); const target = { files: [file], value: "chosen" }; input("tax_id").props.onChange({ target });
    expect(target.value).toBe(""); expect(input("pdaCostAccepted").props.checked).toBe(false);
    expect(nodes(render()).some((node) => node.props?.role === "alert")).toBe(true);
  });
  it.each([503, 422, 400])("never confirms server scanner/validation failure %i", async (status) => {
    setupForm(); mockedFetch(Response.json({ error: status === 503 ? "MALWARE_SCANNER_UNAVAILABLE" : "DOCUMENT_VALIDATION_FAILED" }, { status })); await submit();
    expect(nodes(render()).some((node) => node.type === "form")).toBe(true);
    expect(nodes(render()).some((node) => node.props?.role === "alert")).toBe(true);
  });
  it.each([{}, { partner: {} }, { partner: { ...receipt.partner, id: undefined } }, { partner: { ...receipt.partner, partnerCode: "PIKI-PARTNER" } }, { partner: { ...receipt.partner, onboarding_status: "approved" } }])("rejects false 2xx acknowledgment %j", async (payload) => {
    setupForm(); mockedFetch(Response.json(payload)); await submit();
    expect(nodes(render()).some((node) => node.type === "form")).toBe(true);
    expect(nodes(render()).some((node) => node.props?.role === "alert")).toBe(true);
  });
  it("rejects a plausible code belonging to another partner id", () => expect(() => parsePartnerReceipt({ partner: { ...receipt.partner, partnerCode: "PIKI-P-507F1F77BCF86CD799439012" } })).toThrow());
  it("rejects HTML 200 instead of reporting a fake success", async () => {
    setupForm(); mockedFetch(new Response("<html>SPA fallback</html>", { headers: { "Content-Type": "text/html" } })); await submit();
    expect(nodes(render()).some((node) => node.type === "form")).toBe(true);
    expect(JSON.stringify(render())).not.toContain("ALTA RECIBIDA");
  });
  it("accepts only the server's legitimate HTTPS Stripe connect URL", () => {
    expect(parsePartnerReceipt(receipt).stripeUrl).toBeNull();
    const url = "https://connect.stripe.com/setup/s/fixture";
    expect(parsePartnerReceipt({ partner: { ...receipt.partner, stripe_onboarding_url: url } }).stripeUrl).toBe(url);
    expect(() => parsePartnerReceipt({ partner: { ...receipt.partner, stripe_onboarding_url: "javascript:alert(1)" } })).toThrow();
  });
});
