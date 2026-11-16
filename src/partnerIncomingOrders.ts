import { isPendingKitchenOrder, type PartnerKitchenOrder } from "./partnerOrderSignal";

export type IncomingPartnerOrder = PartnerKitchenOrder & {
  status?: string;
  paymentState?: string;
  paymentMethod?: string;
  cashDueAtDelivery?: boolean;
};

/** Keep the kitchen queue payment-agnostic while rejecting unconfirmed pending online orders. */
export function isIncomingPartnerOrder(order: IncomingPartnerOrder): boolean {
  return isPendingKitchenOrder(order);
}

export function incomingPartnerOrders<T extends IncomingPartnerOrder>(orders: T[]): T[] {
  const seenIds = new Set<string>();
  return orders.filter((order) => {
    if (!isIncomingPartnerOrder(order) || seenIds.has(order._id)) return false;
    seenIds.add(order._id);
    return true;
  });
}
