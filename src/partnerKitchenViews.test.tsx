import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PrintablePartnerTicket from "./PrintablePartnerTicket";
import SunmiPdaBoard from "./SunmiPdaBoard";
import OrdersBoard from "./OrdersBoard";
import type { PartnerOrder } from "./OrdersBoard";

const reception = vi.hoisted(() => ({ orders: [] as any[], load: vi.fn(), applyConfirmedOrder: vi.fn(), loading: false, now: Date.parse("2026-11-11T12:20:00Z"), realtimeState: { status: "connected", attempt: 0 }, activeCount: 0, audioReady: false }));
vi.mock("./PartnerKitchenReception", () => ({ usePartnerKitchenReception: () => reception }));
vi.mock("./PartnerOrderAlarm", () => ({ PartnerOrderAlarmBanner: () => null }));
vi.mock("./pwaUpdateRuntime", () => ({ usePwaUpdateBlocker: () => undefined }));
vi.mock("./partnerNativeNotifications", () => ({ isPartnerNativeAndroid: () => false }));

const order: PartnerOrder = { _id: "fixture-order", status: "pending", createdAt: "2026-11-11T12:00:00Z", deliveryNote: "Sin sal\nNo mezclar <salsa>", paymentState: "authorized", paymentMethod: "stripe", customer: { name: "Fixture", allergies: "Gluten" }, items: [{ name: "Plato", quantity: 1, selectedOptions: [{ optionName: "Sin cebolla" }] }] };
const base = { loading: false, message: "", busy: false, activeCount: 0, audioReady: false, realtimeState: { status: "connected" as const, attempt: 0 }, connectionLabel: "Fixture", preparationMinutes: 20, onPreparationMinutesChange: vi.fn(), onAccept: vi.fn(), onReady: vi.fn(), onPrint: vi.fn(), onEnableAudio: vi.fn() };
beforeEach(() => { reception.orders = [order]; });
describe("Partner note and action views", () => {
  it.each(["pending", "accepted", "preparing"])("web shows the note before actions in %s and keeps modifiers", (status) => {
    reception.orders = [{ ...order, status, partnerPrepDeadlineAt: "2026-11-11T12:45:00Z" }];
    const html = renderToStaticMarkup(<OrdersBoard token="fixture" locationId="local" canRead canAccept canPrepare canCancel onUnauthorized={() => undefined} />);
    expect(html).toContain("Sin sal\nNo mezclar &lt;salsa&gt;");
    expect(html.indexOf("NOTA DEL PEDIDO")).toBeLessThan(html.indexOf('class="order-card-actions"'));
    expect(html).toContain("Sin cebolla");
    if (status !== "pending") { expect(html).toContain("25:00"); expect(html).not.toContain("is-late"); }
  });
  it("PDA retains both profile allergy and deliveryNote before acceptance", () => {
    const html = renderToStaticMarkup(<SunmiPdaBoard {...base} order={order} canAccept canPrepare={false} />);
    expect(html).toContain("Gluten");
    expect(html).toContain("Sin sal\nNo mezclar &lt;salsa&gt;");
    expect(html.indexOf("Sin sal")).toBeLessThan(html.indexOf("ACEPTAR PEDIDO"));
  });
  it.each(["pending", "accepted", "preparing"])("PDA separates permissions in %s", (status) => {
    const html = renderToStaticMarkup(<SunmiPdaBoard {...base} order={{ ...order, status }} canAccept={status !== "pending"} canPrepare={status === "pending"} />);
    expect(html).toMatch(/class="sunmi-primary-action[^"]*" disabled=""/);
  });
  it("fallback thermal ticket retains note, escapes markup, and does not call authorized paid", () => {
    const html = renderToStaticMarkup(<PrintablePartnerTicket order={{ ...order, status: "accepted" }} />);
    expect(html).toContain("NOTA DEL PEDIDO");
    expect(html).toContain("Sin sal\nNo mezclar &lt;salsa&gt;");
    expect(html).toContain("Sin cebolla");
    expect(html).toContain("ONLINE · AUTORIZADO");
    expect(html).not.toContain("PAGADO ONLINE");
  });
  it("omits an empty note without inventing instructions", () => {
    const html = renderToStaticMarkup(<PrintablePartnerTicket order={{ ...order, deliveryNote: "   " }} />);
    expect(html).not.toContain("NOTA DEL PEDIDO");
  });
});
