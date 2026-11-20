// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://fixture.partner.invalid/"}
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import EmployeeAuthGate from "./EmployeeAuthGate";

// Mount the real App, gate, forms and React event handlers. Only unrelated
// operational/native children are stubbed; all network calls are explicit mocks.
vi.mock("./components/CookieConsent", () => ({ default: () => null }));
vi.mock("./MenuEditor", () => ({ default: () => null }));
vi.mock("./MenuAvailability", () => ({ default: () => null }));
vi.mock("./OrdersBoard", () => ({ default: () => null }));
vi.mock("./ArchivedOrdersBoard", () => ({ default: () => null }));
vi.mock("./PerformanceView", () => ({ default: () => null }));
vi.mock("./PartnerOnboarding", () => ({ default: () => null }));
vi.mock("./GoogleBusinessSettings", () => ({ default: () => null }));
vi.mock("./PartnerAccountSummary", () => ({ default: () => null }));
vi.mock("./PartnerAccountIdentity", () => ({ default: () => null }));
vi.mock("./PartnerNativeNotificationControl", () => ({ default: () => null }));
vi.mock("./PartnerKitchenReception", () => ({ PartnerKitchenReceptionProvider: () => null }));
vi.mock("./partnerNativeNotifications", () => ({ isPartnerNativeAndroid: () => false, partnerNativeNotifications: { clearAllOrders: vi.fn() } }));
vi.mock("./pwaUpdateRuntime", () => ({ usePwaUpdateBlocker: () => undefined }));

