/// <reference types="node" />
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setImmediate } from "node:timers";
import MenuEditor from "./MenuEditor";
import MenuAvailability from "./MenuAvailability";
import OrdersBoard from "./OrdersBoard";
import PrintablePartnerTicket from "./PrintablePartnerTicket";

// Small deterministic hook host: real component callbacks, no DOM, services, or React runtime mounts.
const host = vi.hoisted(() => ({ slots: [] as any[], cursor: 0, effects: [] as (() => unknown)[], layouts: [] as (() => unknown)[], updates: 0 }));
const reception = vi.hoisted(() => ({ orders: [] as any[], loading: false, receptionMessage: "", now: Date.parse("2026-11-11T12:20:00Z"), realtimeState: { status: "connected", attempt: 0 }, activeCount: 0, audioReady: false, load: vi.fn(), applyConfirmedOrder: vi.fn(), resolveOrder: vi.fn(), notifyCancelledOrder: vi.fn() }));
const nativePrint = vi.hoisted(() => vi.fn());
vi.mock("react", async () => {
  const original = await vi.importActual<typeof import("react")>("react");
  const memo = (factory: () => any, deps?: any[]) => {
    const index = host.cursor++;
    const old = host.slots[index];
    if (!old || !deps || deps.some((dep, i) => !Object.is(dep, old.deps?.[i]))) host.slots[index] = { value: factory(), deps };
    return host.slots[index].value;
  };
  const effect = (callback: () => unknown, deps: any[] | undefined, queue: (() => unknown)[]) => {
    const index = host.cursor++;
    const old = host.slots[index];
    if (!old || !deps || deps.some((dep, i) => !Object.is(dep, old.deps?.[i]))) {
      const next = { deps, cleanup: undefined as unknown };
      host.slots[index] = next;
      queue.push(() => { if (typeof old?.cleanup === "function") old.cleanup(); next.cleanup = callback(); });
    }
  };
  return { ...original,
    useState: (initial: any) => {
      const index = host.cursor++;
      if (!(index in host.slots)) host.slots[index] = typeof initial === "function" ? initial() : initial;
      return [host.slots[index], (next: any) => { host.updates += 1; host.slots[index] = typeof next === "function" ? next(host.slots[index]) : next; }];
    },
    useRef: (initial: any) => {
      const index = host.cursor++;
      if (!(index in host.slots)) host.slots[index] = { current: initial };
      return host.slots[index];
    },
    useMemo: memo,
    useCallback: (callback: any, deps: any[]) => memo(() => callback, deps),
    useEffect: (callback: () => unknown, deps?: any[]) => effect(callback, deps, host.effects),
    useLayoutEffect: (callback: () => unknown, deps?: any[]) => effect(callback, deps, host.layouts),
  };
});
vi.mock("./pwaUpdateRuntime", () => ({ usePwaUpdateBlocker: () => undefined }));
vi.mock("./catalogRealtime", () => ({ connectCatalogRealtime: () => () => undefined }));
vi.mock("./PartnerKitchenReception", () => ({ usePartnerKitchenReception: () => reception }));
vi.mock("./PartnerOrderAlarm", () => ({ PartnerOrderAlarmBanner: () => null }));
vi.mock("./sunmiPrinter", () => ({ printOrderToSunmi: nativePrint }));

