import { describe, expect, it } from "vitest";
import { incomingOnlinePartnerOrders, isIncomingOnlinePartnerOrder } from "./partnerIncomingOrders";

describe("Partner incoming online orders", () => {
  it.each([
    ["Stripe authorization", { status: "pending", paymentMethod: "stripe", paymentState: "authorized" }, true],
    ["paid Bizum", { status: "pending", paymentMethod: "bizum", paymentState: "paid" }, true],
    ["cash order", { status: "pending", paymentMethod: "cash", paymentState: "pending" }, false],
    ["unconfirmed Stripe", { status: "pending", paymentMethod: "stripe", paymentState: "pending" }, false],
    ["failed Stripe", { status: "pending", paymentMethod: "stripe", paymentState: "failed" }, false],
    ["already accepted Stripe", { status: "accepted", paymentMethod: "stripe", paymentState: "paid" }, false],
    ["unknown payment method", { status: "pending", paymentMethod: "other", paymentState: "paid" }, false],
  ])("classifies %s correctly", (_label, order, expected) => {
    expect(isIncomingOnlinePartnerOrder(order)).toBe(expected);
  });

  it("returns only confirmed online orders awaiting partner acceptance", () => {
    const pending = { _id: "online-1", status: "pending", paymentMethod: "stripe", paymentState: "authorized" };
    const cash = { _id: "cash-1", status: "pending", paymentMethod: "cash", paymentState: "pending" };
    const accepted = { _id: "online-2", status: "accepted", paymentMethod: "bizum", paymentState: "paid" };
    expect(incomingOnlinePartnerOrders([pending, cash, accepted])).toEqual([pending]);
  });
});
