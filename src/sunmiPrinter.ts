import type { PartnerOrder } from "./OrdersBoard";
import { Capacitor, registerPlugin } from "@capacitor/core";

type SunmiPrintBridge = {
  printEscPos?: (payload: { text: string; orderId: string }) => Promise<void> | void;
  printText?: (payload: { text: string; orderId: string }) => Promise<void> | void;
  print?: (payload: { text: string; orderId: string }) => Promise<void> | void;
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

function escPosTicket(order: PartnerOrder): string {
  const lines = [
    "PIKI PARTNER ORDERS",
    `PEDIDO ${order.publicCode || order._id}`,
    `RESTAURANTE: ${order.restaurantName || "PIKI Partner"}`,
    order.customer?.name || "Cliente PIKI",
    new Date(order.createdAt).toLocaleString("es-ES"),
    "------------------------------",
    ...(order.items || []).flatMap((item) => [
      `${item.quantity || 1}x ${item.name || "Producto"}`,
      ...(typeof item.unitPriceCents === "number" ? [`  ${((item.unitPriceCents * (item.quantity || 1)) / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}`] : []),
      ...(item.selectedOptions || []).map((option) => `  - ${option.optionName || "Modificador"}`),
    ]),
    "------------------------------",
    `NOTAS: ${order.deliveryNote || "Sin notas"}`,
    `DIRECCIÓN: ${order.deliveryAddress || "No indicada"}`,
    `TOTAL: ${((order.totalCents ?? 0) / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}`,
    "------------------------------",
    "PREPARAR Y ENTREGAR A RIDER",
    "Gracias por colaborar con PIKI",
    "\n\n",
  ];
  return lines.join("\n");
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
  await print({ text: escPosTicket(order), orderId: order._id });
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
