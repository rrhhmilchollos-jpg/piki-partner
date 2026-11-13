/// <reference types="node" />
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setImmediate } from "node:timers";
import App from "./App";
import MenuEditor from "./MenuEditor";
import EmployeeAuthGate from "./EmployeeAuthGate";
import PartnerAccountIdentity from "./PartnerAccountIdentity";

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
  vi.stubGlobal("window", { setTimeout: vi.fn(() => 1), clearTimeout: vi.fn(), setInterval: vi.fn(() => 1), clearInterval: vi.fn(), dispatchEvent: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("document", { visibilityState: "visible", addEventListener: vi.fn(), removeEventListener: vi.fn() });
  globalThis.fetch = vi.fn(async (url, init) => {
    if (String(url).endsWith("/employee/logout")) return new Response(null, { status: 204 });
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

describe("Explicit Partner logout revocation (offline)", () => {
  it("clears memory and both stores before POST, uses only the old Bearer and aborts at 10s without logging tokens", async () => {
    const tree = await login("A"); sessionStorage.setItem(tokenKey, "A");
    localStorage.setItem("unrelated", "keep");
    const logs = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")];
    let signal!: AbortSignal;
    globalThis.fetch = vi.fn((_url, init) => {
      expect(localStorage.getItem(tokenKey)).toBeNull(); expect(sessionStorage.getItem(tokenKey)).toBeNull();
      expect(identityNode(renderApp())).toBeUndefined();
      signal = init!.signal!;
      return new Promise<Response>((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("fixture timeout"))));
    });
    const pending = nodes(tree).find((node) => node.props["aria-label"] === "Cerrar sesión")!.props.onClick();
    expect(nodes(renderApp()).some((node) => node.type === EmployeeAuthGate)).toBe(true);
    expect(localStorage.getItem("unrelated")).toBe("keep");
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toMatch(/\/api\/v1\/auth\/employee\/logout$/);
    expect(init).toMatchObject({ method: "POST", cache: "no-store", headers: { Authorization: "Bearer A" } });
    expect(init!.body).toBeUndefined(); expect(signal.aborted).toBe(false);
    const timer = vi.mocked(window.setTimeout).mock.calls.find(([, delay]) => delay === 10_000)!;
    expect(timer).toBeDefined(); (timer[0] as () => void)(); await pending;
    expect(signal.aborted).toBe(true); expect(window.clearTimeout).toHaveBeenCalled();
    for (const log of logs) { expect(log).not.toHaveBeenCalled(); log.mockRestore(); }
  });

  it.each([204, 401, 428, "network"])("ignores late logout %s after fast login B, including stale explicit handler", async (outcome) => {
    const tree = await login("A");
    const oldLogout = nodes(tree).find((node) => node.props["aria-label"] === "Cerrar sesión")!.props.onClick;
    let resolve!: (response: Response) => void; let reject!: (error: Error) => void;
    const pending = new Promise<Response>((done, fail) => { resolve = done; reject = fail; });
    const employeeFetch = fetch;
    globalThis.fetch = vi.fn((url, init) => String(url).endsWith("/employee/logout") ? pending : employeeFetch(url, init));
    const logout = oldLogout();
    expect(localStorage.getItem(tokenKey)).toBeNull(); expect(identityNode(renderApp())).toBeUndefined();
    await login("B"); sessionStorage.setItem(tokenKey, "B");
    await oldLogout();
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith("/logout"))).toHaveLength(1);
    const json = vi.fn(() => { throw new Error("Logout must not parse/apply an ACK"); });
    if (outcome === "network") reject(new Error("fixture offline"));
    else resolve({ ok: outcome === 204, status: outcome, json } as unknown as Response);
    await logout;
    expect(json).not.toHaveBeenCalled();
    expect(localStorage.getItem(tokenKey)).toBe("B"); expect(sessionStorage.getItem(tokenKey)).toBe("B");
    expect(identityNode(renderApp())!.props.profile.fullName).toBe("B");
  });

  it("never revokes on token replacement, storage logout or operational unauthorized callbacks", async () => {
    let tree = await login("A");
    const storageChanged = vi.mocked(window.addEventListener).mock.calls.find(([event]) => event === "storage")![1] as unknown as (event: { key: string }) => void;
    localStorage.setItem(tokenKey, "B"); storageChanged({ key: tokenKey });
    renderApp(); flushParent(); await tick(); tree = renderApp();
    nodes(tree).find((node) => node.type === MenuEditor)!.props.onUnauthorized();
    await login("C"); localStorage.removeItem(tokenKey); storageChanged({ key: tokenKey });
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith("/logout"))).toBe(false);
  });

  it.each([401, 403, 428])("never revokes automatically on /me status %s", async (status) => {
    await login("A");
    globalThis.fetch = vi.fn(async () => Response.json({ error: "fixture" }, { status }));
    wakeSession(); await tick();
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith("/logout"))).toBe(false);
  });

  it.each(["MissingAssignment", "SessionRecovery"])("also revokes only when %s's explicit logout is pressed", async (screen) => {
    if (screen === "MissingAssignment") {
      globalThis.fetch = vi.fn(async () => Response.json({ employee: { id: "A", name: "A", role: "employee", restaurants: [] } }));
    }
    let tree = await login("A");
    if (screen === "SessionRecovery") {
      globalThis.fetch = vi.fn(async () => Response.json({ error: "fixture" }, { status: 403 }));
      wakeSession(); await tick(); tree = renderApp();
    }
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 204 }));
    await nodes(tree).find((node) => node.type?.name === screen)!.props.onLogout();
    expect(fetch).toHaveBeenCalledOnce(); expect(String(vi.mocked(fetch).mock.calls[0][0])).toMatch(/\/employee\/logout$/);
    expect(localStorage.getItem(tokenKey)).toBeNull(); expect(identityNode(renderApp())).toBeUndefined();
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

