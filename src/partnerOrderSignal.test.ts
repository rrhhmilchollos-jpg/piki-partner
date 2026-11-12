import { describe, expect, it } from "vitest";
import { createPartnerOrderSignals, isPendingKitchenOrder } from "./partnerOrderSignal";
import { partnerEventMatchesLocation } from "./partnerOrderEvents";

const paid = { _id: "fixture-order", publicCode: "FIX-123", status: "pending", paymentState: "paid" };
describe("Kitchen order signals", () => {
  it.each(["authorized", "paid"])("keeps %s pending alarms across initial REST, SSE replay and recovery REST", (paymentState) => {
    const snapshot = { ...paid, paymentMethod: "stripe" as const, paymentState };
    const rest = createPartnerOrderSignals();
    expect(rest.reconcile([snapshot])).toHaveLength(1);
    expect(rest.notify("new_order", snapshot._id)).toEqual([]);
    expect(rest.reconcile([snapshot])).toEqual([]);
    expect([...rest.pendingIds]).toEqual([snapshot._id]);
    const sse = createPartnerOrderSignals();
    expect(sse.notify("new_order", snapshot._id)).toHaveLength(1);
    expect(sse.reconcile([snapshot])).toEqual([]);
    expect([...sse.pendingIds]).toEqual([snapshot._id]);
    sse.resolve(snapshot._id);
    expect(sse.reconcile([snapshot])).toEqual([]);
    expect(sse.pendingIds.size).toBe(0);
  });
  it.each(["unpaid", "failed", "refunded", "cancelled", undefined])("does not keep a fake unpaid online alarm (%s)", (paymentState) => {
    const snapshot = { ...paid, paymentMethod: "stripe" as const, paymentState };
    const tracker = createPartnerOrderSignals();
    expect(tracker.reconcile([snapshot])).toEqual([]);
    tracker.notify("new_order", snapshot._id);
    expect(tracker.reconcile([snapshot])).toEqual([]);
    expect(tracker.pendingIds.size).toBe(0);
  });
  it("alerts a paid pending snapshot once", () => {
    const tracker = createPartnerOrderSignals();
    expect(tracker.reconcile([paid])).toEqual([{ kind: "new_order", orderId: paid._id, publicCode: paid.publicCode }]);
    expect(tracker.reconcile([paid])).toEqual([]);
    expect(tracker.pendingIds.size).toBe(1);
  });
  it("deduplicates SSE followed by REST", () => {
    const tracker = createPartnerOrderSignals();
    expect(tracker.notify("new_order", paid._id)).toHaveLength(1);
    expect(tracker.reconcile([paid])).toEqual([]);
  });
  it("deduplicates REST followed by SSE", () => {
    const tracker = createPartnerOrderSignals(); tracker.reconcile([paid]);
    expect(tracker.notify("new_order", paid._id)).toEqual([]);
  });
  it("ignores empty IDs", () => {
    const tracker = createPartnerOrderSignals();
    expect(tracker.notify("new_order", "")).toEqual([]);
    expect(tracker.notify("cancelled", "")).toEqual([]);
    expect(tracker.pendingIds.size).toBe(0);
  });
  it("accepts cash pending but not unpaid online orders", () => {
    expect(isPendingKitchenOrder({ ...paid, paymentState: "unpaid" })).toBe(false);
    expect(isPendingKitchenOrder({ ...paid, paymentState: "unpaid", paymentMethod: "cash" })).toBe(true);
    expect(isPendingKitchenOrder({ ...paid, paymentState: "unpaid", cashDueAtDelivery: true })).toBe(true);
    expect(isPendingKitchenOrder({ ...paid, status: "accepted" })).toBe(false);
  });
  it("stops pending signal immediately on cancellation and alerts cancellation once", () => {
    const tracker = createPartnerOrderSignals(); tracker.reconcile([paid]);
    expect(tracker.notify("cancelled", paid._id)).toHaveLength(1);
    expect(tracker.pendingIds.size).toBe(0);
    expect(tracker.reconcile([{ ...paid, status: "cancelled" }])).toEqual([]);
  });
  it("stale awaiting-acceptance replay cannot resurrect a cancellation", () => {
    const tracker = createPartnerOrderSignals(); tracker.notify("cancelled", paid._id);
    expect(tracker.notify("new_order", paid._id)).toEqual([]);
    expect(tracker.reconcile([paid])).toEqual([]);
    expect(tracker.pendingIds.size).toBe(0);
  });
  it("stale replay cannot reactivate an accepted order", () => {
    const tracker = createPartnerOrderSignals(); tracker.notify("new_order", paid._id); tracker.resolve(paid._id);
    expect(tracker.notify("new_order", paid._id)).toEqual([]);
    expect(tracker.reconcile([paid])).toEqual([]);
    expect(tracker.pendingIds.size).toBe(0);
  });
  it("REST cancellation is distinct from disappearance", () => {
    const tracker = createPartnerOrderSignals(); tracker.reconcile([paid]);
    expect(tracker.reconcile([{ ...paid, status: "cancelled" }])).toHaveLength(1);
    const other = createPartnerOrderSignals(); other.reconcile([paid]);
    expect(other.reconcile([])).toEqual([]);
  });
  it("does not sound historical cancelled snapshots", () => {
    expect(createPartnerOrderSignals().reconcile([{ ...paid, status: "cancelled" }])).toEqual([]);
  });
  it("alerts a REST cancellation of a known preparing order", () => {
    const tracker = createPartnerOrderSignals();
    expect(tracker.reconcile([{ ...paid, status: "preparing" }])).toEqual([]);
    expect(tracker.reconcile([{ ...paid, status: "cancelled" }])).toEqual([{ kind: "cancelled", orderId: paid._id, publicCode: paid.publicCode }]);
  });
  it("fresh restaurant instances do not inherit another local's dedupe state", () => {
    const one = createPartnerOrderSignals(); const two = createPartnerOrderSignals();
    one.notify("new_order", paid._id); one.notify("cancelled", paid._id);
    expect(two.notify("new_order", paid._id)).toHaveLength(1);
  });
  it("rejects explicitly different restaurant IDs and malformed payloads", () => {
    expect(partnerEventMatchesLocation({ type: "order.cancelled", payload: { restaurantId: "other" } }, "kazoku")).toBe(false);
    expect(partnerEventMatchesLocation({ type: "order.cancelled", payload: null as never }, "kazoku")).toBe(false);
  });
  it("accepts scoped server events and matching explicit IDs", () => {
    expect(partnerEventMatchesLocation({ type: "order.cancelled", payload: {} }, "kazoku")).toBe(true);
    expect(partnerEventMatchesLocation({ type: "order.cancelled", payload: { restaurantId: "kazoku" } }, "kazoku")).toBe(true);
  });
});
