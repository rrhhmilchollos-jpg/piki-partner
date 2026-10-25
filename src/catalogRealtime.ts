type CatalogRealtimeEvent = {
  type?: string;
  payload?: { restaurantId?: string; slug?: string; reason?: string };
};

export function connectCatalogRealtime(apiOrigin: string, onUpdate: () => void): () => void {
  if (typeof window === "undefined" || typeof window.EventSource === "undefined") return () => undefined;
  const source = new EventSource(`${apiOrigin.replace(/\/$/, "")}/api/v1/catalog/events`);
  const handle = (event: Event) => {
    const data = (event as MessageEvent<string>).data;
    if (typeof data !== "string") return;
    try {
      const message = JSON.parse(data) as CatalogRealtimeEvent;
      if (message.type === "catalog.updated") onUpdate();
    } catch {
      // Ignore malformed public events; the periodic fallback remains active.
    }
  };
  source.addEventListener("catalog.updated", handle);
  source.addEventListener("message", handle);
  return () => source.close();
}
