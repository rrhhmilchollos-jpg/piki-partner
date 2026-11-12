import { afterEach, describe, expect, it, vi } from "vitest";
import { connectPikiRealtime, getPikiRealtimeReconnectDelay, isPikiRealtimeContentType, isPikiRealtimeUnauthorized } from "./realtime";

describe("PIKI realtime reconnect backoff", () => {
  it("doubles the retry delay before reaching its safety cap", () => {
    expect([1, 2, 3, 4, 5].map(getPikiRealtimeReconnectDelay)).toEqual([
      1_000,
      2_000,
      4_000,
      8_000,
      16_000,
    ]);
  });

  it("bounds malformed and prolonged retry attempts", () => {
    expect(getPikiRealtimeReconnectDelay(0)).toBe(1_000);
    expect(getPikiRealtimeReconnectDelay(Number.NaN)).toBe(1_000);
    expect(getPikiRealtimeReconnectDelay(6)).toBe(30_000);
    expect(getPikiRealtimeReconnectDelay(99)).toBe(30_000);
  });

  it("only treats an expired authentication token as an unauthorized session", () => {
    expect(isPikiRealtimeUnauthorized(401)).toBe(true);
    expect(isPikiRealtimeUnauthorized(403)).toBe(false);
    expect(isPikiRealtimeUnauthorized(503)).toBe(false);
  });
});

describe("PIKI SSE content acknowledgement", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("accepts only the exact event-stream MIME including standard charset", () => {
    for (const mime of ["text/event-stream", "text/event-stream; charset=utf-8", " TEXT/EVENT-STREAM ;charset=UTF-8"]) expect(isPikiRealtimeContentType(mime)).toBe(true);
    for (const mime of [null, "", "text/html", "application/json", "text/event-stream-invalid", "text/event-stream, text/html"]) expect(isPikiRealtimeContentType(mime)).toBe(false);
  });
  it.each(["text/html", "application/json", "", "text/event-stream-invalid"])("does not report connected for HTTP 200 %s", async (mime) => {
    const timer = { setTimeout: vi.fn(() => 1), clearTimeout: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() };
    vi.stubGlobal("window", timer);
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("proxy body", { status: 200, headers: { "content-type": mime } })));
    const onState = vi.fn(); const onEvent = vi.fn();
    const stop = connectPikiRealtime({ apiOrigin: "https://offline.invalid", token: "synthetic-offline-token", surface: "partner", locationId: "synthetic-store", onState, onEvent });
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(onState).not.toHaveBeenCalledWith(expect.objectContaining({ status: "connected" }));
    expect(onState).toHaveBeenCalledWith(expect.objectContaining({ status: "reconnecting" }));
    expect(onEvent).not.toHaveBeenCalled();
    stop(); await Promise.resolve();
  });
});
