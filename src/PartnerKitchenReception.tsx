import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PartnerOrder } from "./OrdersBoard";
import { apiOrigin, partnerHeaders } from "./partnerApi";
import { usePartnerOrderAlarm } from "./PartnerOrderAlarm";
import { connectPikiRealtime, type PikiRealtimeConnectionState } from "./realtime";
import { createPartnerVisibilityPolling, isPartnerDocumentVisible } from "./partnerVisibilityPolling";
import { partnerEventMatchesLocation } from "./partnerOrderEvents";

const ReceptionContext = createContext<({
  orders: PartnerOrder[];
  loading: boolean;
  receptionMessage: string;
  realtimeState: PikiRealtimeConnectionState;
  now: number;
  load: () => Promise<void>;
  applyConfirmedOrder: (order: PartnerOrder) => void;
} & ReturnType<typeof usePartnerOrderAlarm>) | null>(null);

/* oxlint-disable react/set-state-in-effect -- reconciles authenticated kitchen events. */
export function PartnerKitchenReceptionProvider({ token, locationId, canRead, onUnauthorized, children }: {
  token: string; locationId: string; canRead: boolean; onUnauthorized: () => void; children: ReactNode;
}) {
  const alarm = usePartnerOrderAlarm(locationId);
  const { reconcileKitchenOrders, notifyPaidOrder, notifyCancelledOrder, resolveOrder } = alarm;
  const [orders, setOrders] = useState<PartnerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [receptionMessage, setReceptionMessage] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [realtimeState, setRealtimeState] = useState<PikiRealtimeConnectionState>({ status: "connecting", attempt: 0 });
  const requestRef = useRef<AbortController | null>(null);
  const disposed = useRef(false);
  const refreshQueued = useRef(false);
  const eventVersion = useRef(0);
  const refreshAfterFlight = useRef<() => void>(() => undefined);
  const headers = useMemo(() => partnerHeaders(token, locationId), [token, locationId]);
  const load = useCallback(async (): Promise<void> => {
    if (!canRead || disposed.current) { setLoading(false); return; }
    if (requestRef.current && !requestRef.current.signal.aborted) { refreshQueued.current = true; return; }
    refreshQueued.current = false;
    const version = eventVersion.current;
    const request = new AbortController();
    requestRef.current = request;
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; request.abort(); }, 12_000);
    try {
      const response = await fetch(`${apiOrigin}/api/v1/partners/kitchen/orders`, { headers, cache: "no-store", signal: request.signal });
      if (request.signal.aborted || disposed.current) return;
      if (response.status === 401 || response.status === 428) { onUnauthorized(); return; }
      if (response.status === 403) {
        setOrders([]); reconcileKitchenOrders([]);
        setReceptionMessage("No tienes permiso para consultar pedidos de este local."); return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json() as { orders?: PartnerOrder[] };
      if (request.signal.aborted || disposed.current) return;
      if (version !== eventVersion.current) { refreshQueued.current = true; return; }
      if (!Array.isArray(payload.orders)) throw new Error("Respuesta de cocina no válida");
      const next = payload.orders.filter((order) => order && typeof order._id === "string" && typeof order.status === "string");
      setOrders(next); reconcileKitchenOrders(next); setReceptionMessage("");
    } catch {
      if ((!request.signal.aborted || timedOut) && !disposed.current) setReceptionMessage("Sin conexión con PIKI. Conservamos la última lista mientras vuelve la señal.");
    } finally {
      window.clearTimeout(timeout);
      if ((!request.signal.aborted || timedOut) && !disposed.current) setLoading(false);
      if (requestRef.current === request) requestRef.current = null;
      if (!disposed.current && (!request.signal.aborted || timedOut) && refreshQueued.current) queueMicrotask(() => refreshAfterFlight.current());
    }
  }, [canRead, headers, onUnauthorized, reconcileKitchenOrders]);
  useEffect(() => { refreshAfterFlight.current = () => { void load(); }; }, [load]);
  useEffect(() => {
    disposed.current = false;
    return () => { disposed.current = true; requestRef.current?.abort(); };
  }, []);
  useEffect(() => {
    if (!canRead) { setLoading(false); return; }
    return createPartnerVisibilityPolling({ source: document, scheduler: window,
      onRefresh: () => { void load(); }, onTick: () => setNow(Date.now()),
    });
  }, [canRead, load]);
  useEffect(() => {
    if (!canRead) return;
    return connectPikiRealtime({ apiOrigin, token, locationId, surface: "partner", onUnauthorized,
      onState: (state) => {
        setRealtimeState(state);
        // REST is the recovery path even when an SSE replay has no new event.
        if (state.status === "connected") void load();
      },
      onEvent: (event) => {
        if (!event.type.startsWith("order.") || !partnerEventMatchesLocation(event, locationId)) return;
        eventVersion.current += 1;
        const orderId = typeof event.payload.orderId === "string" ? event.payload.orderId : "";
        const publicCode = typeof event.payload.publicCode === "string" ? event.payload.publicCode : undefined;
        if (event.type === "order.cancelled" || event.payload.status === "cancelled") {
          notifyCancelledOrder(orderId, publicCode);
          setReceptionMessage("Pedido cancelado. Revisa la cocina y no continúes su preparación.");
        } else if (event.type === "order.awaiting_partner_acceptance") {
          notifyPaidOrder(orderId, publicCode);
          setReceptionMessage("Nuevo pedido recibido; revisa y acepta la comanda.");
        } else if (orderId && typeof event.payload.status === "string" && event.payload.status !== "pending") {
          resolveOrder(orderId);
        }
        if (isPartnerDocumentVisible(document)) void load();
      },
    });
  }, [canRead, load, locationId, notifyCancelledOrder, notifyPaidOrder, onUnauthorized, resolveOrder, token]);
  const applyConfirmedOrder = useCallback((order: PartnerOrder) => {
    eventVersion.current += 1;
    setOrders((current) => current.map((existing) => existing._id === order._id ? { ...existing, ...order } : existing));
  }, []);
  return <ReceptionContext.Provider value={{ ...alarm, orders, loading, receptionMessage, realtimeState, now, load, applyConfirmedOrder }}>{children}</ReceptionContext.Provider>;
}

// oxlint-disable-next-line react/only-export-components
export function usePartnerKitchenReception() {
  const context = useContext(ReceptionContext);
  if (!context) throw new Error("La cocina requiere una sesión Partner y un restaurante asignado.");
  return context;
}
