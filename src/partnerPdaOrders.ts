import type { PartnerOrder } from "./OrdersBoard";

export type PartnerPdaOrderGroup = "pending" | "preparing" | "ready";
export type PartnerPdaOrderTab = { id: PartnerPdaOrderGroup; label: string; count: number };

const states: Record<PartnerPdaOrderGroup, readonly string[]> = {
  pending: ["pending"],
  preparing: ["accepted", "preparing"],
  ready: ["ready_for_pickup"],
};

export function ordersInPdaGroup(orders: readonly PartnerOrder[], group: PartnerPdaOrderGroup): PartnerOrder[] {
  return orders.filter((order) => states[group].includes(order.status));
}

export function pdaOrderTabs(orders: readonly PartnerOrder[], incomingOnly = false): PartnerPdaOrderTab[] {
  const groups: PartnerPdaOrderGroup[] = incomingOnly ? ["pending"] : ["pending", "preparing", "ready"];
  const labels: Record<PartnerPdaOrderGroup, string> = { pending: "Nuevos", preparing: "Preparación", ready: "Listos" };
  return groups.map((id) => ({ id, label: labels[id], count: ordersInPdaGroup(orders, id).length }));
}

export function initialPdaOrderGroup(orders: readonly PartnerOrder[]): PartnerPdaOrderGroup {
  return (["pending", "preparing", "ready"] as const).find((group) => ordersInPdaGroup(orders, group).length > 0) ?? "pending";
}

export function selectedPdaOrder(queue: readonly PartnerOrder[], selectedId: string): PartnerOrder | null {
  return queue.find((order) => order._id === selectedId) ?? queue[0] ?? null;
}
