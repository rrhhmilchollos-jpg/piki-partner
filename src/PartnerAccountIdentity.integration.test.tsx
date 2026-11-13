/// <reference types="node" />
import { setImmediate } from "node:timers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PartnerAccountIdentity, { AccountPhoto } from "./PartnerAccountIdentity";
import { prepareAccountPhoto } from "./accountPhoto";
import { normalisePartnerProfile } from "./partnerApi";

const runtime = vi.hoisted(() => ({ slots: [] as any[], cursor: 0, effects: [] as (() => unknown)[] }));
vi.mock("react", async () => {
  const original = await vi.importActual<typeof import("react")>("react");
  const memo = (factory: () => any, deps?: any[]) => {
    const index = runtime.cursor++; const old = runtime.slots[index];
    if (!old || !deps || deps.some((dep, i) => !Object.is(dep, old.deps?.[i]))) runtime.slots[index] = { value: factory(), deps };
    return runtime.slots[index].value;
  };
  const effect = (callback: () => unknown, deps?: any[]) => {
    const index = runtime.cursor++; const old = runtime.slots[index];
    if (!old || !deps || deps.some((dep, i) => !Object.is(dep, old.deps?.[i]))) {
      const next = { deps, cleanup: undefined as unknown }; runtime.slots[index] = next;
      runtime.effects.push(() => { if (typeof old?.cleanup === "function") old.cleanup(); next.cleanup = callback(); });
    }
  };
  return { ...original,
    useState: (initial: any) => {
      const index = runtime.cursor++;
      if (!(index in runtime.slots)) runtime.slots[index] = typeof initial === "function" ? initial() : initial;
      return [runtime.slots[index], (next: any) => { runtime.slots[index] = typeof next === "function" ? next(runtime.slots[index]) : next; }];
    },
    useRef: (initial: any) => {
      const index = runtime.cursor++;
      if (!(index in runtime.slots)) runtime.slots[index] = { current: initial };
      return runtime.slots[index];
    },
    useMemo: memo,
    useCallback: (callback: any, deps: any[]) => memo(() => callback, deps),
    useLayoutEffect: effect,
  };
});
vi.mock("./accountPhoto", async () => ({ ...await vi.importActual<typeof import("./accountPhoto")>("./accountPhoto"), prepareAccountPhoto: vi.fn() }));
vi.mock("./pwaUpdateRuntime", () => ({ usePwaUpdateBlocker: () => undefined }));

