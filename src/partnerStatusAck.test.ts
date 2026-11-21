import { describe, expect, it } from "vitest";
import { isConfirmedPartnerStatusAck } from "./partnerStatusAck";

describe("Partner kitchen status acknowledgement", () => {
  it("accepts only an ACK matching both order id and requested status", () => {
    expect(isConfirmedPartnerStatusAck({ order: { _id: "order-1", status: "ready_for_pickup" } }, "order-1", "ready_for_pickup")).toBe(true);
  });

  it.each([
    null,
    {},
    { order: { _id: "other-order", status: "ready_for_pickup" } },
    { order: { _id: "order-1", status: "preparing" } },
    { order: { _id: "order-1" } },
  ])("rejects an absent or mismatched ACK: %j", (payload) => {
    expect(isConfirmedPartnerStatusAck(payload, "order-1", "ready_for_pickup")).toBe(false);
  });
});
