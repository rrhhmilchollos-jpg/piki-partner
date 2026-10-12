export type PikiRealtimeEvent = { id?: string; type: string; payload: Record<string, unknown>; occurredAt?: string };

export type PikiRealtimeConnectionState = {
  status: "connecting" | "connected" | "reconnecting" | "offline";
  /** Consecutive failed/disconnected streams. Zero means the stream is healthy. */
  attempt: number;
  /** Present while a reconnect is scheduled, so the operator can see the backoff. */
  retryInMs?: number;
  retryAt?: number;
};

const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 30_000;

/**
 * Bounded exponential retry avoids a tight reconnect loop when the API or the
 * tablet network is unavailable. Kept deterministic so it is testable and the
 * delay shown to the operator is the delay actually used.
 */
export function getPikiRealtimeReconnectDelay(attempt: number): number {
  const normalizedAttempt = Number.isFinite(attempt) ? Math.max(1, Math.floor(attempt)) : 1;
  return Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_BASE_DELAY_MS * (2 ** Math.min(normalizedAttempt - 1, 5)));
}

function readLastEventId(storageKey: string): string {
  try { return sessionStorage.getItem(storageKey) || ""; } catch { return ""; }
}

function saveLastEventId(storageKey: string, eventId: string): void {
  try { sessionStorage.setItem(storageKey, eventId); } catch { /* SSE still works when storage is unavailable. */ }
}

function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine;
}

function waitForRetry(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) { resolve(); return; }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener("online", finish);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = window.setTimeout(finish, milliseconds);
    // If a tablet regains a network before its next scheduled retry, reconnect
    // immediately rather than making staff wait for the full backoff window.
    window.addEventListener("online", finish, { once: true });
    signal.addEventListener("abort", finish, { once: true });
  });
}

function fieldValue(lines: string[], field: string): string | undefined {
  const prefix = `${field}:`;
  const line = lines.find((item) => item.startsWith(prefix));
  return line?.slice(prefix.length).trimStart();
}

export function connectPikiRealtime(input: {
  apiOrigin: string;
  token: string;
  locationId?: string;
  surface: "partner" | "fleet" | "admin" | "rider";
  onEvent: (event: PikiRealtimeEvent) => void;
  onState?: (state: PikiRealtimeConnectionState) => void;
}) {
  const controller = new AbortController();
  const storageKey = `piki-realtime-last-event:${input.surface}:${input.locationId || "assigned"}`;
  let lastEventId = readLastEventId(storageKey);
  let attempt = 0;
  const emitState = (state: PikiRealtimeConnectionState) => input.onState?.(state);

  const scheduleReconnect = async () => {
    attempt += 1;
    const retryInMs = getPikiRealtimeReconnectDelay(attempt);
    emitState({
      status: isOnline() ? "reconnecting" : "offline",
      attempt,
      retryInMs,
      retryAt: Date.now() + retryInMs,
    });
    await waitForRetry(retryInMs, controller.signal);
  };

  const run = async () => {
    emitState({ status: "connecting", attempt: 0 });
    while (!controller.signal.aborted) {
      if (!isOnline()) {
        await scheduleReconnect();
        continue;
      }

      if (attempt > 0) emitState({ status: "reconnecting", attempt });
      try {
        const response = await fetch(`${input.apiOrigin}/api/v1/realtime/events`, {
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${input.token}`,
            "X-PIKI-Surface": input.surface,
            ...(input.locationId && input.locationId !== "assigned-store" ? { "X-PIKI-Restaurant-Id": input.locationId } : {}),
            ...(lastEventId ? { "Last-Event-ID": lastEventId } : {}),
          },
          credentials: "include",
        });
        if (!response.ok || !response.body) throw new Error(`SSE_HTTP_${response.status}`);

        attempt = 0;
        emitState({ status: "connected", attempt: 0 });
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        try {
          while (!controller.signal.aborted) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const frames = buffer.split(/\r?\n\r?\n/);
            buffer = frames.pop() || "";
            for (const frame of frames) {
              const lines = frame.split(/\r?\n/);
              const eventId = fieldValue(lines, "id");
              const data = lines
                .filter((line) => line.startsWith("data:"))
                .map((line) => line.slice("data:".length).trimStart())
                .join("\n");
              if (!data || (eventId && eventId === lastEventId)) continue;
              try {
                const parsed = JSON.parse(data) as PikiRealtimeEvent;
                if (eventId) {
                  lastEventId = eventId;
                  saveLastEventId(storageKey, eventId);
                }
                if (parsed.type) {
                  input.onEvent(parsed);
                  window.dispatchEvent(new CustomEvent("piki:realtime", { detail: parsed }));
                }
              } catch { /* Malformed frames are ignored while the stream continues. */ }
            }
          }
        } finally {
          reader.releaseLock();
        }
        if (!controller.signal.aborted) throw new Error("SSE_STREAM_ENDED");
      } catch {
        // A deliberate cleanup must not briefly present an operational failure.
        if (controller.signal.aborted) break;
      }
      if (!controller.signal.aborted) await scheduleReconnect();
    }
  };
  void run();
  return () => controller.abort();
}