type Node = { type: any; props: any };
function nodes(tree: any): Node[] {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function text(tree: any): string {
  if (tree == null || typeof tree === "boolean") return "";
  if (typeof tree !== "object") return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join("");
  return text(tree.props?.children);
}
let stored: any[];
let revision: number;
let requests: { url: string; init?: RequestInit; body: any }[];
const props = { apiOrigin: "https://fixture.invalid", token: "fixture-token", locationId: "fixture-local", identityKey: "fixture-identity", onUnauthorized: vi.fn() };
function commit(tree: any) { host.layouts.splice(0).forEach((effect) => effect()); return tree; }
const renderEditor = () => { host.cursor = 0; return commit(MenuEditor(props)); };
const renderAvailability = () => { host.cursor = 0; return commit(MenuAvailability({ ...props, canRead: true, canEdit: true })); };
function unmount() { host.slots.forEach((slot) => { if (typeof slot?.cleanup === "function") slot.cleanup(); }); }
const button = (tree: any, label: string) => nodes(tree).find((node) => node.type === "button" && text(node).includes(label))!;
const field = (tree: any) => nodes(tree).find((node) => node.type === "input" && node.props.placeholder === "Ej. Bowl de temporada")!;
const tick = async () => { for (let i = 0; i < 4; i += 1) await new Promise<void>((resolve) => setImmediate(resolve)); };
async function mount(render = renderEditor) {
  render();
  host.effects.splice(0).forEach((effect) => effect());
  await tick();
  return render();
}
beforeEach(() => {
  host.slots = []; host.cursor = 0; host.effects = []; host.layouts = []; host.updates = 0;
  props.token = "fixture-token"; props.locationId = "fixture-local"; props.identityKey = "fixture-identity";
  reception.load.mockReset(); reception.applyConfirmedOrder.mockReset(); reception.resolveOrder.mockReset(); reception.notifyCancelledOrder.mockReset();
  nativePrint.mockReset(); nativePrint.mockResolvedValue(false);
  stored = [{ id: "a", name: "A", description: "", category: "General", price: 10, available: true, image: "", modifiers: [], allergens: null }, { id: "b", name: "B", category: "General", price: 12, available: true, modifiers: [], allergens: ["leche"] }];
  revision = 5; requests = []; props.onUnauthorized.mockReset();
  vi.stubGlobal("window", { confirm: vi.fn(() => true), setInterval: vi.fn(() => 1), clearInterval: vi.fn() });
  globalThis.fetch = vi.fn(async (url, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ url: String(url), init, body });
    if (String(url).endsWith("/assets")) return Response.json({ assets: [] });
    if (init?.method === "PATCH") {
      const itemId = decodeURIComponent(String(url).split("/").at(-2)!);
      const item = stored.find((item) => item.id === itemId)!;
      const changed = item.available !== body.available;
      if (changed) { item.available = body.available; revision += 1; }
      return Response.json({ updated: true, changed, restaurantId: props.locationId, itemId, available: item.available, menuRevision: revision });
    }
    if (init?.method === "PUT") {
      if (body.expectedMenuRevision !== revision) return Response.json({ error: "MENU_REVISION_CONFLICT", menuRevision: revision }, { status: 409 });
      stored = structuredClone(body.items); revision += 1;
    }
    return Response.json({ menu: stored, menuRevision: revision, restaurant: { menuRevision: revision } });
  });
});
describe("Menu safety interaction regressions (offline)", () => {
  it("fullsave sends revision and consumes the next complete snapshot", async () => {
    let tree = await mount(); button(tree, "Editar").props.onClick();
    tree = renderEditor(); field(tree).props.onChange({ target: { value: "Mi edición" } });
    tree = renderEditor(); button(tree, "Guardar producto").props.onClick(); await tick();
    tree = renderEditor();
    const put = requests.find((request) => request.init?.method === "PUT")!;
    expect(put.body.expectedMenuRevision).toBe(5);
    expect(stored[0].name).toBe("Mi edición");
    expect(revision).toBe(6);
    expect(field(tree)).toBeUndefined();
    button(tree, "Editar").props.onClick(); tree = renderEditor();
    field(tree).props.onChange({ target: { value: "Segunda edición" } });
    tree = renderEditor(); button(tree, "Guardar producto").props.onClick(); await tick();
    expect(requests.filter((request) => request.init?.method === "PUT").at(-1)!.body.expectedMenuRevision).toBe(6);
  });
  it("409 reloads without retry, keeps the local draft and blocks blind resave", async () => {
    let tree = await mount(); button(tree, "Editar").props.onClick(); tree = renderEditor();
    field(tree).props.onChange({ target: { value: "Borrador sin perder" } }); tree = renderEditor();
    stored[0].available = false; revision = 6;
    button(tree, "Guardar producto").props.onClick(); await tick(); tree = renderEditor();
    expect(requests.filter((request) => request.init?.method === "PUT")).toHaveLength(1);
    expect(field(tree).props.value).toBe("Borrador sin perder");
    expect(button(tree, "Guardar producto").props.disabled).toBe(true);
    expect(stored[0].name).toBe("A"); expect(stored[0].available).toBe(false);
    // Even invoking the disabled callback directly cannot bypass the stale-draft guard.
    button(tree, "Guardar producto").props.onClick(); await tick();
    expect(requests.filter((request) => request.init?.method === "PUT")).toHaveLength(1);
    tree = renderEditor(); button(tree, "Descartar borrador y cargar producto actual").props.onClick(); tree = renderEditor();
    expect(field(tree).props.value).toBe("A");
    expect(nodes(tree).find((node) => node.type === "input" && node.props.type === "checkbox")!.props.checked).toBe(false);
    expect(button(tree, "Guardar producto").props.disabled).toBe(false);
  });
  it("editor PATCH reloads items+revision together and never stamps an old snapshot with a new version", async () => {
    let tree = await mount();
    // Another device pauses B after the local GET; our PATCH pauses A only.
    stored[1].available = false; revision = 6;
    nodes(tree).find((node) => node.props?.role === "switch")!.props.onClick(); await tick(); tree = renderEditor();
    expect(requests.filter((request) => request.init?.method === "PUT")).toHaveLength(0);
    const patch = requests.find((request) => request.init?.method === "PATCH")!;
    expect(patch.body).toEqual({ available: false });
    expect(patch.url).toContain("/restaurants/fixture-local/menu/items/a/availability");
    expect(stored.map((item) => item.available)).toEqual([false, false]);
    button(tree, "Editar").props.onClick(); tree = renderEditor();
    field(tree).props.onChange({ target: { value: "Edición posterior" } }); tree = renderEditor();
    button(tree, "Guardar producto").props.onClick(); await tick();
    const put = requests.find((request) => request.init?.method === "PUT")!;
    expect(put.body.expectedMenuRevision).toBe(7);
    expect(put.body.items.map((item: any) => item.available)).toEqual([false, false]);
    expect(put.body.items[1].allergens).toEqual(["leche"]);
  });
  it("PATCH while a draft is open keeps it but requires explicit reconciliation", async () => {
    let tree = await mount(); button(tree, "Editar").props.onClick(); tree = renderEditor();
    field(tree).props.onChange({ target: { value: "Local draft" } }); tree = renderEditor();
    nodes(tree).find((node) => node.props?.role === "switch")!.props.onClick(); await tick(); tree = renderEditor();
    expect(field(tree).props.value).toBe("Local draft");
    expect(button(tree, "Guardar producto").props.disabled).toBe(true);
    expect(stored[0].available).toBe(false);
  });
  it("does not enable fullsave with a PATCH revision when the follow-up GET fails", async () => {
    let tree = await mount();
    const normal = fetch;
    globalThis.fetch = vi.fn(async (url, init) => init?.method === "PATCH" ? normal(url, init) : Response.json({ error: "fixture-network-failure" }, { status: 503 }));
    nodes(tree).find((node) => node.props?.role === "switch")!.props.onClick(); await tick(); tree = renderEditor();
    expect(stored[0].available).toBe(false);
    expect(revision).toBe(6);
    expect(button(tree, "Nuevo producto").props.disabled).toBe(true);
    button(tree, "Editar").props.onClick();
    expect(field(renderEditor())).toBeUndefined();
    expect(requests.filter((request) => request.init?.method === "PUT")).toHaveLength(0);
  });
  it("ignores an earlier GET arriving after a newer snapshot", async () => {
    let releaseOld: (response: Response) => void = () => undefined;
    const old = new Promise<Response>((resolve) => { releaseOld = resolve; });
    let reads = 0;
    const normal = fetch;
    globalThis.fetch = vi.fn(async (url, init) => {
      if (String(url).endsWith("/assets")) return normal(url, init);
      reads += 1;
      if (reads === 1) return old;
      return Response.json({ menu: [{ ...stored[0], name: "Nueva carta", available: false }], menuRevision: 6 });
    });
    let tree = renderEditor(); host.effects.splice(0).forEach((effect) => effect());
    tree = renderEditor(); button(tree, "Actualizar").props.onClick(); await tick();
    releaseOld(Response.json({ menu: [{ ...stored[0], name: "Snapshot antiguo" }], menuRevision: 5 })); await tick();
    tree = renderEditor();
    expect(text(tree)).toContain("Nueva carta");
    expect(text(tree)).not.toContain("Snapshot antiguo");
  });
  it("availability view also uses targeted PATCH and keeps both external pauses", async () => {
    let tree = await mount(renderAvailability);
    stored[1].available = false; revision = 6;
    nodes(tree).find((node) => node.props?.role === "switch")!.props.onClick(); await tick(); tree = renderAvailability();
    expect(requests.filter((request) => request.init?.method === "PUT")).toHaveLength(0);
    expect(requests.find((request) => request.init?.method === "PATCH")!.body).toEqual({ available: false });
    expect(nodes(tree).filter((node) => node.props?.role === "switch").map((node) => node.props["aria-checked"])).toEqual([false, false]);
  });
  it("double tap cannot send concurrent menu writes", async () => {
    let tree = await mount(); button(tree, "Editar").props.onClick(); tree = renderEditor();
    const save = button(tree, "Guardar producto").props.onClick;
    save(); save(); await tick();
    expect(requests.filter((request) => request.init?.method === "PUT")).toHaveLength(1);
  });
  it("missing revision fails closed without enabling a fullsave", async () => {
    globalThis.fetch = vi.fn(async () => Response.json({ menu: stored }));
    const tree = await mount();
    expect(button(tree, "Nuevo producto").props.disabled).toBe(true);
    expect(text(tree)).toContain("revisión coherente");
    button(tree, "Nuevo producto").props.onClick();
    expect(field(renderEditor())).toBeUndefined();
  });
});