const tokenKey = "piki-fixture.partner.invalid-api-token";
const newPassword = "NuevaClave12";
const resetSecret = "fixture-one-use-recovery-secret";
const rule = "La nueva contraseña debe tener entre 12 y 200 caracteres e incluir al menos una mayúscula, una minúscula y un número.";
let container: HTMLDivElement;
let root: Root;
const authenticated = vi.fn();

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
  authenticated.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  globalThis.fetch = vi.fn(async () => { throw new Error("Unexpected offline fixture request"); });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mountGate(reset = true) {
  if (reset) window.history.replaceState({}, "", `/?reset=${resetSecret}`);
  await act(async () => root.render(<EmployeeAuthGate apiOrigin="/fixture-api" onAuthenticated={authenticated} />));
}
function field(label: string): HTMLInputElement {
  const wrapper = [...container.querySelectorAll("label")].find((element) => element.firstChild?.textContent === label);
  const input = wrapper?.querySelector("input");
  expect(input, `visible input: ${label}`).toBeDefined();
  return input!;
}
async function fill(label: string, value: string) {
  const input = field(label);
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}
async function click(text: string) {
  const button = [...container.querySelectorAll("button")].find((element) => element.textContent?.trim() === text);
  expect(button, `visible button: ${text}`).toBeDefined();
  await act(async () => button!.click());
}
async function submit() {
  // Native validation is enabled: this exercises the actual button/form route,
  // especially the old hidden required-email blocker after a PIKI-code login.
  await click("Guardar contraseña");
}
async function submitProgrammatically() {
  // The handler must also protect API calls when browser validation is bypassed.
  await act(async () => container.querySelector("form")!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
}
async function fillNewPassword(value = newPassword, confirmation = value) {
  await fill("Nueva contraseña", value);
  await fill("Confirmar nueva contraseña", confirmation);
}
function expectNoRecoveryPersistence() {
  expect(window.location.href).not.toContain(resetSecret);
  expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain(resetSecret);
  expect(container.innerHTML).not.toContain(resetSecret);
}

const sessionFixtures = [
  { name: "sesión válida persistente", status: 200, storage: "local" },
  { name: "sesión temporal que exigiría cambio", status: 428, storage: "session" },
  { name: "sesión con conexión pendiente", status: 503, storage: "local" },
] as const;

describe("App real: enlace de recuperación sobre la sesión guardada", () => {
  it.each(sessionFixtures)("prioriza reset frente a $name sin /me, logout, almacenamiento ni logs del secreto", async ({ status, storage }) => {
    const oldSession = "fixture-existing-session";
    (storage === "local" ? localStorage : sessionStorage).setItem(tokenKey, oldSession);
    window.history.replaceState({}, "", `/access?next=orders&reset=${resetSecret}#access`);
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).endsWith("/employee/me")) return Response.json({ employee: { id: "fixture", restaurants: [] } }, { status });
      if (String(url).endsWith("/password-reset/confirm")) return new Response(null, { status: 204 });
      throw new Error("Unexpected offline fixture request");
    });
    const writes = [vi.spyOn(localStorage, "setItem"), vi.spyOn(sessionStorage, "setItem")];
    const logs = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")];
    await act(async () => root.render(<App />));
    expect(container.querySelector("h2")?.textContent).toBe("Crea una contraseña nueva");
    expect(container.textContent).not.toContain("Comprobando acceso");
    expect(window.location.pathname + window.location.search + window.location.hash).toBe("/access?next=orders#access");
    expect(fetch).not.toHaveBeenCalled();
    expectNoRecoveryPersistence();
    await act(async () => document.dispatchEvent(new window.Event("visibilitychange")));
    expect(fetch).not.toHaveBeenCalled();
    await fillNewPassword();
    await submit();
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toMatch(/\/api\/v1\/auth\/employee\/password-reset\/confirm$/);
    expect(init).toMatchObject({ method: "POST", headers: { "Content-Type": "application/json", "X-PIKI-Surface": "partner" } });
    expect((init!.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(JSON.parse(String(init!.body))).toEqual({ token: resetSecret, newPassword });
    expect(container.querySelector("h2")?.textContent).toBe("Entra a tu local");
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Contraseña actualizada");
    expect((storage === "local" ? localStorage : sessionStorage).getItem(tokenKey)).toBe(oldSession);
    expectNoRecoveryPersistence();
    for (const write of writes) expect(JSON.stringify(write.mock.calls)).not.toContain(resetSecret);
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });

  it("volver al login desde reset tampoco cierra ni revoca la sesión existente", async () => {
    localStorage.setItem(tokenKey, "fixture-existing-session");
    window.history.replaceState({}, "", `/?reset=${resetSecret}`);
    await act(async () => root.render(<App />));
    await click("Volver al inicio de sesión");
    expect(container.querySelector("h2")?.textContent).toBe("Entra a tu local");
    expect(localStorage.getItem(tokenKey)).toBe("fixture-existing-session");
    expect(fetch).not.toHaveBeenCalled();
    expectNoRecoveryPersistence();
  });

  it("reset exitoso exige login explícito y solo entonces reemplaza/valida la sesión", async () => {
    localStorage.setItem(tokenKey, "fixture-old-session");
    window.history.replaceState({}, "", `/?reset=${resetSecret}`);
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).endsWith("/password-reset/confirm")) return new Response(null, { status: 204 });
      if (String(url).endsWith("/employee/login")) return Response.json({ accessToken: "fixture-new-session" });
      if (String(url).endsWith("/employee/me")) return Response.json({ employee: { id: "fixture-new", restaurants: [] } });
      throw new Error("Unexpected offline fixture request");
    });
    await act(async () => root.render(<App />));
    await fillNewPassword();
    await submit();
    expect(localStorage.getItem(tokenKey)).toBe("fixture-old-session");
    expect(fetch).toHaveBeenCalledOnce();
    await fill("Correo corporativo o ID PIKI", "PIKI-E-ABC12345");
    await fill("Contraseña", newPassword);
    await click("Iniciar sesión");
    expect(localStorage.getItem(tokenKey)).toBe("fixture-new-session");
    expect(fetch).toHaveBeenCalledTimes(3);
    const [url, init] = vi.mocked(fetch).mock.calls[2];
    expect(String(url)).toMatch(/\/employee\/me$/);
    expect(init).toMatchObject({ headers: { Authorization: "Bearer fixture-new-session" } });
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith("/logout"))).toBe(false);
    expectNoRecoveryPersistence();
  });

  it("mantiene la comprobación normal de sesión sin enlace reset no vacío", async () => {
    localStorage.setItem(tokenKey, "fixture-existing-session");
    window.history.replaceState({}, "", "/?reset=%20%20&next=orders");
    let release!: (response: Response) => void;
    globalThis.fetch = vi.fn(() => new Promise<Response>((resolve) => { release = resolve; }));
    await act(async () => root.render(<App />));
    expect(container.textContent).toContain("Comprobando acceso seguro");
    expect(window.location.search).toBe("?next=orders");
    expect(fetch).toHaveBeenCalledOnce();
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toMatch(/\/employee\/me$/);
    await act(async () => release(Response.json({ error: "fixture" }, { status: 503 })));
    expect(container.querySelector("h2")?.textContent).toBe("Conservamos tu sesión");
    expect(localStorage.getItem(tokenKey)).toBe("fixture-existing-session");
  });
});

