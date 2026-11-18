import { describe, expect, it } from "vitest";
import { isPartnerPdaMode } from "./partnerPdaMode";
import { initialPdaOrderGroup, ordersInPdaGroup, pdaOrderTabs, selectedPdaOrder } from "./partnerPdaOrders";
import type { PartnerOrder } from "./OrdersBoard";

const fixture = (_id: string, status: string): PartnerOrder => ({ _id, status, createdAt: "2026-11-18T00:00:00Z", items: [{ name: "Fixture", quantity: 1 }] });

describe("Partner PDA display channel", () => {
  it("activates the dedicated layout in a native Android APK on localhost", () => {
    expect(isPartnerPdaMode({ hostname: "localhost", nativeAndroid: true })).toBe(true);
  });
  it("does not change ordinary Partner PC or mobile browser rendering", () => {
    expect(isPartnerPdaMode({ hostname: "partners.pikidelivery.com", nativeAndroid: false })).toBe(false);
  });
  it.each(["partners-pda.pikidelivery.com", "partners-pda.fixture.invalid"])("preserves the dedicated PDA hostname %s", (hostname) => {
    expect(isPartnerPdaMode({ hostname, nativeAndroid: false })).toBe(true);
  });
  it("offers explicit browser verification without a redirect or new session", () => {
    expect(isPartnerPdaMode({ hostname: "partners.pikidelivery.com", search: "?pda=1", nativeAndroid: false })).toBe(true);
    expect(isPartnerPdaMode({ hostname: "partners.pikidelivery.com", search: "?pda=0", nativeAndroid: false })).toBe(false);
  });
  it("does not allow a browser query to disable native PDA mode", () => {
    expect(isPartnerPdaMode({ hostname: "localhost", search: "?pda=0", nativeAndroid: true })).toBe(true);
  });
});

describe("Partner PDA server-confirmed order groups", () => {
  const orders = [fixture("new", "pending"), fixture("accepted", "accepted"), fixture("cooking", "preparing"), fixture("ready", "ready_for_pickup"), fixture("picked", "picked_up"), fixture("delivered", "delivered")];
  it("separates new, cooking and ready orders without treating delivered as active", () => {
    expect(pdaOrderTabs(orders)).toEqual([{ id: "pending", label: "Nuevos", count: 1 }, { id: "preparing", label: "Preparación", count: 2 }, { id: "ready", label: "Listos", count: 1 }]);
  });
  it("retains both accepted and preparing in the preparation group", () => {
    expect(ordersInPdaGroup(orders, "preparing").map((order) => order._id)).toEqual(["accepted", "cooking"]);
  });
  it("prioritizes incoming then preparation then ready at first open", () => {
    expect(initialPdaOrderGroup(orders)).toBe("pending");
    expect(initialPdaOrderGroup(orders.slice(1))).toBe("preparing");
    expect(initialPdaOrderGroup([fixture("ready", "ready_for_pickup")])).toBe("ready");
    expect(initialPdaOrderGroup([])).toBe("pending");
  });
  it("can select another confirmed order instead of permanently showing only the first", () => {
    expect(selectedPdaOrder(ordersInPdaGroup(orders, "preparing"), "cooking")?._id).toBe("cooking");
  });
  it("safely falls back when the selected order leaves the group or the queue is empty", () => {
    expect(selectedPdaOrder([fixture("other", "accepted")], "removed")?._id).toBe("other");
    expect(selectedPdaOrder([], "removed")).toBeNull();
  });
  it("does not make the incoming-only navigation show accepted or ready orders", () => {
    expect(pdaOrderTabs(orders, true)).toEqual([{ id: "pending", label: "Nuevos", count: 1 }]);
  });
});