describe("Kitchen operation callbacks (offline)", () => {
  const fixture = { _id: "fixture-order", publicCode: "FIX-001", createdAt: "2026-11-11T12:00:00Z", status: "pending", paymentMethod: "stripe", paymentState: "authorized", deliveryNote: "Sin sal y sin cebolla", items: [{ name: "Plato", quantity: 1 }] };
  const renderBoard = (permissions = { canAccept: false, canPrepare: false, canCancel: false }) => {
    host.cursor = 0;
    return OrdersBoard({ ...props, canRead: true, ...permissions });
  };
  it.each([
    ["pending", "Aceptar pedido", { canAccept: false, canPrepare: true, canCancel: false }],
    ["accepted", "Iniciar preparación", { canAccept: true, canPrepare: false, canCancel: false }],
    ["preparing", "Marcar como listo", { canAccept: true, canPrepare: false, canCancel: false }],
  ])("cannot invoke a forbidden transition from %s even through its callback", async (status, label, permissions) => {
    reception.orders = [{ ...fixture, status }];
    globalThis.fetch = vi.fn(() => { throw new Error("No request expected"); });
    const action = button(renderBoard(permissions), label);
    expect(action.props.disabled).toBe(true);
    action.props.onClick(); await tick();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("allows orders:cancel without unrelated accept/prepare permission", async () => {
    reception.orders = [fixture];
    globalThis.fetch = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body).toEqual({ status: "cancelled" });
      return Response.json({ order: { ...fixture, status: "cancelled", partnerPrepDeadlineAt: null } });
    });
    button(renderBoard({ canAccept: false, canPrepare: false, canCancel: true }), "Cancelar pedido").props.onClick(); await tick();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(reception.notifyCancelledOrder).toHaveBeenCalledWith(fixture._id, fixture.publicCode);
    expect(reception.load).toHaveBeenCalledTimes(1);
  });
  it("retains preparationMinutes confirmed in REST rather than resetting to 20", async () => {
    reception.orders = [{ ...fixture, status: "accepted", preparationMinutes: 45 }];
    globalThis.fetch = vi.fn(async (_url, init) => {
      expect(JSON.parse(String(init?.body))).toEqual({ status: "preparing", preparationMinutes: 45 });
      return Response.json({ order: { ...fixture, status: "preparing", preparationMinutes: 45, partnerPrepDeadlineAt: "2026-11-11T13:05:00Z" } });
    });
    const tree = renderBoard({ canAccept: false, canPrepare: true, canCancel: false });
    expect(nodes(tree).find((node) => node.type === "select")!.props.value).toBe(45);
    button(tree, "Iniciar preparación").props.onClick(); await tick();
    expect(reception.applyConfirmedOrder).toHaveBeenCalledWith(expect.objectContaining({ preparationMinutes: 45 }));
  });
  it.each([false, true])("keeps the note in fallback after accept (native failure=%s) and applies the confirmed deadline", async (failNative) => {
    reception.orders = [fixture];
    if (failNative) nativePrint.mockRejectedValue(new Error("fixture native printer unavailable"));
    globalThis.fetch = vi.fn(async (_url, init) => {
      expect(JSON.parse(String(init?.body))).toEqual({ status: "accepted", preparationMinutes: 20 });
      return Response.json({ order: { ...fixture, status: "accepted", partnerPrepDeadlineAt: "2026-11-11T12:40:00Z", preparationMinutes: 20 } });
    });
    button(renderBoard({ canAccept: true, canPrepare: false, canCancel: false }), "Aceptar pedido").props.onClick(); await tick();
    expect(reception.applyConfirmedOrder).toHaveBeenCalledWith(expect.objectContaining({ partnerPrepDeadlineAt: "2026-11-11T12:40:00Z", preparationMinutes: 20, paymentState: "authorized" }));
    expect(nativePrint).toHaveBeenCalledWith(expect.objectContaining({ deliveryNote: fixture.deliveryNote, status: "accepted" }));
    const ticket = nodes(renderBoard()).find((node) => node.type === PrintablePartnerTicket)!;
    expect(ticket.props.order.deliveryNote).toBe(fixture.deliveryNote);
    expect(ticket.props.order.paymentState).toBe("authorized");
    expect(reception.load).toHaveBeenCalledTimes(1);
  });
  it.each([{}, { order: { _id: "wrong-order", status: "accepted" } }, { order: { _id: "correct-order", status: "pending" } }])("does not print, resolve or announce success for an unconfirmed HTTP 200 ack: %j", async (payload) => {
    reception.orders = [fixture];
    const body = structuredClone(payload);
    if (body.order?._id === "correct-order") body.order._id = fixture._id;
    globalThis.fetch = vi.fn(async () => Response.json(body));
    button(renderBoard({ canAccept: true, canPrepare: false, canCancel: false }), "Aceptar pedido").props.onClick(); await tick();
    expect(reception.applyConfirmedOrder).not.toHaveBeenCalled();
    expect(reception.resolveOrder).not.toHaveBeenCalled();
    expect(nativePrint).not.toHaveBeenCalled();
    expect(reception.load).toHaveBeenCalledTimes(1);
    const result = renderBoard();
    expect(nodes(result).some((node) => node.type === PrintablePartnerTicket)).toBe(false);
    expect(JSON.stringify(result)).toContain("El servidor no ha confirmado este cambio");
    expect(JSON.stringify(result)).not.toContain("Pedido aceptado. Empieza la preparación");
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const menuViews = [["editor", renderEditor], ["availability", renderAvailability]] as const;
describe("Menu session lifetime continuations (offline)", () => {
  it.each(menuViews.flatMap(([name, render]) => [401, 200].map((status) => [name, render, status] as const)))("%s aborts unmounted GET and ignores late HTTP %s even when fetch ignores abort", async (_name, render, status) => {
    const pending = deferred<Response>();
    globalThis.fetch = vi.fn(() => pending.promise);
    const tree = render(); host.effects.splice(0).forEach((effect) => effect());
    const signal = (fetch as any).mock.calls[0][1].signal as AbortSignal;
    unmount(); const updates = host.updates;
    expect(signal.aborted).toBe(true);
    pending.resolve(Response.json({ menu: [{ ...stored[0], name: "Stale A" }], menuRevision: 5 }, { status }));
    await tick();
    expect(props.onUnauthorized).not.toHaveBeenCalled();
    expect(host.updates).toBe(updates);
    // A retained callback from the old view cannot start another request either.
    button(tree, "Actualizar").props.onClick(); await tick();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(menuViews.flatMap(([name, render]) => (["token", "locationId", "identityKey"] as const).map((key) => [name, render, key] as const)))("%s discards GET JSON after changing %s in the same instance", async (_name, render, key) => {
    const pending = deferred<any>();
    const normal = fetch;
    let first = true;
    let signal!: AbortSignal;
    globalThis.fetch = vi.fn(async (url, init) => {
      if (first && String(url).endsWith("/menu")) {
        first = false; signal = init!.signal!;
        const response = Response.json({});
        response.json = vi.fn(() => pending.promise);
        return response;
      }
      return normal(url, init);
    });
    render(); host.effects.splice(0).forEach((effect) => effect()); await tick();
    props[key] = "context-B"; stored[0].name = "Current B";
    render(); host.effects.splice(0).forEach((effect) => effect()); await tick();
    const before = render(); const updates = host.updates;
    expect(signal.aborted).toBe(true);
    pending.resolve({ menu: [{ ...stored[0], name: "Stale A" }], menuRevision: 4 }); await tick();
    expect(host.updates).toBe(updates);
    expect(text(render())).toBe(text(before));
    expect(text(render())).toContain("Current B");
    expect(props.onUnauthorized).not.toHaveBeenCalled();
  });

  it.each([
    ["editor stock", renderEditor, "PATCH", "fetch", 401],
    ["editor stock", renderEditor, "PATCH", "json", 200],
    ["availability stock", renderAvailability, "PATCH", "fetch", 401],
    ["availability stock", renderAvailability, "PATCH", "json", 200],
    ["editor save", renderEditor, "PUT", "fetch", 401],
    ["editor save", renderEditor, "PUT", "json", 200],
  ] as const)("%s ignores stale %s %s (HTTP %s) without state, unauthorized or recovery GET", async (_name, render, method, stage, status) => {
    let tree = await mount(render);
    if (method === "PUT") {
      button(tree, "Editar").props.onClick(); tree = render();
      field(tree).props.onChange({ target: { value: "Draft A" } }); tree = render();
    }
    const pendingResponse = deferred<Response>(); const pendingBody = deferred<any>();
    let signal!: AbortSignal;
    globalThis.fetch = vi.fn(async (_url, init) => {
      expect(init?.method).toBe(method); signal = init!.signal!;
      if (stage === "fetch") return pendingResponse.promise;
      const response = Response.json({}); response.json = vi.fn(() => pendingBody.promise); return response;
    });
    if (method === "PUT") button(tree, "Guardar producto").props.onClick();
    else nodes(tree).find((node) => node.props?.role === "switch")!.props.onClick();
    await tick(); unmount(); const updates = host.updates;
    expect(signal.aborted).toBe(true);
    if (stage === "fetch") pendingResponse.resolve(Response.json({ error: "expired A" }, { status }));
    else pendingBody.resolve(method === "PUT" ? { menu: stored, menuRevision: 6 } : { updated: true, restaurantId: props.locationId, itemId: "a", available: false, menuRevision: 6 });
    await tick();
    expect(host.updates).toBe(updates);
    expect(props.onUnauthorized).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(menuViews)("%s preserves valid current-session HTTP 401 logout", async (_name, render) => {
    globalThis.fetch = vi.fn(async () => Response.json({ error: "expired current" }, { status: 401 }));
    await mount(render);
    expect(props.onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it.each(menuViews)("%s preserves valid current stock HTTP 401 logout without recovery GET", async (_name, render) => {
    const tree = await mount(render);
    globalThis.fetch = vi.fn(async () => Response.json({ error: "expired current" }, { status: 401 }));
    nodes(tree).find((node) => node.props?.role === "switch")!.props.onClick(); await tick();
    expect(props.onUnauthorized).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("editor aborts asset reads and rejects their late unauthorized callback", async () => {
    const pending = deferred<Response>(); const normal = fetch;
    let signal!: AbortSignal;
    globalThis.fetch = vi.fn(async (url, init) => {
      if (String(url).endsWith("/assets")) { signal = init!.signal!; return pending.promise; }
      return normal(url, init);
    });
    renderEditor(); host.effects.splice(0).forEach((effect) => effect()); await tick();
    unmount(); const updates = host.updates;
    expect(signal.aborted).toBe(true);
    pending.resolve(Response.json({ error: "expired asset A" }, { status: 401 })); await tick();
    expect(props.onUnauthorized).not.toHaveBeenCalled();
    expect(host.updates).toBe(updates);
  });
});

it.each([[1, 1, [false]], [2, 4, [true, false]]] as const)("editor fullsave keeps modifier min=%s/max=%s through pause and reactivation", async (minimum, maximum, active) => {
  stored[0].modifiers = [{ id: "drink", name: "Bebida", required: true, minSelections: minimum, maxSelections: maximum, price: 0,
    options: ["Agua", "Té"].slice(0, active.length),
    optionItems: active.map((_value, index) => ({ id: `option-${index}`, name: index ? "Té" : "Agua", price: 0, available: true })),
  }];
  let tree = await mount(); button(tree, "Editar").props.onClick(); tree = renderEditor();
  const optionSwitches = () => nodes(tree).filter((node) => node.type === "input" && node.props.type === "checkbox" && node.props.checked === true);
  // Option availability inputs are identifiable by their containing row in the real editor.
  const optionRows = () => nodes(tree).filter((node) => node.props?.className === "modifier-option-row");
  expect(optionSwitches().length).toBeGreaterThan(0);
  active.forEach((value, i) => {
    const input = nodes(optionRows()[i]).find((node) => node.type === "input" && node.props.type === "checkbox")!;
    input.props.onChange({ target: { checked: value } }); tree = renderEditor();
  });
  button(tree, "Guardar producto").props.onClick(); await tick(); tree = renderEditor();
  const paused = requests.find((request) => request.init?.method === "PUT")!.body.items[0].modifiers[0];
  expect(paused).toMatchObject({ required: true, minSelections: minimum, maxSelections: maximum });
  expect(paused.optionItems.map((option: any) => option.available)).toEqual(active);
  button(tree, "Editar").props.onClick(); tree = renderEditor();
  active.forEach((_value, i) => {
    const input = nodes(optionRows()[i]).find((node) => node.type === "input" && node.props.type === "checkbox")!;
    input.props.onChange({ target: { checked: true } }); tree = renderEditor();
  });
  button(tree, "Guardar producto").props.onClick(); await tick();
  expect(requests.filter((request) => request.init?.method === "PUT").at(-1)!.body.items[0].modifiers[0]).toMatchObject({ required: true, minSelections: minimum, maxSelections: maximum });
});

it.each([["editor save", renderEditor, "PUT"], ["editor stock", renderEditor, "PATCH"], ["availability stock", renderAvailability, "PATCH"]] as const)("%s cannot update or unlock B when A's write returns late 401 after a same-instance context change", async (_name, render, method) => {
  let tree = await mount(render);
  if (method === "PUT") {
    button(tree, "Editar").props.onClick(); tree = render();
    field(tree).props.onChange({ target: { value: "Draft A" } }); tree = render();
  }
  const normal = fetch; const old = deferred<Response>(); const current = deferred<Response>();
  let oldSignal!: AbortSignal; let currentSignal!: AbortSignal;
  globalThis.fetch = vi.fn(async (url, init) => {
    if (init?.method === method) {
      const authorization = (init.headers as Record<string, string>).Authorization;
      if (authorization === "Bearer fixture-token") { oldSignal = init.signal!; return old.promise; }
      currentSignal = init.signal!; return current.promise;
    }
    return normal(url, init);
  });
  const invoke = (view: any) => method === "PUT" ? nodes(view).find((node) => node.props?.className === "primary-button save-button")!.props.onClick() : nodes(view).find((node) => node.props?.role === "switch")!.props.onClick();
  invoke(tree); await tick();
  props.token = "B"; props.locationId = "local-B";
  render(); host.effects.splice(0).forEach((effect) => effect()); await tick(); tree = render();
  if (method === "PUT") {
    expect(field(tree)).toBeUndefined();
    button(tree, "Editar").props.onClick(); tree = render();
    field(tree).props.onChange({ target: { value: "Draft B" } }); tree = render();
  }
  invoke(tree); await tick(); tree = render();
  const updates = host.updates; const calls = (fetch as any).mock.calls.length;
  expect(oldSignal.aborted).toBe(true); expect(currentSignal.aborted).toBe(false);
  old.resolve(Response.json({ error: "expired A" }, { status: 401 })); await tick();
  expect(props.onUnauthorized).not.toHaveBeenCalled();
  expect(host.updates).toBe(updates);
  expect((fetch as any).mock.calls).toHaveLength(calls);
  if (method === "PUT") expect(field(render()).props.value).toBe("Draft B");
  // A stale finally must not release B's operation lock even via a retained button callback.
  invoke(tree); await tick(); expect((fetch as any).mock.calls).toHaveLength(calls);
  current.resolve(Response.json(method === "PUT" ? { menu: [{ ...stored[0], name: "Draft B" }, stored[1]], menuRevision: 6 } : { updated: true, restaurantId: props.locationId, itemId: "a", available: false, menuRevision: 6 }));
  await tick();
  if (method === "PUT") expect(field(render())).toBeUndefined();
});
