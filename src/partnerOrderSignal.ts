export type PartnerKitchenOrder = {
  _id: string;
  publicCode?: string;
  status: string;
  paymentState?: string;
  paymentMethod?: "stripe" | "bizum" | "cash";
  cashDueAtDelivery?: boolean;
};
export type PartnerOrderSignal = { kind: "new_order" | "cancelled"; orderId: string; publicCode?: string };
export const isPendingKitchenOrder = (order: PartnerKitchenOrder) => order.status === "pending"
  && (order.paymentState === "authorized" || order.paymentState === "paid" || order.paymentMethod === "cash" || order.cashDueAtDelivery === true);

/** Instance-local state: remount when changing account/restaurant. Never infer cancellation from disappearance. */
export function createPartnerOrderSignals() {
  let pending = new Set<string>();
  const seenNew = new Set<string>();
  const seenCancelled = new Set<string>();
  const seenResolved = new Set<string>();
  const seenActive = new Set<string>();
  const remember = (set: Set<string>, id: string) => {
    set.add(id);
    if (set.size > 1000) set.delete(set.values().next().value!);
  };
  const signal = (kind: PartnerOrderSignal["kind"], orderId: string, publicCode?: string): PartnerOrderSignal[] => {
    if (!orderId) return [];
    if (kind === "cancelled") {
      pending.delete(orderId);
      if (seenCancelled.has(orderId)) return [];
      remember(seenCancelled, orderId);
      return [{ kind, orderId, publicCode }];
    }
    if (seenCancelled.has(orderId) || seenResolved.has(orderId)) return [];
    remember(seenActive, orderId);
    pending.add(orderId);
    if (seenNew.has(orderId)) return [];
    remember(seenNew, orderId);
    return [{ kind, orderId, publicCode }];
  };
  return {
    get pendingIds(): ReadonlySet<string> { return pending; },
    notify: signal,
    resolve(orderId: string) { pending.delete(orderId); remember(seenResolved, orderId); },
    reconcile(orders: PartnerKitchenOrder[]): PartnerOrderSignal[] {
      const signals: PartnerOrderSignal[] = [];
      const next = new Set<string>();
      for (const order of orders) {
        if (!order._id) continue;
        if (order.status === "cancelled") {
          // Do not sound historical cancellations on initial loading of a kitchen snapshot.
          if (seenActive.has(order._id)) signals.push(...signal("cancelled", order._id, order.publicCode));
          else remember(seenCancelled, order._id);
        } else if (isPendingKitchenOrder(order) && !seenCancelled.has(order._id) && !seenResolved.has(order._id)) {
          next.add(order._id);
          signals.push(...signal("new_order", order._id, order.publicCode));
        } else if (order.status !== "pending") {
          remember(seenResolved, order._id);
        }
        if (order.status !== "cancelled") remember(seenActive, order._id);
      }
      pending = next;
      return signals;
    },
  };
}
