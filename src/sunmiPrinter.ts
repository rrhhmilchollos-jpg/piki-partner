import type { PartnerOrder } from "./OrdersBoard";
import { Capacitor, registerPlugin } from "@capacitor/core";

type SunmiPrintBridge = {
  printEscPos?: (payload: { text: string; orderId: string; qrCode?: string; afterQrText?: string }) => Promise<void> | void;
  printText?: (payload: { text: string; orderId: string; qrCode?: string; afterQrText?: string }) => Promise<void> | void;
  print?: (payload: { text: string; orderId: string; qrCode?: string; afterQrText?: string }) => Promise<void> | void;
  startNotificationService?: () => Promise<void> | void;
  notifyOrder?: (payload: { title: string; body: string; orderId: string }) => Promise<void> | void;
};

const nativeSunmiPrinter = registerPlugin<SunmiPrintBridge>("SunmiPrinter");

if (typeof window !== "undefined" && Capacitor.isNativePlatform()) {
  window.SunmiPrinter = nativeSunmiPrinter;
}

declare global {
  interface Window {
    /** Optional bridge exposed by the native Sunmi/Capacitor shell. */
    PikiSunmiPrinter?: SunmiPrintBridge;
    /** Public JS bridge requested by the PIKI Android shell. */
    SunmiPrinter?: SunmiPrintBridge;
  }
}

function formatTicketDate(value?: string) {
  return value ? new Date(value).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }) : "—";
}

function paymentLabel(order: PartnerOrder) {
  if (order.cashDueAtDelivery || order.paymentMethod === "cash") return "CONTRARREEMBOLSO";
  if (order.paymentState === "paid" || order.paymentState === "authorized") return "PREPAGO";
  return "PAGO ONLINE";
}

function ticketParts(order: PartnerOrder) {
  const beforeQr = [
    "PIKI PARTNER ORDERS",
    `PEDIDO ${order.publicCode || order._id}`,
    order.restaurantName || "PIKI Partner",
    formatTicketDate(order.createdAt),
    order._id,
    "------------------------------",
    ...(order.pickupQrUrl ? ["RIDER PICKUP CODE"] : []),
  ];
  const afterQr = [
    ...(order.pickupPin ? [`PIN: ${order.pickupPin}`] : []),
    ...(order.pickupQrUrl || order.pickupPin ? ["------------------------------"] : []),
    `CLIENTE: ${order.customer?.name || "Cliente PIKI"}`,
    paymentLabel(order),
    ...(order.estimatedReadyAt ? [`LISTO ESTIMADO: ${formatTicketDate(order.estimatedReadyAt)}`] : []),
    `${(order.items || []).reduce((sum, item) => sum + (item.quantity || 1), 0)} ARTÍCULOS`,
    "------------------------------",
    ...(order.items || []).flatMap((item) => [
      `${item.quantity || 1}x ${item.name || "Producto"}${typeof item.unitPriceCents === "number" ? `  ${((item.unitPriceCents * (item.quantity || 1)) / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}` : ""}`,
      ...(item.selectedOptions || []).map((option) => `  - ${option.optionName || "Modificador"}`),
    ]),
    "------------------------------",
    `SUBTOTAL: ${((order.totalCents ?? 0) / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}`,
    `TOTAL: ${((order.totalCents ?? 0) / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}`,
    ...(order.deliveryNote ? [`NOTAS: ${order.deliveryNote}`] : []),
    "------------------------------",
    "PREPARAR Y ENTREGAR A RIDER",
    "Gracias por colaborar con PIKI",
    "\n\n",
  ];
  return { beforeQrText: beforeQr.join("\n"), afterQrText: afterQr.join("\n") };
}

function escPosTicket(order: PartnerOrder): string {
  const parts = ticketParts(order);
  return [parts.beforeQrText, order.pickupQrUrl ? "[QR DE RECOGIDA]" : "", parts.afterQrText].filter(Boolean).join("\n");
}

/**
 * Prints through the native Sunmi bridge when the PDA shell exposes it.
 * The Android implementation should bind to Sunmi's built-in ESC/POS service
 * (or a Bluetooth/Serial printer driver for a compatible clone) and expose
 * `window.PikiSunmiPrinter.printEscPos({ text, orderId })` through Capacitor.
 * Returning false keeps browser/PWA deployments on the 58 mm window.print path.
 */
export async function printOrderToSunmi(order: PartnerOrder): Promise<boolean> {
  const bridge = typeof window !== "undefined" ? (window.SunmiPrinter || window.PikiSunmiPrinter) : undefined;
  const print = bridge?.print || bridge?.printEscPos || bridge?.printText || nativeSunmiPrinter.print;
  if (!print) return false;
  const parts = ticketParts(order);
  await print({ text: parts.beforeQrText, qrCode: order.pickupQrUrl || undefined, afterQrText: parts.afterQrText, orderId: order._id });
  return true;
}

/** Sends a high-priority native Android alert when running in the SUNMI APK. */
export async function notifyPartnerOrder(order: PartnerOrder): Promise<boolean> {
  const bridge = typeof window !== "undefined" ? (window.SunmiPrinter || window.PikiSunmiPrinter) : undefined;
  if (!Capacitor.isNativePlatform() || !bridge?.notifyOrder) return false;
  await bridge.notifyOrder({
    title: "Nuevo pedido PIKI",
    body: `Pedido ${order.publicCode || order._id} pendiente de aceptación`,
    orderId: order._id,
  });
  return true;
}

export { escPosTicket };
