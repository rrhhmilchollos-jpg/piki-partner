import { useCallback, useEffect, useRef, useState } from "react";

export type PartnerKitchenOrder = {
  _id: string;
  status: string;
  paymentState?: string;
  paymentMethod?: "stripe" | "bizum" | "cash";
  cashDueAtDelivery?: boolean;
};

type WebkitWindow = typeof window & { webkitAudioContext?: typeof AudioContext };

/**
 * Keeps a local list of paid orders awaiting the restaurant's acceptance.
 * It deliberately does not depend on a server polling timer: KitchenScreen
 * feeds it from the SSE event and from the REST reconciliation response.
 */
// oxlint-disable-next-line react/only-export-components
export function usePartnerOrderAlarm() {
  const pendingOrderIds = useRef(new Set<string>());
  const audioContext = useRef<AudioContext | null>(null);
  const [activeCount, setActiveCount] = useState(0);
  const [audioReady, setAudioReady] = useState(false);

  const updateCount = useCallback(() => setActiveCount(pendingOrderIds.current.size), []);

  const prepareAudio = useCallback(async () => {
    try {
      const AudioContextCtor = window.AudioContext || (window as WebkitWindow).webkitAudioContext;
      if (!AudioContextCtor) return false;
      const context = audioContext.current ?? new AudioContextCtor();
      audioContext.current = context;
      if (context.state !== "running") await context.resume();
      setAudioReady(context.state === "running");
      return context.state === "running";
    } catch {
      return false;
    }
  }, []);

  const ringOnce = useCallback(async () => {
    const isReady = await prepareAudio();
    const context = audioContext.current;
    if (!isReady || !context) return;

    const now = context.currentTime;
    // A recognisable two-tone operational alarm, not an external audio file.
    [0, 0.17].forEach((offset, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "square";
      oscillator.frequency.value = index === 0 ? 740 : 980;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.15, now + offset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.13);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + 0.14);
    });
    if ("vibrate" in navigator) navigator.vibrate([140, 70, 140]);
  }, [prepareAudio]);

  const reconcileKitchenOrders = useCallback((orders: PartnerKitchenOrder[]) => {
    pendingOrderIds.current = new Set(
      orders
        .filter((order) => order.status === "pending" && (order.paymentState === "paid" || order.paymentMethod === "cash" || order.cashDueAtDelivery))
        .map((order) => order._id),
    );
    updateCount();
  }, [updateCount]);

  const notifyPaidOrder = useCallback((orderId: string) => {
    if (!orderId) return;
    pendingOrderIds.current.add(orderId);
    updateCount();
    void ringOnce();
  }, [ringOnce, updateCount]);

  const resolveOrder = useCallback((orderId: string) => {
    pendingOrderIds.current.delete(orderId);
    updateCount();
  }, [updateCount]);

  useEffect(() => {
    // Mobile browsers only allow Web Audio after one user gesture. Prepare it
    // transparently on the operator's first tap/click so incoming SSE events
    // are audible even if the kitchen was idle when the order arrived.
    const unlock = () => { void prepareAudio(); };
    window.addEventListener("pointerdown", unlock, { once: true, passive: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [prepareAudio]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (pendingOrderIds.current.size > 0) void ringOnce();
    }, 1_100);
    return () => window.clearInterval(timer);
  }, [ringOnce]);

  useEffect(() => () => {
    try { void audioContext.current?.close(); } catch { /* no-op */ }
  }, []);

  return { activeCount, audioReady, prepareAudio, reconcileKitchenOrders, notifyPaidOrder, resolveOrder };
}

export function PartnerOrderAlarmBanner({ count, audioReady, onEnableAudio }: {
  count: number;
  audioReady: boolean;
  onEnableAudio: () => void;
}) {
  if (!count) return null;
  return <div className="status-pill" role="alert" aria-live="assertive">
    <strong>Alarma activa:</strong> hay {count} pedido{count === 1 ? "" : "s"} nuevo{count === 1 ? "" : "s"} esperando aceptación. Si es efectivo, el Rider cobrará en la entrega.
    {!audioReady && <button className="secondary-button" type="button" onClick={onEnableAudio} style={{ marginLeft: "10px" }}>Activar sonido</button>}
  </div>;
}
