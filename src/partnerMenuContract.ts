export type MenuResponse<T> = {
  menu?: T[];
  menuRevision?: number;
  restaurant?: { menuRevision?: number; internalDemo?: boolean };
};

export type MenuSnapshot<T> = { items: T[]; menuRevision: number };

function validRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

/** Never attach a new revision to items from an older snapshot. */
export function readMenuSnapshot<T>(body: MenuResponse<T>): MenuSnapshot<T> {
  const revision = body.menuRevision ?? body.restaurant?.menuRevision;
  if (!Array.isArray(body.menu) || !validRevision(revision)
      || (body.restaurant?.menuRevision !== undefined && body.restaurant.menuRevision !== revision)) {
    throw new Error("La API no devolvió una carta con revisión coherente. Actualiza antes de guardar.");
  }
  return { items: body.menu, menuRevision: revision };
}

export function menuWriteBody<T>(snapshot: MenuSnapshot<T>, items: T[]) {
  if (!validRevision(snapshot.menuRevision)) throw new Error("Actualiza la carta antes de guardar.");
  return { items, expectedMenuRevision: snapshot.menuRevision };
}

export class PartnerMenuRequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function patchPartnerMenuAvailability({ apiOrigin, headers, restaurantId, itemId, available, signal, isCurrent }: {
  apiOrigin: string; headers: Record<string, string>; restaurantId: string; itemId: string; available: boolean;
  signal?: AbortSignal; isCurrent?: () => boolean;
}): Promise<{ itemId: string; available: boolean; menuRevision: number }> {
  const checkCurrent = () => {
    if (signal?.aborted || (isCurrent && !isCurrent())) throw new DOMException("Operación de carta invalidada", "AbortError");
  };
  checkCurrent();
  if (!restaurantId || !itemId) throw new Error("Selecciona un local y un producto antes de modificar disponibilidad.");
  const response = await fetch(`${apiOrigin}/api/v1/restaurants/${encodeURIComponent(restaurantId)}/menu/items/${encodeURIComponent(itemId)}/availability`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ available }),
    signal,
  });
  checkCurrent();
  const body = await response.json().catch(() => ({})) as {
    updated?: boolean; restaurantId?: string; itemId?: string; available?: boolean; menuRevision?: number; error?: string;
  };
  checkCurrent();
  if (!response.ok) throw new PartnerMenuRequestError(response.status, body.error || `HTTP ${response.status}`);
  if (body.updated !== true || body.restaurantId !== restaurantId || body.itemId !== itemId
      || typeof body.available !== "boolean" || !validRevision(body.menuRevision)) {
    throw new Error("Disponibilidad sin confirmación válida. Actualiza la carta antes de guardar.");
  }
  return { itemId: body.itemId, available: body.available, menuRevision: body.menuRevision };
}
