/// <reference types="node" />
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setImmediate } from "node:timers";
import App from "./App";
import MenuEditor from "./MenuEditor";
import EmployeeAuthGate from "./EmployeeAuthGate";

// Separate deterministic hook lifetimes for the real App and real MenuEditor callbacks.
const runtime = vi.hoisted(() => {
  Object.defineProperty(globalThis, "location", { configurable: true, value: { hostname: "fixture.partner.invalid", hash: "" } });
  const create = () => ({ slots: [] as any[], cursor: 0, effects: [] as (() => unknown)[], layouts: [] as (() => unknown)[] });
  const parent = create(); const editor = create();
  return { parent, editor, current: parent };
});
vi.mock("react", async () => {
  const original = await vi.importActual<typeof import("react")>("react");
  const memo = (factory: () => any, deps?: any[]) => {
    const host = runtime.current; const index = host.cursor++; const old = host.slots[index];
    if (!old || !deps || deps.some((dep, i) => !Object.is(dep, old.deps?.[i]))) host.slots[index] = { value: factory(), deps };
    return host.slots[index].value;
  };
  const effect = (callback: () => unknown, deps: any[] | undefined, layout = false) => {
    const host = runtime.current; const index = host.cursor++; const old = host.slots[index];
    if (!old || !deps || deps.some((dep, i) => !Object.is(dep, old.deps?.[i]))) {
      const next = { deps, cleanup: undefined as unknown }; host.slots[index] = next;
      (layout ? host.layouts : host.effects).push(() => { if (typeof old?.cleanup === "function") old.cleanup(); next.cleanup = callback(); });
    }
  };
  return { ...original,
    useState: (initial: any) => {
      const host = runtime.current; const index = host.cursor++;
      if (!(index in host.slots)) host.slots[index] = typeof initial === "function" ? initial() : initial;
      return [host.slots[index], (next: any) => { host.slots[index] = typeof next === "function" ? next(host.slots[index]) : next; }];
    },
    useRef: (initial: any) => {
      const host = runtime.current; const index = host.cursor++;
      if (!(index in host.slots)) host.slots[index] = { current: initial };
      return host.slots[index];
    },
    useMemo: memo,
    useCallback: (callback: any, deps: any[]) => memo(() => callback, deps),
    useEffect: (callback: () => unknown, deps?: any[]) => effect(callback, deps),
    useLayoutEffect: (callback: () => unknown, deps?: any[]) => effect(callback, deps, true),
  };
});
vi.mock("./components/CookieConsent", () => ({ default: () => null }));
vi.mock("./EmployeeAuthGate", () => ({ default: () => null }));
vi.mock("./MenuAvailability", () => ({ default: () => null }));
vi.mock("./OrdersBoard", () => ({ default: () => null }));
vi.mock("./ArchivedOrdersBoard", () => ({ default: () => null }));
vi.mock("./PerformanceView", () => ({ default: () => null }));
vi.mock("./PartnerOnboarding", () => ({ default: () => null }));
vi.mock("./GoogleBusinessSettings", () => ({ default: () => null }));
vi.mock("./PartnerAccountSummary", () => ({ default: () => null }));
vi.mock("./PartnerNativeNotificationControl", () => ({ default: () => null }));
vi.mock("./PartnerKitchenReception", () => ({ PartnerKitchenReceptionProvider: () => null }));
vi.mock("./partnerNativeNotifications", () => ({ isPartnerNativeAndroid: () => false, partnerNativeNotifications: { clearAllOrders: vi.fn() } }));
vi.mock("./pwaUpdateRuntime", () => ({ usePwaUpdateBlocker: () => undefined }));
vi.mock("./catalogRealtime", () => ({ connectCatalogRealtime: () => () => undefined }));

