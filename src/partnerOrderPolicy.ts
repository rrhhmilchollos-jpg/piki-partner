export type PartnerOrderPermissions = { canAccept: boolean; canPrepare: boolean; canCancel: boolean };

export function canTransitionPartnerOrder(status: string, permissions: PartnerOrderPermissions): boolean {
  if (status === "accepted") return permissions.canAccept;
  if (status === "preparing" || status === "ready_for_pickup") return permissions.canPrepare;
  if (status === "cancelled") return permissions.canCancel;
  return false;
}

type DeadlineOrder = {
  status: string; createdAt: string; acceptanceDeadline?: string;
  partnerPrepDeadlineAt?: string | null; preparationDeadline?: string; estimatedReadyAt?: string;
};
export function partnerOrderDeadline(order: DeadlineOrder): { at: number | null; confirmed: boolean } {
  const preparing = order.status === "accepted" || order.status === "preparing";
  if (order.status !== "pending" && !preparing) return { at: null, confirmed: false };
  const candidates = preparing
    ? [order.partnerPrepDeadlineAt, order.preparationDeadline, order.estimatedReadyAt]
    : [order.acceptanceDeadline];
  for (const [index, value] of candidates.entries()) {
    const at = value ? new Date(value).getTime() : Number.NaN;
    if (Number.isFinite(at)) return { at, confirmed: !preparing || index === 0 };
  }
  // No confirmed preparation clock: do not invent a deadline from creation time.
  if (preparing) return { at: null, confirmed: false };
  const created = new Date(order.createdAt).getTime();
  return { at: Number.isFinite(created) ? created + 12 * 60_000 : null, confirmed: false };
}

export function partnerOrderCountdown(order: DeadlineOrder, now: number): string {
  const deadline = partnerOrderDeadline(order);
  if (deadline.at === null) return "Plazo no confirmado";
  const seconds = Math.max(0, Math.floor((deadline.at - now) / 1_000));
  const clock = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return deadline.confirmed ? clock : `Estimado · ${clock}`;
}
