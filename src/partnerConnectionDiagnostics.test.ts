import { afterEach, describe, expect, it, vi } from "vitest";
import { getPartnerReadyUrl, getPartnerTransportErrorMessage, probePartnerConnection, sanitizePartnerDiagnosticText } from "./partnerConnectionDiagnostics";
import type { PartnerConnectionDependencies } from "./partnerConnectionDiagnostics";

const origin = "https://fixture.invalid";
const now = Date.parse("2026-11-18T00:00:00Z");
function dependencies(native = true): PartnerConnectionDependencies {
  return {
    isNativePlatform: () => native,
    getPlatform: () => native ? "android" : "web",
    isNativeHttpAvailable: () => true,
    nativeGet: vi.fn().mockResolvedValue({ status: 200, data: { service: "piki-api", status: "ready" }, headers: {}, url: `${origin}/ready` }),
    fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ service: "piki-api", status: "ready" }), { status: 200 })),
    now: () => now,
  };
}
afterEach(() => vi.useRealTimers());

describe("Partner connection diagnostics (offline)", () => {
  it.each(["http://fixture.invalid", "/piki-api", "//fixture.invalid", "https://user:pass@fixture.invalid", "https://fixture.invalid/v1", "https://fixture.invalid?token=secret", "https://fixture.invalid/#secret", " https://fixture.invalid", "https://fixture.invalid\\ready"])("rejects unsafe native origin %s before any request", async (apiOrigin) => {
    const deps = dependencies();
    expect(() => getPartnerReadyUrl(apiOrigin, true)).toThrow();
    const result = await probePartnerConnection(apiOrigin, deps);
    expect(result.errorCode).toBe("INVALID_API_ORIGIN");
    expect(deps.nativeGet).not.toHaveBeenCalled();
    expect(deps.fetch).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("token=secret");
  });
  it("sends exactly one native GET with exact SDK options and no credentials or headers", async () => {
    const deps = dependencies();
    const result = await probePartnerConnection(`${origin}/`, deps);
    expect(result.ok).toBe(true);
    expect(deps.nativeGet).toHaveBeenCalledExactlyOnceWith({ url: `${origin}/ready`, connectTimeout: 8000, readTimeout: 8000, responseType: "json", disableRedirects: true });
    expect(deps.fetch).not.toHaveBeenCalled();
    expect(result.deviceUtc).toBe("2026-11-18T00:00:00.000Z");
  });
  it("does not silently fall back when native HTTP is unavailable", async () => {
    const deps = dependencies(); deps.isNativeHttpAvailable = () => false;
    expect((await probePartnerConnection(origin, deps)).errorCode).toBe("NATIVE_HTTP_UNAVAILABLE");
    expect(deps.nativeGet).not.toHaveBeenCalled(); expect(deps.fetch).not.toHaveBeenCalled();
  });
  it.each([null, "not JSON", { service: "other", status: "ready" }, { service: "piki-api", status: "down" }])("rejects HTTP 200 with an invalid service payload %j", async (data) => {
    const deps = dependencies(); deps.nativeGet = vi.fn().mockResolvedValue({ status: 200, data, headers: { "Set-Cookie": "private" } });
    const result = await probePartnerConnection(origin, deps);
    expect(result.ok).toBe(false); expect(result.errorCode).toBe("INVALID_READY_RESPONSE"); expect(JSON.stringify(result)).not.toContain("private");
  });
  it("does not accept a non-200 HTTP status even with a valid payload", async () => {
    const deps = dependencies(); deps.nativeGet = vi.fn().mockResolvedValue({ status: 403, data: { service: "piki-api", status: "ready" }, headers: {} });
    const result = await probePartnerConnection(origin, deps);
    expect(result.httpStatus).toBe(403); expect(result.ok).toBe(false);
  });
  it.each(["SSLHandshakeException", "certificateChain", "certpath", "UnknownHostException", "ERR_NAME_NOT_RESOLVED", "SocketTimeoutException"])("keeps the received native code %s and offers uncertain guidance", async (code) => {
    const deps = dependencies(); deps.nativeGet = vi.fn().mockRejectedValue({ code, message: code });
    const result = await probePartnerConnection(origin, deps);
    expect(result.errorCode).toBe(code); expect(result.guidance).toMatch(/confirmad|confirmar/);
  });
  it("orients generic timeout/Failed to fetch only inside the connectivity probe", async () => {
    const deps = dependencies();
    for (const message of ["connection timeout", "Failed to fetch"]) {
      deps.nativeGet = vi.fn().mockRejectedValue(new Error(message));
      const result = await probePartnerConnection(origin, deps);
      expect(result.guidance).toMatch(/espera|WebView/);
      expect(getPartnerTransportErrorMessage(new Error(message))).toBe(message);
    }
  });
  it("uses case-insensitive Date and advises automatic date for skew over 300 seconds", async () => {
    const deps = dependencies(); deps.nativeGet = vi.fn().mockResolvedValue({ status: 200, data: { service: "piki-api", status: "ready" }, headers: { dAtE: "Tue, 17 Nov 2026 23:50:00 GMT" } });
    const result = await probePartnerConnection(origin, deps);
    expect(result.clockDifferenceSeconds).toBe(600); expect(result.guidance).toContain("fecha y hora automáticas");
  });
  it("handles missing/invalid Date without guessing clock skew", async () => {
    const deps = dependencies(); deps.nativeGet = vi.fn().mockResolvedValue({ status: 200, data: { service: "piki-api", status: "ready" }, headers: { Date: "invalid" } });
    expect((await probePartnerConnection(origin, deps)).clockDifferenceSeconds).toBeUndefined();
  });
  it("redacts credentials, emails, JWTs, query strings and bounds output", () => {
    const text = sanitizePartnerDiagnosticText("SSLHandshakeException password=hunter2 token=sekret Cookie=session123 alice@example.com Bearer abcdef eyJabc.abcdef.signature https://user:pass@fixture.invalid/ready?token=private " + "x ".repeat(150));
    for (const secret of ["hunter2", "sekret", "session123", "alice@example.com", "abcdef", "private", "user:pass"]) expect(text).not.toContain(secret);
    expect(text.length).toBeLessThanOrEqual(180);
  });
  it("does not disclose multiple cookie values", () => {
    expect(sanitizePartnerDiagnosticText("Error Cookie: session=private; other=sensitive")).toBe("Error [cookies ocultas]");
  });
  it("handles null errors and disallows unsafe error codes", async () => {
    const deps = dependencies(); deps.nativeGet = vi.fn().mockRejectedValue(null);
    expect((await probePartnerConnection(origin, deps)).errorCode).toBe("UNKNOWN_ERROR");
    deps.nativeGet = vi.fn().mockRejectedValue({ code: "token=private", message: "email: alice@example.com" });
    const result = await probePartnerConnection(origin, deps);
    expect(result.errorCode).toBe("UNKNOWN_ERROR"); expect(JSON.stringify(result)).not.toContain("private"); expect(JSON.stringify(result)).not.toContain("alice@example.com");
  });
  it("uses web proxy GET with omitted credentials, no auth headers and no native call", async () => {
    const deps = dependencies(false);
    expect((await probePartnerConnection("/piki-api", deps)).ok).toBe(true);
    expect(deps.fetch).toHaveBeenCalledExactlyOnceWith("/piki-api/ready", { method: "GET", credentials: "omit", redirect: "error", signal: expect.any(AbortSignal) });
    expect(deps.nativeGet).not.toHaveBeenCalled();
  });
  it("requires both native and Android flags (safe web mock)", async () => {
    const deps = dependencies(false); deps.getPlatform = () => "android";
    expect((await probePartnerConnection("/piki-api", deps)).ok).toBe(true); expect(deps.nativeGet).not.toHaveBeenCalled();
  });
  it("records HTTP status and Date even on malformed web JSON", async () => {
    const deps = dependencies(false); deps.fetch = vi.fn().mockResolvedValue(new Response("<html>error</html>", { status: 200, headers: { DATE: "Tue, 17 Nov 2026 23:50:00 GMT" } }));
    const result = await probePartnerConnection(origin, deps);
    expect(result.errorCode).toBe("INVALID_READY_JSON"); expect(result.httpStatus).toBe(200); expect(result.clockDifferenceSeconds).toBe(600);
  });
  it("aborts web fetch at 8000ms, reports timeout and never retries", async () => {
    vi.useFakeTimers();
    const deps = dependencies(false);
    deps.fetch = vi.fn((_input, init) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))));
    const pending = probePartnerConnection(origin, deps);
    await vi.advanceTimersByTimeAsync(8000);
    expect((await pending).errorCode).toBe("WEB_TIMEOUT"); expect(deps.fetch).toHaveBeenCalledTimes(1);
  });
  it("classifies only transport failures and preserves ordinary auth/rate-limit messages", () => {
    expect(getPartnerTransportErrorMessage(new TypeError("Failed to fetch"))).toContain("WebView");
    expect(getPartnerTransportErrorMessage({ code: "UnknownHostException" })).toContain("DNS");
    for (const message of ["Contraseña incorrecta", "HTTP 429: demasiados intentos", "HTTP 403", "timeout al validar la contraseña"]) expect(getPartnerTransportErrorMessage(new Error(message))).toBe(message);
    expect(getPartnerTransportErrorMessage(null)).toBeTruthy();
  });
});