function nodes(tree: any): any[] {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
const tick = async () => { for (let i = 0; i < 4; i += 1) await new Promise<void>((resolve) => setImmediate(resolve)); };
function renderApp() {
  runtime.current = runtime.parent; runtime.parent.cursor = 0;
  const operations = nodes(App()).find((node) => node.type?.name === "PartnerOperationsApp")!.type;
  return operations();
}
function flushParent() { runtime.parent.effects.splice(0).forEach((effect) => effect()); }
function renderEditor(props: any) {
  runtime.current = runtime.editor; runtime.editor.cursor = 0;
  const tree = MenuEditor(props);
  runtime.editor.layouts.splice(0).forEach((effect) => effect());
  runtime.editor.effects.splice(0).forEach((effect) => effect());
  return tree;
}
const tokenKey = "piki-fixture.partner.invalid-api-token";
const storage = () => {
  const entries = new Map<string, string>();
  return { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => entries.set(key, value), removeItem: (key: string) => entries.delete(key) };
};
beforeEach(() => {
  for (const host of [runtime.parent, runtime.editor]) { host.slots = []; host.cursor = 0; host.effects = []; host.layouts = []; }
  vi.stubGlobal("localStorage", storage()); vi.stubGlobal("sessionStorage", storage());
  vi.stubGlobal("window", { setTimeout: vi.fn(() => 1), clearTimeout: vi.fn(), setInterval: vi.fn(() => 1), clearInterval: vi.fn(), dispatchEvent: vi.fn() });
  vi.stubGlobal("document", { visibilityState: "visible", addEventListener: vi.fn(), removeEventListener: vi.fn() });
  globalThis.fetch = vi.fn(async (url, init) => {
    if (!String(url).endsWith("/employee/me")) throw new Error("Fixture only allows mocked employee/me");
    const token = String((init!.headers as Record<string, string>).Authorization).replace("Bearer ", "");
    return Response.json({ employee: { name: token, email: `${token}@fixture.invalid`, role: "catalog", restaurants: [{ id: "local", name: "Fixture local" }] } });
  });
});
async function login(token: string) {
  const gate = nodes(renderApp()).find((node) => node.type === EmployeeAuthGate)!;
  gate.props.onAuthenticated(token);
  renderApp(); flushParent(); await tick();
  return renderApp();
}

describe("App session-scoped unauthorized handler (offline)", () => {
  it.each(["B", "A"])("A → logout → login %s → real late GET 401 A cannot clear the new session", async (nextToken) => {
    let tree = await login("A");
    const editor = nodes(tree).find((node) => node.type === MenuEditor)!;
    const unauthorizedA = vi.fn(editor.props.onUnauthorized);
    let release!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { release = resolve; });
    const employeeFetch = fetch;
    globalThis.fetch = vi.fn(async (url, init) => String(url).endsWith("/menu") ? pending : employeeFetch(url, init));
    renderEditor({ ...editor.props, onUnauthorized: unauthorizedA }); await tick();
    nodes(tree).find((node) => node.type === "button" && node.props["aria-label"] === "Cerrar sesión")!.props.onClick();
    expect(localStorage.getItem(tokenKey)).toBeNull();
    tree = await login(nextToken);
    expect(localStorage.getItem(tokenKey)).toBe(nextToken);
    // Deliberately keep A's hook host alive: this exercises App's independent guard, not just child cleanup.
    release(Response.json({ error: "expired A" }, { status: 401 })); await tick();
    expect(unauthorizedA).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(tokenKey)).toBe(nextToken);
    expect(nodes(renderApp()).find((node) => node.type === MenuEditor)?.props.token).toBe(nextToken);
    // The same handler from the genuinely current session must still perform logout.
    nodes(tree).find((node) => node.type === MenuEditor)!.props.onUnauthorized();
    expect(localStorage.getItem(tokenKey)).toBeNull();
    expect(nodes(renderApp()).some((node) => node.type === EmployeeAuthGate)).toBe(true);
  });

  it("invalidates synchronously before the first render after login B", async () => {
    const tree = await login("A");
    const staleCallback = nodes(tree).find((node) => node.type === MenuEditor)!.props.onUnauthorized;
    nodes(tree).find((node) => node.type === "button" && node.props["aria-label"] === "Cerrar sesión")!.props.onClick();
    const gate = nodes(renderApp()).find((node) => node.type === EmployeeAuthGate)!;
    gate.props.onAuthenticated("B");
    staleCallback();
    expect(localStorage.getItem(tokenKey)).toBe("B");
  });
});

describe("Owner portfolio App selector and consultative pending status (offline)", () => {
  it("selects all seven backend locals, disables pending reception/edits and never labels pending as accepting", async () => {
    const locations = Array.from({ length: 7 }, (_, index) => ({ id: `fixture-local-${index}`, tenantId: "fixture-tenant", name: `Offline local ${index}`, roles: ["owner"], permissions: index < 5 ? ["*"] : ["menu:read"], isOpen: index < 5, ordersEnabled: index < 5, readOnly: index >= 5, reason: index < 5 ? "open" : "not_approved" }));
    globalThis.fetch = vi.fn(async () => Response.json({ employee: { name: "Offline owner", tenantId: "fixture-tenant", roles: ["owner"], permissions: ["*"], locations } }));
    let tree = await login("OFFLINE_OWNER");
    const selector = nodes(tree).find((node) => node.type === "select" && node.props["aria-label"] === "Seleccionar local")!;
    expect(nodes(selector).filter((node) => node.type === "option")).toHaveLength(7);
    selector.props.onChange({ target: { value: locations[5].id } });
    tree = renderApp();
    const reception = nodes(tree).find((node) => node.type?.name === "PartnerKitchenReceptionProvider")!;
    expect(reception.props.locationId).toBe(locations[5].id);
    expect(reception.props.canRead).toBe(false);
    expect(nodes(tree).some((node) => node.type === MenuEditor)).toBe(false);
    const control = nodes(tree).find((node) => node.type?.name === "StoreStatusControl")!;
    expect(control.props.enabled).toBe(false);
    const savedRuntime = runtime.current;
    runtime.current = runtime.editor; runtime.editor.cursor = 0;
    const status = control.type(control.props);
    runtime.current = savedRuntime;
    const flattened = JSON.stringify(status);
    expect(flattened).toContain("SOLO CONSULTA");
    expect(flattened).toContain("No operativo · sin pedidos");
    expect(flattened).not.toContain("Aceptando pedidos");
    expect(nodes(status).find((node) => node.props?.role === "switch")?.props.disabled).toBe(true);
    expect(nodes(tree).some((node) => node.props?.role === "status")).toBe(true);
  });
});
