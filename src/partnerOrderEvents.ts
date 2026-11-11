import type { PikiRealtimeEvent } from "./realtime";

/** The server remains authoritative for events without a restaurant ID. */
export function partnerEventMatchesLocation(event: PikiRealtimeEvent, locationId: string): boolean {
  if (!event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) return false;
  const restaurantId = event.payload.restaurantId;
  return typeof restaurantId !== "string" || !restaurantId || restaurantId === locationId;
}
