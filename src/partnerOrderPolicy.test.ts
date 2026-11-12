import { describe, expect, it } from "vitest";
import { canTransitionPartnerOrder, partnerOrderCountdown, partnerOrderDeadline } from "./partnerOrderPolicy";

const order = { status: "accepted", createdAt: "2026-11-11T12:00:00Z", acceptanceDeadline: "2026-11-11T12:12:00Z", partnerPrepDeadlineAt: "2026-11-11T12:45:00Z", preparationDeadline: "2026-11-11T12:25:00Z" };
describe("Partner action permissions", () => {
  it.each([
    [{ canAccept: true, canPrepare: false, canCancel: false }, [true, false, false, false]],
    [{ canAccept: false, canPrepare: true, canCancel: false }, [false, true, true, false]],
    [{ canAccept: false, canPrepare: false, canCancel: true }, [false, false, false, true]],
    [{ canAccept: false, canPrepare: false, canCancel: false }, [false, false, false, false]],
  ])("maps each transition without permission aliases", (permissions, expected) => {
    expect(["accepted", "preparing", "ready_for_pickup", "cancelled"].map((status) => canTransitionPartnerOrder(status, permissions))).toEqual(expected);
    expect(canTransitionPartnerOrder("on_the_way", permissions)).toBe(false);
  });
});
describe("Partner confirmed deadlines", () => {
  it.each(["accepted", "preparing"])("prioritizes partnerPrepDeadlineAt in %s", (status) => {
    expect(partnerOrderDeadline({ ...order, status })).toEqual({ at: Date.parse(order.partnerPrepDeadlineAt), confirmed: true });
    expect(partnerOrderCountdown({ ...order, status }, Date.parse("2026-11-11T12:20:00Z"))).toBe("25:00");
  });
  it("only uses acceptance deadline while pending", () => {
    expect(partnerOrderDeadline({ ...order, status: "pending" }).at).toBe(Date.parse(order.acceptanceDeadline));
  });
  it("uses explicit legacy preparation dates but skips invalid candidates", () => {
    expect(partnerOrderDeadline({ ...order, partnerPrepDeadlineAt: "invalid" }).at).toBe(Date.parse(order.preparationDeadline));
    expect(partnerOrderDeadline({ ...order, partnerPrepDeadlineAt: "invalid" }).confirmed).toBe(false);
    expect(partnerOrderCountdown({ ...order, partnerPrepDeadlineAt: null }, Date.parse("2026-11-11T12:20:00Z"))).toBe("Estimado · 05:00");
  });
  it("does not invent a confirmed preparation clock when absent", () => {
    const missing = { status: "preparing", createdAt: order.createdAt };
    expect(partnerOrderDeadline(missing)).toEqual({ at: null, confirmed: false });
    expect(partnerOrderCountdown(missing, Date.parse(order.createdAt))).toBe("Plazo no confirmado");
  });
  it("labels the pending fallback as an estimate", () => {
    expect(partnerOrderCountdown({ status: "pending", createdAt: order.createdAt }, Date.parse(order.createdAt))).toBe("Estimado · 12:00");
  });
  it("handles invalid dates and avoids a late kitchen clock after readiness", () => {
    expect(partnerOrderDeadline({ status: "pending", createdAt: "bad" }).at).toBeNull();
    expect(partnerOrderDeadline({ ...order, status: "ready_for_pickup" }).at).toBeNull();
  });
});
