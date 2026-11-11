import { useCallback, useEffect, useRef, useState } from "react";
import { createPartnerOrderSignals, type PartnerKitchenOrder, type PartnerOrderSignal } from "./partnerOrderSignal";
import { isPartnerNativeAndroid, partnerNativeNotifications, postPartnerNativeNotice } from "./partnerNativeNotifications";

export type { PartnerKitchenOrder } from "./partnerOrderSignal";
type WebkitWindow = typeof window & { webkitAudioContext?: typeof AudioContext };

// oxlint-disable-next-line react/only-export-components
export function usePartnerOrderAlarm(scope = "assigned") {
  const signals = useRef(createPartnerOrderSignals());
  const audioContext = useRef<AudioContext | null>(null);
  const [activeCount, setActiveCount] = useState(0);
  const [audioReady, setAudioReady] = useState(false);
  const native = isPartnerNativeAndroid();
  const updateCount = useCallback(() => setActiveCount(signals.current.pendingIds.size), []);

  const prepareAudio = useCallback(async (userInitiated = true) => {
    if (native) {
      // The operator owns native channel settings; never play media to bypass them.
      if (userInitiated) {
        try { await partnerNativeNotifications.openSettings({ category: "new_order" }); } catch { /* diagnostic control shows errors */ }
      }
      return false;
    }
    try {
      const AudioContextCtor = window.AudioContext || (window as WebkitWindow).webkitAudioContext;
      if (!AudioContextCtor || (!audioContext.current && !userInitiated)) return false;
      const context = audioContext.current ?? new AudioContextCtor();
      audioContext.current = context;
      if (context.state !== "running") await context.resume();
      setAudioReady(context.state === "running");
      return context.state === "running";
    } catch { return false; }
  }, [native]);

  const ringOnce = useCallback(async () => {
    if (native) return;
    const ready = await prepareAudio(false);
    const context = audioContext.current;
    if (!ready || !context) return;
    const now = context.currentTime;
    [0, 0.17].forEach((offset, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "square";
      oscillator.frequency.value = index === 0 ? 740 : 980;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.15, now + offset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.13);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(now + offset); oscillator.stop(now + offset + 0.14);
    });
    if ("vibrate" in navigator) navigator.vibrate([140, 70, 140]);
  }, [native, prepareAudio]);

  const deliver = useCallback((notices: PartnerOrderSignal[]) => {
    for (const notice of notices) {
      if (native) void postPartnerNativeNotice({ ...notice, scope });
      else void ringOnce();
    }
    updateCount();
  }, [native, ringOnce, scope, updateCount]);
  const reconcileKitchenOrders = useCallback((orders: PartnerKitchenOrder[]) => {
    const previous = [...signals.current.pendingIds];
    deliver(signals.current.reconcile(orders));
    if (native) for (const orderId of previous) {
      if (!signals.current.pendingIds.has(orderId) && !orders.some((order) => order._id === orderId && order.status === "cancelled")) {
        void partnerNativeNotifications.clearOrder({ orderId, scope }).catch(() => undefined);
      }
    }
  }, [deliver, native, scope]);
  const notifyPaidOrder = useCallback((orderId: string, publicCode?: string) => {
    deliver(signals.current.notify("new_order", orderId, publicCode));
  }, [deliver]);
  const notifyCancelledOrder = useCallback((orderId: string, publicCode?: string) => {
    deliver(signals.current.notify("cancelled", orderId, publicCode));
  }, [deliver]);
  const resolveOrder = useCallback((orderId: string) => {
    signals.current.resolve(orderId); updateCount();
    if (native) void partnerNativeNotifications.clearOrder({ orderId, scope }).catch(() => undefined);
  }, [native, scope, updateCount]);

  useEffect(() => {
    if (native) return;
    const unlock = () => { void prepareAudio(); };
    window.addEventListener("pointerdown", unlock, { once: true, passive: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [native, prepareAudio]);
  useEffect(() => {
    if (native) return;
    const timer = window.setInterval(() => {
      if (signals.current.pendingIds.size > 0) void ringOnce();
    }, 1_100);
    return () => window.clearInterval(timer);
  }, [native, ringOnce]);
  useEffect(() => () => {
    try { void audioContext.current?.close(); } catch { /* no-op */ }
  }, []);
  return { activeCount, audioReady, prepareAudio, reconcileKitchenOrders, notifyPaidOrder, notifyCancelledOrder, resolveOrder };
}

export function PartnerOrderAlarmBanner({ count, audioReady, onEnableAudio }: {
  count: number; audioReady: boolean; onEnableAudio: () => void;
}) {
  if (!count) return null;
  const native = isPartnerNativeAndroid();
  return <div className="status-pill" role="alert" aria-live="assertive">
    <strong>Pedidos pendientes:</strong> hay {count} pedido{count === 1 ? "" : "s"} nuevo{count === 1 ? "" : "s"} esperando aceptación. Si es a contrarreembolso, el Rider cobrará al cliente al entregar.
    {(native || !audioReady) && <button className="secondary-button" type="button" onClick={onEnableAudio} style={{ marginLeft: "10px" }}>{native ? "Revisar canal Android" : "Activar sonido"}</button>}
  </div>;
}
