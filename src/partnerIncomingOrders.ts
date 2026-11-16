export type IncomingOnlinePartnerOrder = {
  status?: string;
  paymentState?: string;
  paymentMethod?: string;
};

const onlinePaymentMethods = new Set(["stripe", "bizum"]);
const confirmedPaymentStates = new Set(["authorized", "paid"]);

/** Only confirmed online orders that still need partner acceptance belong in this queue. */
export function isIncomingOnlinePartnerOrder(order: IncomingOnlinePartnerOrder): boolean {
  return order.status === "pending"
    && typeof order.paymentMethod === "string"
    && onlinePaymentMethods.has(order.paymentMethod)
    && typeof order.paymentState === "string"
    && confirmedPaymentStates.has(order.paymentState);
}

export function incomingOnlinePartnerOrders<T extends IncomingOnlinePartnerOrder>(orders: T[]): T[] {
  return orders.filter(isIncomingOnlinePartnerOrder);
}
