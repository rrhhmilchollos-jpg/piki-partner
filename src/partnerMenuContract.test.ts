import { describe, expect, it, vi } from "vitest";
import { menuWriteBody, patchPartnerMenuAvailability, PartnerMenuRequestError, readMenuSnapshot } from "./partnerMenuContract";

const args = { apiOrigin: "https://fixture.invalid", headers: { Authorization: "Bearer fixture", "X-PIKI-Restaurant-Id": "local/one" }, restaurantId: "local/one", itemId: "item/a", available: false };
describe("Partner menu contract", () => {
  it("reads version zero with its exact snapshot and sends an expected revision", () => {
    const snapshot = readMenuSnapshot({ menu: [{ id: "a", available: false }], menuRevision: 0, restaurant: { menuRevision: 0 } });
    expect(menuWriteBody(snapshot, snapshot.items)).toEqual({ items: [{ id: "a", available: false }], expectedMenuRevision: 0 });
  });
  it("accepts the nested revision but rejects disagreement, missing menu and malformed revision", () => {
    expect(readMenuSnapshot({ menu: [], restaurant: { menuRevision: 3 } }).menuRevision).toBe(3);
    expect(() => readMenuSnapshot({ menu: [], menuRevision: 2, restaurant: { menuRevision: 3 } })).toThrow("coherente");
    for (const menuRevision of [undefined, -1, 1.5, Number.NaN]) expect(() => readMenuSnapshot({ menu: [], menuRevision })).toThrow();
    expect(() => readMenuSnapshot({ menuRevision: 0 })).toThrow();
  });
  it("changes only a targeted availability field and does not resurrect another device's pause", async () => {
    const stored = [{ id: "item/a", available: true, name: "A" }, { id: "item/b", available: true, name: "B" }];
    let menuRevision = 10;
    const requests: { url: string; method?: string; body: any }[] = [];
    globalThis.fetch = vi.fn(async (url, init) => {
      const body = JSON.parse(String(init?.body));
      requests.push({ url: String(url), method: init?.method, body });
      const itemId = decodeURIComponent(String(url).split("/").at(-2)!);
      const item = stored.find((candidate) => candidate.id === itemId)!;
      const changed = item.available !== body.available;
      item.available = body.available;
      if (changed) menuRevision += 1;
      return Response.json({ updated: true, changed, restaurantId: args.restaurantId, itemId, available: item.available, menuRevision });
    });
    await patchPartnerMenuAvailability(args);
    await patchPartnerMenuAvailability({ ...args, itemId: "item/b" });
    await patchPartnerMenuAvailability(args);
    expect(stored.map((item) => item.available)).toEqual([false, false]);
    expect(menuRevision).toBe(12);
    expect(requests.every((request) => request.method === "PATCH" && JSON.stringify(request.body) === '{"available":false}')).toBe(true);
    expect(requests[0].url).toContain("/restaurants/local%2Fone/menu/items/item%2Fa/availability");
    expect((fetch as any).mock.calls[0][1].headers["X-PIKI-Restaurant-Id"]).toBe(args.restaurantId);
  });
  it.each([401, 403, 404, 409, 500])("returns HTTP %s to the caller without replay", async (status) => {
    globalThis.fetch = vi.fn(async () => Response.json({ error: "fixture-error" }, { status }));
    await expect(patchPartnerMenuAvailability(args)).rejects.toMatchObject({ status });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(new PartnerMenuRequestError(status, "fixture").status).toBe(status);
  });
  it("rejects mismatched confirmations and missing local before any request", async () => {
    globalThis.fetch = vi.fn(async () => Response.json({ updated: true, restaurantId: "other", itemId: args.itemId, available: false, menuRevision: 2 }));
    await expect(patchPartnerMenuAvailability(args)).rejects.toThrow("confirmación");
    await expect(patchPartnerMenuAvailability({ ...args, restaurantId: "" })).rejects.toThrow("Selecciona");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
