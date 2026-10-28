import { describe, expect, it } from "vitest";
import { createPartnerVisibilityPolling, type PartnerIntervalScheduler, type PartnerVisibilitySource } from "./partnerVisibilityPolling";

class FakeVisibilitySource implements PartnerVisibilitySource {
  visibilityState: "visible" | "hidden" | "prerender" = "visible";
  private listeners = new Set<EventListener>();

  addEventListener(_type: "visibilitychange", listener: EventListener) { this.listeners.add(listener); }
  removeEventListener(_type: "visibilitychange", listener: EventListener) { this.listeners.delete(listener); }
  emitVisibilityChange() { this.listeners.forEach((listener) => listener({ type: "visibilitychange" } as Event)); }
  get listenerCount() { return this.listeners.size; }
}

class FakeIntervalScheduler implements PartnerIntervalScheduler {
  private nextId = 1;
  private intervals = new Map<number, { callback: () => void; milliseconds: number }>();

  setInterval(callback: () => void, milliseconds: number) {
    const id = this.nextId++;
    this.intervals.set(id, { callback, milliseconds });
    return id;
  }

  clearInterval(intervalId: number) { this.intervals.delete(intervalId); }
  run(milliseconds: number) { [...this.intervals.values()].filter((interval) => interval.milliseconds === milliseconds).forEach((interval) => interval.callback()); }
  get activeCount() { return this.intervals.size; }
}

describe("partner visibility polling", () => {
  it("pauses REST refreshes and countdown ticks while hidden, then resumes once", () => {
    const source = new FakeVisibilitySource();
    const scheduler = new FakeIntervalScheduler();
    let refreshes = 0;
    let ticks = 0;

    const stop = createPartnerVisibilityPolling({
      source,
      scheduler,
      onRefresh: () => { refreshes += 1; },
      onTick: () => { ticks += 1; },
      pollIntervalMs: 30_000,
      tickIntervalMs: 1_000,
    });

    expect({ refreshes, ticks, active: scheduler.activeCount }).toEqual({ refreshes: 1, ticks: 1, active: 2 });
    source.visibilityState = "hidden";
    source.emitVisibilityChange();
    expect(scheduler.activeCount).toBe(0);

    source.visibilityState = "visible";
    source.emitVisibilityChange();
    expect({ refreshes, ticks, active: scheduler.activeCount }).toEqual({ refreshes: 2, ticks: 2, active: 2 });

    // A second visible event must not create a second poll/tick pair.
    source.emitVisibilityChange();
    expect(scheduler.activeCount).toBe(2);
    scheduler.run(30_000);
    scheduler.run(1_000);
    expect({ refreshes, ticks }).toEqual({ refreshes: 3, ticks: 3 });

    stop();
    expect({ active: scheduler.activeCount, listeners: source.listenerCount }).toEqual({ active: 0, listeners: 0 });
  });

  it("guards callbacks if the document becomes hidden before its listener runs", () => {
    const source = new FakeVisibilitySource();
    const scheduler = new FakeIntervalScheduler();
    let refreshes = 0;
    let ticks = 0;

    const stop = createPartnerVisibilityPolling({ source, scheduler, onRefresh: () => { refreshes += 1; }, onTick: () => { ticks += 1; } });
    source.visibilityState = "hidden";
    scheduler.run(30_000);
    scheduler.run(1_000);

    expect({ refreshes, ticks }).toEqual({ refreshes: 1, ticks: 1 });
    stop();
  });
});