describe("Formularios reales: validación y cambio tras ID PIKI", () => {
  it.each([
    ["menos de 12 caracteres", "Clave12"],
    ["más de 200 caracteres", `Aa1${"a".repeat(198)}`],
    ["sin mayúscula", "nuevaclave12"],
    ["sin minúscula", "NUEVACLAVE12"],
    ["sin número", "NuevaClaveXX"],
  ])("rechaza localmente %s antes de llamar al API", async (_name, password) => {
    await mountGate();
    const input = field("Nueva contraseña");
    expect(input.minLength).toBe(12);
    expect(input.maxLength).toBe(200);
    expect(input.getAttribute("aria-describedby")).toBe("partner-password-requirements");
    expect(container.querySelector("#partner-password-requirements")?.textContent).toBe(rule);
    await fillNewPassword(password);
    await submitProgrammatically();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(rule);
    expect(fetch).not.toHaveBeenCalled();
    expect(authenticated).not.toHaveBeenCalled();
  });

  it("exige que la confirmación coincida y permite corregirla", async () => {
    await mountGate();
    await fillNewPassword(newPassword, "OtraClave1234");
    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Las contraseñas no coinciden");
    expect(fetch).not.toHaveBeenCalled();
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 204 }));
    await fill("Confirmar nueva contraseña", newPassword);
    await submit();
    expect(fetch).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it.each([12, 200])("acepta el límite de %i caracteres con los tres grupos", async (length) => {
    await mountGate();
    const password = `Aa1${"a".repeat(length - 3)}`;
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 204 }));
    await fillNewPassword(password);
    expect(container.querySelector("form")!.checkValidity()).toBe(true);
    await submit();
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]!.body)).newPassword).toBe(password);
    expect(container.querySelector("h2")?.textContent).toBe("Entra a tu local");
    expect(authenticated).not.toHaveBeenCalled();
  });

  it("ID PIKI → change no deja email required, valida y solo autentica tras ACK", async () => {
    await mountGate(false);
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).endsWith("/employee/login")) return Response.json({ accessToken: "fixture-temporary-token", requiresPasswordChange: true });
      if (String(url).endsWith("/employee/change-password")) return new Response(null, { status: 204 });
      throw new Error("Unexpected offline fixture request");
    });
    await fill("Correo corporativo o ID PIKI", "PIKI-E-ABC12345");
    await fill("Contraseña", "Temporal12345");
    expect(container.querySelector("form")!.checkValidity()).toBe(true);
    await click("Iniciar sesión");
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]!.body))).toEqual({ identifier: "PIKI-E-ABC12345", password: "Temporal12345", role: "partner" });
    expect(container.querySelector("h2")?.textContent).toBe("Actualiza tu contraseña");
    expect(container.querySelector('input[type="email"]')).toBeNull();
    expect(container.querySelector('input[autocomplete="username"]')).toBeNull();
    expect(authenticated).not.toHaveBeenCalled();
    await fillNewPassword("nuevaclave12");
    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(rule);
    expect(fetch).toHaveBeenCalledTimes(1);
    await fillNewPassword(newPassword, "OtraClave1234");
    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("no coinciden");
    expect(fetch).toHaveBeenCalledTimes(1);
    await fillNewPassword();
    expect(container.querySelector("form")!.checkValidity()).toBe(true);
    await submit();
    const [url, init] = vi.mocked(fetch).mock.calls[1];
    expect(String(url)).toMatch(/\/employee\/change-password$/);
    expect(init).toMatchObject({ method: "POST", headers: { Authorization: "Bearer fixture-temporary-token", "X-PIKI-Surface": "partner" } });
    expect(JSON.parse(String(init!.body))).toEqual({ currentPassword: "Temporal12345", newPassword });
    expect(authenticated).toHaveBeenCalledExactlyOnceWith("fixture-temporary-token");
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain("fixture-temporary-token");
  });

  it("un rechazo API de contraseña temporal conserva change y no autentica antes de corregir", async () => {
    await mountGate(false);
    let rejectChange = true;
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).endsWith("/employee/login")) return Response.json({ accessToken: "fixture-temporary-token", requiresPasswordChange: true });
      if (String(url).endsWith("/employee/change-password")) return rejectChange
        ? Response.json({ error: "INVALID_CURRENT_PASSWORD" }, { status: 400 })
        : new Response(null, { status: 204 });
      throw new Error("Unexpected offline fixture request");
    });
    await fill("Correo corporativo o ID PIKI", "PIKI-E-ABC12345");
    await fill("Contraseña", "Temporal12345");
    await click("Iniciar sesión");
    await fillNewPassword();
    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("La contraseña temporal actual no es correcta.");
    expect(container.querySelector("h2")?.textContent).toBe("Actualiza tu contraseña");
    expect(authenticated).not.toHaveBeenCalled();
    rejectChange = false;
    await fill("Contraseña temporal", "TemporalCorregida12");
    await submit();
    expect(authenticated).toHaveBeenCalledExactlyOnceWith("fixture-temporary-token");
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[2][1]!.body))).toEqual({ currentPassword: "TemporalCorregida12", newPassword });
  });
});

