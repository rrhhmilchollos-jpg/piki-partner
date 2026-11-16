import { describe, expect, it } from "vitest";
import { incomingPartnerOrders, isIncomingPartnerOrder, type IncomingPartnerOrder } from "./partnerIncomingOrders";

const incomingCases: [string, IncomingPartnerOrder, boolean][] = [
  ["authorized online order", { _id: "online-authorized", status: "pending", paymentMethod: "stripe", paymentState: "authorized" }, true],
  ["paid online order", { _id: "online-paid", status: "pending", paymentMethod: "bizum", paymentState: "paid" }, true],
  ["cash collection order", { _id: "cash-due", status: "pending", paymentMethod: "cash", paymentState: "pending", cashDueAtDelivery: true }, true],
  ["unconfirmed online order", { _id: "online-pending", status: "pending", paymentMethod: "stripe", paymentState: "pending" }, false],
  ["failed online order", { _id: "online-failed", status: "pending", paymentMethod: "stripe", paymentState: "failed" }, false],
  ["already accepted order", { _id: "online-accepted", status: "accepted", paymentMethod: "stripe", paymentState: "paid" }, false],
];

describe("Partner incoming orders", () => {
  it.each(incomingCases)("classifies %s correctly", (_label, order, expected) => {
    expect(isIncomingPartnerOrder(order)).toBe(expected);
  });

  it("returns eligible kitchen orders awaiting partner acceptance without splitting payment methods", () => {
    const pending: IncomingPartnerOrder = { _id: "online-1", status: "pending", paymentMethod: "stripe", paymentState: "authorized" };
    const cash: IncomingPartnerOrder = { _id: "cash-1", status: "pending", paymentMethod: "cash", paymentState: "pending", cashDueAtDelivery: true };
    const accepted: IncomingPartnerOrder = { _id: "online-2", status: "accepted", paymentMethod: "bizum", paymentState: "paid" };
    expect(incomingPartnerOrders([pending, pending, cash, accepted])).toEqual([pending, cash]);
  });
});
