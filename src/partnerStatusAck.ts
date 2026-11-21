/** A successful HTTP status alone does not prove the requested order transition. */
export function isConfirmedPartnerStatusAck(payload: unknown, expectedId: string, expectedStatus: string): boolean {
  if (!payload || typeof payload !== "object") return false;
  const order = (payload as { order?: unknown }).order;
  if (!order || typeof order !== "object") return false;
  const ack = order as { _id?: unknown; status?: unknown };
  return ack._id === expectedId && ack.status === expectedStatus;
}