const identityNode = (tree: any) => nodes(tree).find((node) => node.type === PartnerAccountIdentity);
const wakeSession = () => {
  const callback = vi.mocked(document.addEventListener).mock.calls.find(([event]) => event === "visibilitychange")![1] as () => void;
  callback();
};

describe("Canonical identity in Partner App (offline)", () => {
  it("shows the complete employee identity in the header while keeping local role distinct and no extra /me", async () => {
    const fullName = "María del Carmen Fernández Rodríguez de los Santos y de la Vega";
    globalThis.fetch = vi.fn(async () => Response.json({ employee: { id: "employee-A", name: fullName, fullName, photoUrl: "data:image/jpeg;base64,AQID", jobRole: "Responsable de operaciones", role: "fleet_dispatch_v2", primaryRole: "admin", memberships: [{ restaurant: { id: "local", name: "Local real" }, roles: ["catalog"] }] } }));
    let tree = await login("A");
    const identity = identityNode(tree)!;
    expect(identity.props.profile).toMatchObject({ fullName, photoUrl: "data:image/jpeg;base64,AQID", role: "fleet_dispatch_v2", jobRole: "Responsable de operaciones" });
    expect(JSON.stringify(tree)).toContain("Asignación local:");
    expect(JSON.stringify(tree)).toContain("Catálogo");
    expect(nodes(tree).some((node) => node.type === MenuEditor)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    identity.props.onPhotoSaved(null);
    tree = renderApp(); flushParent(); await tick();
    expect(identityNode(tree)!.props.profile.photoUrl).toBeNull();
    expect(identityNode(tree)!.props.profile.role).toBe("fleet_dispatch_v2");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("shows real identity and own-photo action even without assigned restaurants", async () => {
    globalThis.fetch = vi.fn(async () => Response.json({ employee: { id: "unassigned", name: "Persona sin local asignado", jobRole: "Puesto real", role: "employee", photoUrl: null, restaurants: [] } }));
    const tree = await login("A");
    expect(identityNode(tree)!.props.profile.fullName).toBe("Persona sin local asignado");
    expect(identityNode(tree)!.props.profile.jobRole).toBe("Puesto real");
    expect(nodes(tree).some((node) => node.type?.name === "MissingAssignment")).toBe(true);
    expect(nodes(tree).some((node) => node.type === MenuEditor)).toBe(false);
  });
  it.each(["B", "A"])("removes identity on logout and ignores old own-photo callbacks after login %s", async (nextToken) => {
    const treeA = await login("A");
    const identityA = identityNode(treeA)!;
    nodes(treeA).find((node) => node.type === "button" && node.props["aria-label"] === "Cerrar sesión")!.props.onClick();
    expect(identityNode(renderApp())).toBeUndefined();
    const treeB = await login(nextToken);
    expect(identityNode(treeB)!.props.identityKey).not.toBe(identityA.props.identityKey);
    identityA.props.onPhotoSaved("data:image/jpeg;base64,AQID");
    expect(identityNode(renderApp())!.props.profile.photoUrl).toBeNull();
    expect(localStorage.getItem(tokenKey)).toBe(nextToken);
  });
  it("clears identity immediately on cross-tab token replacement and logout", async () => {
    const treeA = await login("A");
    const saveA = identityNode(treeA)!.props.onPhotoSaved;
    const storageChanged = vi.mocked(window.addEventListener).mock.calls.find(([event]) => event === "storage")![1] as unknown as (event: { key: string }) => void;
    localStorage.setItem(tokenKey, "B"); storageChanged({ key: tokenKey });
    expect(identityNode(renderApp())).toBeUndefined();
    saveA("data:image/jpeg;base64,AQID");
    renderApp(); flushParent(); await tick();
    expect(identityNode(renderApp())!.props.profile.fullName).toBe("B");
    expect(identityNode(renderApp())!.props.profile.photoUrl).toBeNull();
    localStorage.removeItem(tokenKey); storageChanged({ key: tokenKey });
    expect(identityNode(renderApp())).toBeUndefined();
    expect(nodes(renderApp()).some((node) => node.type === EmployeeAuthGate)).toBe(true);
  });
  it.each([401, 403, 428])("removes identity after /me auth error %s", async (status) => {
    await login("A");
    globalThis.fetch = vi.fn(async () => Response.json({ error: "fixture" }, { status }));
    wakeSession(); await tick();
    expect(identityNode(renderApp())).toBeUndefined();
    expect(status === 403 ? localStorage.getItem(tokenKey) === "A" : localStorage.getItem(tokenKey) === null).toBe(true);
  });
  it("ignores late /me JSON from A after logout and account B login", async () => {
    const treeA = await login("A");
    let release!: (payload: unknown) => void;
    const json = new Promise<unknown>((resolve) => { release = resolve; });
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: () => json }) as Response);
    wakeSession(); await tick();
    nodes(treeA).find((node) => node.type === "button" && node.props["aria-label"] === "Cerrar sesión")!.props.onClick();
    globalThis.fetch = vi.fn(async () => Response.json({ employee: { id: "B", name: "Persona B", role: "catalog", restaurants: [{ id: "local", name: "Local B" }] } }));
    await login("B");
    release({ employee: { id: "A", name: "Persona A tardía", photoUrl: "data:image/jpeg;base64,AQID", role: "owner", restaurants: [{ id: "local", name: "Local A" }] } }); await tick();
    expect(identityNode(renderApp())!.props.profile).toMatchObject({ id: "B", fullName: "Persona B", photoUrl: null, role: "catalog" });
  });
  it("shares in-flight /me validation across repeated visibility wakes", async () => {
    await login("A");
    let release!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => { release = resolve; });
    globalThis.fetch = vi.fn(() => response);
    wakeSession(); wakeSession(); wakeSession();
    expect(fetch).toHaveBeenCalledTimes(1);
    release(Response.json({ employee: { name: "Persona A", role: "catalog", restaurants: [{ id: "local", name: "Local A" }] } })); await tick();
    expect(identityNode(renderApp())!.props.profile.fullName).toBe("Persona A");
  });
  it("ignores old photo ACK when /me changes account with the same token", async () => {
    const treeA = await login("A");
    const saveA = identityNode(treeA)!.props.onPhotoSaved;
    globalThis.fetch = vi.fn(async () => Response.json({ employee: { id: "other-account", name: "Persona cambiada", email: "other@example.invalid", role: "catalog", restaurants: [{ id: "local", name: "Local" }] } }));
    wakeSession(); await tick();
    expect(identityNode(treeA)!.props.isCurrentSession()).toBe(false);
    saveA("data:image/jpeg;base64,AQID");
    const changed = identityNode(renderApp())!;
    expect(changed.props.profile.fullName).toBe("Persona cambiada");
    expect(changed.props.identityKey).not.toBe(identityNode(treeA)!.props.identityKey);
    expect(identityNode(renderApp())!.props.profile.photoUrl).toBeNull();
  });
  it("does not let an older /me snapshot overwrite an acknowledged own photo", async () => {
    const tree = await login("A");
    let release!: (payload: unknown) => void;
    const json = new Promise<unknown>((resolve) => { release = resolve; });
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: () => json }) as Response);
    wakeSession(); await tick();
    identityNode(tree)!.props.onPhotoSaved("data:image/jpeg;base64,AQID");
    release({ employee: { name: "A", email: "A@fixture.invalid", role: "catalog", photoUrl: null, restaurants: [{ id: "local", name: "Fixture local" }] } }); await tick();
    expect(identityNode(renderApp())!.props.profile.photoUrl).toBe("data:image/jpeg;base64,AQID");
  });
});