describe("Errores UI reales de recuperación", () => {
  it.each([
    { status: 400, payload: { error: "PASSWORD_RESET_INVALID" }, expected: "El enlace de recuperación no es válido o ha caducado. Solicita un nuevo enlace e inténtalo de nuevo." },
    { status: 429, payload: { error: "RATE_LIMITED", retryAfterSeconds: 900 }, expected: "Demasiados intentos. Espera 15 minutos antes de volver a intentarlo." },
    { status: 503, payload: { error: "fixture" }, expected: "El servicio de PIKI no está disponible ahora. Inténtalo de nuevo en unos minutos." },
  ])("muestra mensaje claro en HTTP $status sin salir del reset ni autenticar", async ({ status, payload, expected }) => {
    await mountGate();
    globalThis.fetch = vi.fn(async () => Response.json(payload, { status }));
    await fillNewPassword();
    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(expected);
    expect(container.querySelector("h2")?.textContent).toBe("Crea una contraseña nueva");
    expect(authenticated).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
    expectNoRecoveryPersistence();
  });

  it("informa de fallo de red sin afirmar cambio ni autenticar", async () => {
    await mountGate();
    globalThis.fetch = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    await fillNewPassword();
    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("no ha podido conectar");
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(authenticated).not.toHaveBeenCalled();
  });

  it("request conserva {email}, superficie Partner y confirmación neutral 202", async () => {
    await mountGate(false);
    await click("He olvidado mi contraseña");
    expect(field("Correo corporativo").type).toBe("email");
    const neutral = "Si el correo corresponde a una cuenta PIKI activa, recibirás un enlace para crear una contraseña nueva.";
    globalThis.fetch = vi.fn(async () => Response.json({ message: neutral }, { status: 202 }));
    await fill("Correo corporativo", "Fixture@Example.invalid");
    await click("Enviar enlace de recuperación");
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toMatch(/\/employee\/password-reset\/request$/);
    expect(init).toMatchObject({ method: "POST", headers: { "X-PIKI-Surface": "partner" } });
    expect(JSON.parse(String(init!.body))).toEqual({ email: "fixture@example.invalid" });
    expect(container.querySelector('[role="status"]')?.textContent).toBe(neutral);
    expect(authenticated).not.toHaveBeenCalled();
  });
});