const oldPhoto = "data:image/jpeg;base64,AQID";
const newPhoto = "data:image/jpeg;base64,BAUG";
const tick = async () => { for (let i = 0; i < 4; i += 1) await new Promise<void>((resolve) => setImmediate(resolve)); };
function nodes(tree: any): any[] {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
let sessionActive: boolean;
const props = {
  profile: normalisePartnerProfile({ employee: { id: "A", fullName: "Persona A", role: "fleet", jobRole: "Responsable real", photoUrl: oldPhoto } }),
  token: "token-A", identityKey: "epoch-A",
  isCurrentSession: () => sessionActive,
  onUnauthorized: vi.fn(), onPhotoSaved: vi.fn(),
};
function render() {
  runtime.cursor = 0;
  const tree = PartnerAccountIdentity(props);
  runtime.effects.splice(0).forEach((effect) => effect());
  return tree;
}
function choosePhoto(tree = render()) {
  const input = nodes(tree).find((node) => node.type === "input")!;
  const event = { currentTarget: { files: [new File(["fixture"], "photo.jpg", { type: "image/jpeg" })], value: "photo.jpg" } };
  input.props.onChange(event);
  expect(event.currentTarget.value).toBe("");
}
beforeEach(() => {
  runtime.slots = []; runtime.cursor = 0; runtime.effects = [];
  sessionActive = true;
  props.token = "token-A"; props.identityKey = "epoch-A";
  props.profile = normalisePartnerProfile({ employee: { id: "A", fullName: "Persona A", role: "fleet", jobRole: "Responsable real", photoUrl: oldPhoto } });
  props.onUnauthorized.mockReset(); props.onPhotoSaved.mockReset();
  vi.mocked(prepareAccountPhoto).mockReset().mockResolvedValue(newPhoto);
  globalThis.fetch = vi.fn(async () => Response.json({ employee: { photoUrl: newPhoto, role: "owner", jobRole: "Inventado" } }));
});

describe("Own photo ACK and session lifetimes (offline)", () => {
  it("does not preview/update before ACK and sends only own photo with Bearer", async () => {
    const pending = deferred<Response>();
    globalThis.fetch = vi.fn(() => pending.promise);
    choosePhoto(); await tick();
    expect(props.onPhotoSaved).not.toHaveBeenCalled();
    expect(nodes(render()).find((node) => node.type === AccountPhoto)!.props.photoUrl).toBe(oldPhoto);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toMatch(/\/api\/v1\/auth\/employee\/profile$/);
    expect(init!.headers).toEqual({ Authorization: "Bearer token-A", "Content-Type": "application/json" });
    expect(init!.method).toBe("PATCH");
    expect(JSON.parse(String(init!.body))).toEqual({ photoUrl: newPhoto });
    expect(init!.signal).toBeInstanceOf(AbortSignal);
    pending.resolve(Response.json({ employee: { photoUrl: newPhoto, role: "owner", jobRole: "Inventado" } })); await tick();
    expect(props.onPhotoSaved).toHaveBeenCalledExactlyOnceWith(newPhoto);
    expect(props.profile.role).toBe("fleet");
    expect(props.profile.jobRole).toBe("Responsable real");
    expect(JSON.stringify(render())).toContain("Foto propia guardada.");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("sends null to remove only the own photo and waits for ACK", async () => {
    const pending = deferred<Response>(); globalThis.fetch = vi.fn(() => pending.promise);
    const button = nodes(render()).find((node) => node.type === "button" && node.props.children === "Quitar foto propia")!;
    button.props.onClick(); await tick();
    expect(props.onPhotoSaved).not.toHaveBeenCalled();
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]!.body))).toEqual({ photoUrl: null });
    pending.resolve(Response.json({ employee: { photoUrl: null } })); await tick();
    expect(props.onPhotoSaved).toHaveBeenCalledExactlyOnceWith(null);
    expect(prepareAccountPhoto).not.toHaveBeenCalled();
  });
  it.each([400, 413, 500])("keeps the previous image when PATCH fails with %s", async (status) => {
    globalThis.fetch = vi.fn(async () => Response.json({ error: "fixture" }, { status }));
    choosePhoto(); await tick();
    expect(props.onPhotoSaved).not.toHaveBeenCalled();
    expect(props.onUnauthorized).not.toHaveBeenCalled();
    expect(JSON.stringify(render())).toContain("Se conserva la foto anterior");
  });
  it.each([401, 403, 428])("clears current identity via auth handler for PATCH %s", async (status) => {
    globalThis.fetch = vi.fn(async () => Response.json({ error: "fixture" }, { status }));
    choosePhoto(); await tick();
    expect(props.onUnauthorized).toHaveBeenCalledTimes(1);
    expect(props.onPhotoSaved).not.toHaveBeenCalled();
  });
  it("ignores a late ACK immediately after session invalidation, before rerender", async () => {
    const pending = deferred<Response>(); globalThis.fetch = vi.fn(() => pending.promise);
    choosePhoto(); await tick(); sessionActive = false;
    pending.resolve(Response.json({ employee: { photoUrl: newPhoto } })); await tick();
    expect(props.onPhotoSaved).not.toHaveBeenCalled();
    expect(props.onUnauthorized).not.toHaveBeenCalled();
  });
  it.each(["token", "identityKey"] as const)("aborts and ignores a late ACK after changing %s in the same lifetime", async (key) => {
    const pending = deferred<Response>(); globalThis.fetch = vi.fn(() => pending.promise);
    choosePhoto(); await tick();
    const signal = vi.mocked(fetch).mock.calls[0][1]!.signal!;
    props[key] = "B"; render();
    expect(signal.aborted).toBe(true);
    pending.resolve(Response.json({ employee: { photoUrl: newPhoto } })); await tick();
    expect(props.onPhotoSaved).not.toHaveBeenCalled();
    expect(props.onUnauthorized).not.toHaveBeenCalled();
  });
  it("ignores JSON and unauthorized from a previous session after its request started", async () => {
    const json = deferred<unknown>();
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: () => json.promise }) as Response);
    choosePhoto(); await tick(); sessionActive = false;
    json.resolve({ employee: { photoUrl: newPhoto } }); await tick();
    expect(props.onPhotoSaved).not.toHaveBeenCalled();
    expect(props.onUnauthorized).not.toHaveBeenCalled();
  });
  it("does not send an image if the session changes during canvas preparation", async () => {
    const preparation = deferred<string>(); vi.mocked(prepareAccountPhoto).mockReturnValue(preparation.promise);
    choosePhoto(); sessionActive = false;
    preparation.resolve(newPhoto); await tick();
    expect(fetch).not.toHaveBeenCalled();
    expect(props.onPhotoSaved).not.toHaveBeenCalled();
  });
  it("ignores repeated upload actions while waiting for the same ACK", async () => {
    const pending = deferred<Response>(); globalThis.fetch = vi.fn(() => pending.promise);
    const tree = render(); choosePhoto(tree); choosePhoto(tree); await tick();
    expect(fetch).toHaveBeenCalledTimes(1);
    pending.resolve(Response.json({ employee: { photoUrl: newPhoto } })); await tick();
    expect(props.onPhotoSaved).toHaveBeenCalledTimes(1);
  });
  it("handles a broken supplied image with neutral Sin foto, without fetching a replacement", () => {
    runtime.cursor = 0;
    let tree = AccountPhoto({ photoUrl: oldPhoto, fullName: "Persona real" });
    nodes(tree).find((node) => node.type === "img")!.props.onError();
    runtime.cursor = 0;
    tree = AccountPhoto({ photoUrl: oldPhoto, fullName: "Persona real" });
    expect(nodes(tree).some((node) => node.type === "img")).toBe(false);
    expect(JSON.stringify(tree)).toContain("Sin foto");
    expect(fetch).not.toHaveBeenCalled();
    runtime.cursor = 0;
    tree = AccountPhoto({ photoUrl: newPhoto, fullName: "Persona real" });
    expect(nodes(tree).find((node) => node.type === "img")!.props.src).toBe(newPhoto);
  });
});

