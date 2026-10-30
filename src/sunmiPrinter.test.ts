import { describe, expect, it } from "vitest";
import { escPosTicket } from "./sunmiPrinter";

describe("Sunmi ESC/POS ticket", () => {
  it("includes the public order id, items and modifiers", () => {
    const ticket = escPosTicket({
      _id: "order-1",
      publicCode: "PIKI-2048",
      createdAt: "2026-10-30T12:00:00.000Z",
      status: "accepted",
      customer: { name: "Ana" },
      items: [{ name: "Hamburguesa", quantity: 2, selectedOptions: [{ optionName: "Sin cebolla" }] }],
    } as any);
    expect(ticket).toContain("PEDIDO PIKI-2048");
    expect(ticket).toContain("2x Hamburguesa");
    expect(ticket).toContain("- Sin cebolla");
  });
});
