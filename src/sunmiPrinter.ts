import type { PartnerOrder } from "./OrdersBoard";

type SunmiPrintBridge = {
  printEscPos?: (payload: { text: string; orderId: string }) => Promise<void> | void;
  printText?: (payload: { text: string; orderId: string }) => Promise<void> | void;
};

declare global {
  interface Window {
    /** Optional bridge exposed by the native Sunmi/Capacitor shell. */
    PikiSunmiPrinter?: SunmiPrintBridge;
  }
}

function escPosTicket(order: PartnerOrder): string {
  const lines = [
    "PIKI PARTNER ORDERS",
    `PEDIDO ${order.publicCode || order._id}`,
    order.customer?.name || "Cliente PIKI",
    new Date(order.createdAt).toLocaleString("es-ES"),
    "------------------------------",
    ...(order.items || []).flatMap((item) => [
      `${item.quantity || 1}x ${item.name || "Producto"}`,
      ...(item.selectedOptions || []).map((option) => `  - ${option.optionName || "Modificador"}`),
    ]),
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
  const bridge = typeof window !== "undefined" ? window.PikiSunmiPrinter : undefined;
  const print = bridge?.printEscPos || bridge?.printText;
  if (!print) return false;
  await print({ text: escPosTicket(order), orderId: order._id });
  return true;
}

export { escPosTicket };
