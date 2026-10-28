export type PartnerVisibilitySource = {
  visibilityState: "visible" | "hidden" | "prerender";
  addEventListener: (type: "visibilitychange", listener: EventListener) => void;
  removeEventListener: (type: "visibilitychange", listener: EventListener) => void;
};

export type PartnerIntervalScheduler = {
  setInterval: (callback: () => void, milliseconds: number) => number;
  clearInterval: (intervalId: number) => void;
};

export function isPartnerDocumentVisible(source: Pick<PartnerVisibilitySource, "visibilityState">): boolean {
  return source.visibilityState === "visible";
}

/**
 * Runs the REST reconciliation and countdown only while the operational screen
 * is visible. The realtime stream remains independent so order notifications
 * and kitchen alarms can continue to arrive while this scheduler is paused.
 */
export function createPartnerVisibilityPolling({
  source,
  scheduler,
  onRefresh,
  onTick,
  pollIntervalMs = 30_000,
  tickIntervalMs = 1_000,
}: {
  source: PartnerVisibilitySource;
  scheduler: PartnerIntervalScheduler;
  onRefresh: () => void;
  onTick: () => void;
  pollIntervalMs?: number;
  tickIntervalMs?: number;
}): () => void {
  let pollIntervalId: number | null = null;
  let tickIntervalId: number | null = null;
  let disposed = false;

  const stop = () => {
    if (pollIntervalId !== null) {
      scheduler.clearInterval(pollIntervalId);
      pollIntervalId = null;
    }
    if (tickIntervalId !== null) {
      scheduler.clearInterval(tickIntervalId);
      tickIntervalId = null;
    }
  };

  const refreshIfVisible = () => {
    if (isPartnerDocumentVisible(source)) onRefresh();
  };

  const tickIfVisible = () => {
    if (isPartnerDocumentVisible(source)) onTick();
  };

  const start = () => {
    if (disposed || !isPartnerDocumentVisible(source) || pollIntervalId !== null || tickIntervalId !== null) return;
    onTick();
    onRefresh();
    pollIntervalId = scheduler.setInterval(refreshIfVisible, pollIntervalMs);
    tickIntervalId = scheduler.setInterval(tickIfVisible, tickIntervalMs);
  };

  const onVisibilityChange: EventListener = () => {
    if (isPartnerDocumentVisible(source)) start();
    else stop();
  };

  source.addEventListener("visibilitychange", onVisibilityChange);
  start();

  return () => {
    disposed = true;
    stop();
    source.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
