import { useEffect } from "react";

const UPDATE_ACTIVITY_EVENT = "piki-pwa-update-activity";
const blockers = new Set<string>();

function notify(): void {
  window.dispatchEvent(new Event(UPDATE_ACTIVITY_EVENT));
}

export function isPwaUpdateSafe(): boolean {
  return blockers.size === 0;
}

export function subscribeToPwaUpdateSafety(listener: () => void): () => void {
  window.addEventListener(UPDATE_ACTIVITY_EVENT, listener);
  return () => window.removeEventListener(UPDATE_ACTIVITY_EVENT, listener);
}

export function usePwaUpdateBlocker(key: string, blocked: boolean): void {
  useEffect(() => {
    const wasBlocked = blockers.has(key);
    if (blocked) blockers.add(key);
    else blockers.delete(key);
    if (wasBlocked !== blockers.has(key)) notify();

    return () => {
      if (blockers.delete(key)) notify();
    };
  }, [blocked, key]);
}
