import { afterEach, describe, expect, it, vi } from "vitest";
import { Capacitor, CapacitorHttp, type HttpResponse } from "@capacitor/core";
import { createPartnerNativeApiFetch, installPartnerNativeApiTransport } from "./partnerNativeApiTransport";

vi.mock("@capacitor/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@capacitor/core")>();
  return { ...actual, CapacitorHttp: { request: vi.fn() } };
});
vi.mock("./partnerApi", () => ({ apiOrigin: "https://api.pikidelivery.com" }));
const origin = "https://api.pikidelivery.com";
const login = `${origin}/api/v1/auth/employee/login`;
const me = `${origin}/api/v1/auth/employee/me`;
const jsonHeaders = { "Content-Type": "application/json" };
const fixtureBody = '{ "email": "fixture@example.invalid", "password": "fixture-only-not-a-secret", "remember": false }';
function nativeResponse(status = 200, data: unknown = { ok: true }, headers: Record<string, string> = {}): HttpResponse {
  return { status, data, headers, url: me };
}
function fixture(nativeAndroid = true, apiOrigin = origin) {
  const browserResponse = new Response("browser");
  const browserFetch = vi.fn<typeof fetch>().mockResolvedValue(browserResponse);
  const httpRequest = vi.fn<(options: import("@capacitor/core").HttpOptions) => Promise<HttpResponse>>()
    .mockResolvedValue(nativeResponse());
  const fetchImpl = createPartnerNativeApiFetch({ browserFetch, nativeAndroid, apiOrigin, httpRequest });
  return { fetchImpl, browserFetch, browserResponse, httpRequest };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Partner native JSON transport (offline DI)", () => {
  it("delegates web/proxy calls unchanged", async () => {
    const f = fixture(false);
    const init: RequestInit = { method: "POST", body: fixtureBody, headers: jsonHeaders };
    expect(await f.fetchImpl(login, init)).toBe(f.browserResponse);
    expect(f.browserFetch).toHaveBeenCalledWith(login, init);
    expect(f.httpRequest).not.toHaveBeenCalled();
    const native = fixture();
    await native.fetchImpl("/piki-api/api/v1/auth/employee/login", init);
    expect(native.browserFetch).toHaveBeenCalledWith("/piki-api/api/v1/auth/employee/login", init);
    expect(native.httpRequest).not.toHaveBeenCalled();
  });

  it.each([
    "https://external.invalid/api/v1/auth/employee/me",
    "https://api.pikidelivery.com.external.invalid/api/v1/auth/employee/me",
    "http://api.pikidelivery.com/api/v1/auth/employee/me",
    "https://fixture:fixture@api.pikidelivery.com/api/v1/auth/employee/me",
    `${me}#fixture`, `${origin}/api/v1/unknown`, `${origin}/api/v1/partners/menu/assets`,
    `${origin}/api/v1/partners/menu/assets/fixture/download`,
    `${origin}/api/v1/partners/profile/image`, `${origin}/api/v1/partners/profile/file`,
    `${origin}/api/v1/partners/kitchen/orders/fixture/download`,
    `${origin}/api/v1/realtime/events`, `${origin}/api/v1/catalog/events`,
  ])("keeps external, unknown, upload, download and SSE URL in browser: %s", async (url) => {
    const f = fixture();
    const init = { headers: { Authorization: "Bearer fixture-token" } };
    await f.fetchImpl(url, init);
    expect(f.browserFetch).toHaveBeenCalledWith(url, init);
    expect(f.httpRequest).not.toHaveBeenCalled();
  });

  it.each(["/piki-api", "https://external.invalid", "http://api.pikidelivery.com", `${origin}/api`,
    `${origin}?fixture=1`, `${origin}#fixture`, "https://fixture:fixture@api.pikidelivery.com"])
  ("rejects untrusted configured origins: %s", async (configured) => {
    const f = fixture(true, configured);
    await f.fetchImpl(me);
    expect(f.httpRequest).not.toHaveBeenCalled();
    expect(f.browserFetch).toHaveBeenCalledWith(me, undefined);
  });

  it.each(["text/event-stream", "application/json, Text/Event-Stream; q=0.8", "image/png", "application/pdf"])
  ("delegates streaming/binary Accept even on known routes: %s", async (accept) => {
    const f = fixture();
    await f.fetchImpl(me, { headers: { Accept: accept } });
    expect(f.httpRequest).not.toHaveBeenCalled();
    expect(f.browserFetch).toHaveBeenCalledOnce();
  });

  it("preserves JWT, role, location and release headers on GET without data", async () => {
    const f = fixture();
    const request = new Request(me, { headers: {
      Authorization: "Bearer fixture-jwt", "X-PIKI-Role": "fixture-role", "X-PIKI-Restaurant-Id": "fixture-local",
    } });
    const init = { headers: { "X-PIKI-Client-Version": "fixture-version", "X-PIKI-Client-Build": "fixture-build", "X-PIKI-Surface": "partner" } };
    await f.fetchImpl(request, init);
    expect(f.httpRequest).toHaveBeenCalledExactlyOnceWith({
      url: me, method: "GET", headers: {
        authorization: "Bearer fixture-jwt", "x-piki-role": "fixture-role", "x-piki-restaurant-id": "fixture-local",
        "x-piki-client-version": "fixture-version", "x-piki-client-build": "fixture-build", "x-piki-surface": "partner",
      }, responseType: "text", connectTimeout: 8000, readTimeout: 8000, disableRedirects: true,
    });
    expect(f.browserFetch).not.toHaveBeenCalled();
  });

  it("preserves login string exactly and never logs payloads/headers", async () => {
    const log = vi.spyOn(console, "log");
    const warn = vi.spyOn(console, "warn");
    const error = vi.spyOn(console, "error");
    const f = fixture();
    await f.fetchImpl(login, { method: "POST", headers: jsonHeaders, body: fixtureBody });
    expect(f.httpRequest).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ method: "POST", url: login, data: fixtureBody }));
    expect(log).not.toHaveBeenCalled(); expect(warn).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
  });

  it("reads a JSON Request clone and merges init headers without consuming input", async () => {
    const f = fixture();
    const request = new Request(login, { method: "POST", body: fixtureBody, headers: { ...jsonHeaders, Authorization: "Bearer fixture-old", "X-PIKI-Role": "fixture-role" } });
    await f.fetchImpl(request, { headers: { Authorization: "Bearer fixture-new" } });
    expect(f.httpRequest).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      data: fixtureBody, headers: { "content-type": "application/json", authorization: "Bearer fixture-new", "x-piki-role": "fixture-role" },
    }));
    expect(request.bodyUsed).toBe(false);
    expect(await request.text()).toBe(fixtureBody);
  });

  it.each([204, 205, 304])("returns a null body for %s regardless of native data", async (status) => {
    const f = fixture();
    f.httpRequest.mockResolvedValue(nativeResponse(status, { discarded: true }, { "X-Fixture": "retained" }));
    const response = await f.fetchImpl(me);
    expect(response.status).toBe(status);
    expect(response.body).toBeNull();
    expect(await response.text()).toBe("");
    expect(response.headers.get("x-fixture")).toBe("retained");
  });

  it.each([400, 401, 403, 429, 500])("preserves HTTP %s API errors and headers (not transport rejection)", async (status) => {
    const f = fixture();
    const data = { error: "FIXTURE_API_CODE", message: "fixture message", details: { attempt: 1 } };
    f.httpRequest.mockResolvedValue(nativeResponse(status, data, { "Content-Type": "application/json", "Retry-After": "8" }));
    const response = await f.fetchImpl(login, { method: "POST", headers: jsonHeaders, body: fixtureBody });
    expect(response.status).toBe(status); expect(response.ok).toBe(false);
    expect(response.headers.get("retry-after")).toBe("8");
    expect(await response.json()).toEqual(data);
    expect(f.httpRequest).toHaveBeenCalledOnce(); expect(f.browserFetch).not.toHaveBeenCalled();
  });

  it("preserves response text exactly", async () => {
    const f = fixture();
    const text = '{ "error": "FIXTURE_API_CODE", "message": "fixture" }';
    f.httpRequest.mockResolvedValue(nativeResponse(429, text));
    expect(await (await f.fetchImpl(me)).text()).toBe(text);
  });

  it.each(["GET", "HEAD", "DELETE"])("omits native data for bodyless %s", async (method) => {
    const f = fixture();
    const response = await f.fetchImpl(me, { method });
    expect(f.httpRequest.mock.calls[0][0]).not.toHaveProperty("data");
    if (method === "HEAD") expect(response.body).toBeNull();
  });

  it.each([new FormData(), new Blob(["fixture"], { type: "application/json" }), new ArrayBuffer(4), new URLSearchParams({ fixture: "value" })])
  ("delegates unsupported init body without rewriting", async (body) => {
    const f = fixture();
    const init = { method: "POST", headers: jsonHeaders, body };
    await f.fetchImpl(login, init);
    expect(f.browserFetch).toHaveBeenCalledWith(login, init);
    expect(f.httpRequest).not.toHaveBeenCalled();
  });

  it.each(["not json", '"fixture scalar"', "null", "42"])("delegates invalid/non-object JSON unchanged: %s", async (body) => {
    const f = fixture();
    const request = new Request(login, { method: "POST", headers: jsonHeaders, body });
    await f.fetchImpl(request);
    expect(request.bodyUsed).toBe(false);
    expect(f.browserFetch).toHaveBeenCalledWith(request, undefined);
    expect(f.httpRequest).not.toHaveBeenCalled();
    expect(await request.text()).toBe(body);
  });

  it.each([
    { mode: "no-cors" }, { credentials: "include" }, { redirect: "manual" }, { integrity: "fixture" },
    { keepalive: true }, { cache: "only-if-cached" }, { body: fixtureBody, method: "DELETE", headers: jsonHeaders },
    { method: "POST", body: fixtureBody, headers: { "Content-Type": "text/plain" } },
  ] as RequestInit[])("delegates unsupported fetch semantics: %j", async (init) => {
    const f = fixture();
    await f.fetchImpl(login, init);
    expect(f.browserFetch).toHaveBeenCalledWith(login, init); expect(f.httpRequest).not.toHaveBeenCalled();
  });

  it("rejects already-aborted before body reading or native dispatch", async () => {
    const f = fixture();
    const controller = new AbortController(); controller.abort();
    const request = new Request(login, { method: "POST", headers: jsonHeaders, body: fixtureBody });
    await expect(f.fetchImpl(request, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(request.bodyUsed).toBe(false); expect(f.httpRequest).not.toHaveBeenCalled(); expect(f.browserFetch).not.toHaveBeenCalled();
  });

  it("discards late native responses after abort without applying status or retry", async () => {
    const f = fixture(); const pending = deferred<HttpResponse>();
    f.httpRequest.mockReturnValue(pending.promise);
    const controller = new AbortController(); const apply = vi.fn();
    const promise = f.fetchImpl(me, { signal: controller.signal }).then(apply);
    const rejection = expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(f.httpRequest).toHaveBeenCalledOnce(); controller.abort(); await rejection;
    pending.resolve(nativeResponse(401, { error: "FIXTURE_LATE" }));
    await Promise.resolve(); await Promise.resolve();
    expect(apply).not.toHaveBeenCalled(); expect(f.browserFetch).not.toHaveBeenCalled();
    expect(f.httpRequest).toHaveBeenCalledOnce();
  });

  it("checks abort after awaiting Request body, before native dispatch", async () => {
    const f = fixture(); const pending = deferred<string>(); const controller = new AbortController();
    const request = new Request(login, { method: "POST", headers: jsonHeaders, body: fixtureBody });
    vi.spyOn(request, "clone").mockReturnValue({ text: () => pending.promise } as Request);
    const promise = f.fetchImpl(request, { signal: controller.signal });
    const rejection = expect(promise).rejects.toMatchObject({ name: "AbortError" });
    controller.abort(); pending.resolve(fixtureBody); await rejection;
    expect(f.httpRequest).not.toHaveBeenCalled(); expect(request.bodyUsed).toBe(false);
  });

  it("removes abort listener on success and failure", async () => {
    for (const fail of [false, true]) {
      const f = fixture(); const controller = new AbortController();
      const remove = vi.spyOn(controller.signal, "removeEventListener");
      if (fail) f.httpRequest.mockRejectedValue(new Error("fixture-native-error"));
      await f.fetchImpl(me, { signal: controller.signal }).catch(() => undefined);
      expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    }
  });

  it("keeps native SSL code/error identity and never retries a real Request POST", async () => {
    const f = fixture();
    const error = Object.assign(new Error("fixture SSLHandshakeException"), { code: "FIXTURE_SSL_ERROR" });
    f.httpRequest.mockRejectedValue(error);
    const request = new Request(login, { method: "POST", headers: jsonHeaders, body: fixtureBody });
    await expect(f.fetchImpl(request)).rejects.toBe(error);
    expect(f.httpRequest).toHaveBeenCalledOnce(); expect(f.browserFetch).not.toHaveBeenCalled();
    expect(request.bodyUsed).toBe(false);
  });

  it.each([
    "/api/v1/partners/profile", "/api/v1/partners/locations", "/api/v1/partners/store/status",
    "/api/v1/partners/store/hours", "/api/v1/partners/menu", "/api/v1/partners/kitchen/orders",
    "/api/v1/partners/kitchen/orders/fixture-order/status", "/api/v1/partners/metrics/overview?period=today",
    "/api/v1/restaurants/fixture-local/menu/items/fixture-item/availability",
  ])("dispatches regular known JSON routes once: %s", async (path) => {
    const f = fixture();
    await f.fetchImpl(`${origin}${path}`, { headers: { Accept: "application/json" }, cache: "no-store" });
    expect(f.httpRequest).toHaveBeenCalledOnce(); expect(f.browserFetch).not.toHaveBeenCalled();
    expect(f.httpRequest.mock.calls[0][0].url).toBe(`${origin}${path}`);
  });

  it("delegates a locked/opaque Request before dispatch without consuming it", async () => {
    const f = fixture();
    const request = new Request(login, { method: "POST", headers: jsonHeaders, body: fixtureBody });
    const reader = request.body!.getReader();
    await f.fetchImpl(request);
    expect(f.browserFetch).toHaveBeenCalledWith(request, undefined);
    expect(f.httpRequest).not.toHaveBeenCalled(); expect(request.bodyUsed).toBe(false);
    reader.releaseLock();
  });

  it("ignores a late native rejection after cancellation (no fallback or unhandled rejection)", async () => {
    const f = fixture(); const pending = deferred<HttpResponse>();
    f.httpRequest.mockReturnValue(pending.promise);
    const controller = new AbortController();
    const promise = f.fetchImpl(login, { method: "POST", body: fixtureBody, headers: jsonHeaders, signal: controller.signal });
    const rejection = expect(promise).rejects.toMatchObject({ name: "AbortError" });
    controller.abort(); await rejection;
    pending.reject(Object.assign(new Error("fixture-late-native-error"), { code: "FIXTURE_LATE_ERROR" }));
    await Promise.resolve(); await Promise.resolve();
    expect(f.httpRequest).toHaveBeenCalledOnce(); expect(f.browserFetch).not.toHaveBeenCalled();
  });

  it("installs only on native Android, idempotently capturing browser fetch", async () => {
    const f = fixture(); const state = { fetch: f.browserFetch };
    vi.stubGlobal("window", state);
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(false);
    const platform = vi.spyOn(Capacitor, "getPlatform").mockReturnValue("android");
    installPartnerNativeApiTransport(); expect(state.fetch).toBe(f.browserFetch);
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    platform.mockReturnValue("ios"); installPartnerNativeApiTransport(); expect(state.fetch).toBe(f.browserFetch);
    platform.mockReturnValue("android");
    const native = vi.spyOn(CapacitorHttp, "request").mockResolvedValue(nativeResponse());
    installPartnerNativeApiTransport(); const installed = state.fetch;
    installPartnerNativeApiTransport(); expect(state.fetch).toBe(installed);
    await state.fetch(me); expect(native).toHaveBeenCalledOnce();
    await state.fetch(`${origin}/api/v1/realtime/events`);
    expect(f.browserFetch).toHaveBeenCalledOnce();
    expect(f.browserFetch.mock.contexts[0]).toBe(state);
  });
});
