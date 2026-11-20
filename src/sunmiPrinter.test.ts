import { describe, expect, it } from "vitest";
import { escPosTicket } from "./sunmiPrinter";

describe("Sunmi ESC/POS ticket", () => {
  it("keeps explicit order notes in the native ticket", () => {
    const ticket = escPosTicket({ _id: "fixture", createdAt: "2026-11-11T12:00:00Z", status: "accepted", deliveryNote: "Sin sal\nSalsa aparte" });
    expect(ticket).toContain("NOTAS: Sin sal\nSalsa aparte");
  });
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
  it("adds customer name, full address and phone to target-store thermal tickets", () => {
    const ticket = escPosTicket({
      _id: "fixture-order",
      createdAt: "2026-11-20T12:00:00Z",
      status: "accepted",
      printCustomerContactEnabled: true,
      customer: { name: "Lucía García López", phone: "+34 600 000 000" },
      deliveryAddress: "Carrer de Prova, 12, 2.º A, 46800 Xàtiva, València",
    } as any);
    expect(ticket).toContain("NOMBRE Y APELLIDO: Lucía García López");
    expect(ticket).toContain("DIRECCIÓN COMPLETA: Carrer de Prova, 12, 2.º A, 46800 Xàtiva, València");
    expect(ticket).toContain("TELÉFONO DE CONTACTO: +34 600 000 000");
  });
  it("shows the explicit fallback for missing customer contact details", () => {
    const ticket = escPosTicket({
      _id: "fixture-order",
      createdAt: "2026-11-20T12:00:00Z",
      status: "accepted",
      printCustomerContactEnabled: true,
      customer: null,
      deliveryAddress: " ",
    } as any);
    expect(ticket.match(/No facilitado\/a/g)).toHaveLength(3);
  });
});
