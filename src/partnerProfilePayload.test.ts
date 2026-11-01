import { describe, expect, it } from "vitest";
import { editablePartnerProfilePayload } from "./partnerProfilePayload";

describe("payload de perfil Partner", () => {
  it("envía solo campos editables y excluye comisión y controles comerciales", () => {
    const payload = editablePartnerProfilePayload({
      name: "Eleven Burgers Xàtiva",
      email: "hola@elevenburgers.es",
      phone: "613238688",
      address: "C. Juglares, 1",
      locality: "Xàtiva",
      cuisine: "Hamburguesas",
      category: "Hamburguesas",
      commissionRateBps: 500,
      commissionPercent: 5,
      deliveryFeeCents: 299,
      promoted: true,
      availabilityStatus: "available",
    } as never);

    expect(payload).toEqual({
      name: "Eleven Burgers Xàtiva",
      email: "hola@elevenburgers.es",
      phone: "613238688",
      address: "C. Juglares, 1",
      locality: "Xàtiva",
      cuisine: "Hamburguesas",
      category: "Hamburguesas",
    });
    expect(payload).not.toHaveProperty("commissionRateBps");
    expect(payload).not.toHaveProperty("commissionPercent");
    expect(payload).not.toHaveProperty("deliveryFeeCents");
    expect(payload).not.toHaveProperty("promoted");
    expect(payload).not.toHaveProperty("availabilityStatus");
  });
});