describe("New-session editor and strict ACK (offline)", () => {
  it("lets account B upload independently while A still has an unresolved PATCH", async () => {
    const pendingA = deferred<Response>();
    globalThis.fetch = vi.fn((_url, init) => (init!.headers as Record<string, string>).Authorization === "Bearer token-A" ? pendingA.promise : Promise.resolve(Response.json({ employee: { photoUrl: newPhoto } })));
    choosePhoto(); await tick();
    props.token = "token-B"; props.identityKey = "epoch-B";
    props.profile = normalisePartnerProfile({ employee: { id: "B", name: "Persona B", role: "fleet" } });
    expect(nodes(render()).find((node) => node.type === "button")!.props.disabled).toBe(false);
    choosePhoto(); await tick();
    expect(props.onPhotoSaved).toHaveBeenCalledExactlyOnceWith(newPhoto);
    pendingA.resolve(Response.json({ employee: { photoUrl: oldPhoto } })); await tick();
    expect(props.onPhotoSaved).toHaveBeenCalledTimes(1);
  });
  it("does not let A's late 401 clear B's identity", async () => {
    const pending = deferred<Response>(); globalThis.fetch = vi.fn(() => pending.promise);
    choosePhoto(); await tick();
    props.token = "token-B"; props.identityKey = "epoch-B"; render();
    pending.resolve(Response.json({ error: "expired A" }, { status: 401 })); await tick();
    expect(props.onUnauthorized).not.toHaveBeenCalled();
    expect(props.onPhotoSaved).not.toHaveBeenCalled();
  });
  it.each([{ success: false }, { ok: false }, { photoUrl: "data:image/svg+xml;base64,AQID" }])("does not update on explicit rejection/unsafe ACK %j", async (payload) => {
    globalThis.fetch = vi.fn(async () => Response.json(payload));
    choosePhoto(); await tick();
    expect(props.onPhotoSaved).not.toHaveBeenCalled();
    expect(nodes(render()).find((node) => node.type === AccountPhoto)!.props.photoUrl).toBe(oldPhoto);
  });
  it("treats HTTP 204 as an ACK without a redundant /me", async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 204 }));
    choosePhoto(); await tick();
    expect(props.onPhotoSaved).toHaveBeenCalledExactlyOnceWith(newPhoto);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("keeps the old image on a non-JSON 200 response", async () => {
    globalThis.fetch = vi.fn(async () => new Response("<html>not an API ACK</html>", { status: 200 }));
    choosePhoto(); await tick();
    expect(props.onPhotoSaved).not.toHaveBeenCalled();
  });
});
