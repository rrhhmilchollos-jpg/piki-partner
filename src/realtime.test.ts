import { describe, expect, it } from "vitest";
import { getPikiRealtimeReconnectDelay } from "./realtime";

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
});
