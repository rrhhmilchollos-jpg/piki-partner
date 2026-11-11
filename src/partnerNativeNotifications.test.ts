import { afterEach, describe, expect, it, vi } from "vitest";
import { Capacitor } from "@capacitor/core";
import { nativeNotificationWarnings, postPartnerNativeNotice, type NativeNotificationStatus, type PartnerNativeBridge } from "./partnerNativeNotifications";
const channel = { id: "fixture-channel", enabled: true, importance: 4, soundConfigured: true, sampleAvailable: true, customSampleSelected: true };
const ready: NativeNotificationStatus = { permission: "granted", notificationsEnabled: true, dndMaySuppress: false, silentMode: false, notificationVolumeZero: false, newOrder: channel, cancelled: channel, backgroundReceiver: false };
afterEach(() => vi.restoreAllMocks());
describe("Native Android notice policy", () => {
  it("does not claim a configured channel is guaranteed audible", () => expect(nativeNotificationWarnings(ready)).toEqual([]));
  it("reports denied permissions", () => expect(nativeNotificationWarnings({ ...ready, notificationsEnabled: false })).toContainEqual(expect.stringContaining("bloqueados")));
  it("reports muted channels", () => expect(nativeNotificationWarnings({ ...ready, newOrder: { ...channel, soundConfigured: false } })).toContainEqual(expect.stringContaining("sin sonido")));
  it("reports DND without promising a bypass", () => expect(nativeNotificationWarnings({ ...ready, dndMaySuppress: true })).toContainEqual(expect.stringContaining("PIKI no evita")));
  it("reports silent mode and missing WAVs", () => {
    const warnings = nativeNotificationWarnings({ ...ready, silentMode: true, cancelled: { ...channel, sampleAvailable: false } });
    expect(warnings).toContainEqual(expect.stringContaining("silencio"));
    expect(warnings).toContainEqual(expect.stringContaining("Falta un sonido"));
  });
  it("does not post native alerts from the web", async () => {
    vi.spyOn(Capacitor, "getPlatform").mockReturnValue("web");
    const notifyOrder = vi.fn();
    expect(await postPartnerNativeNotice({ orderId: "fixture", scope: "fixture-kazoku", kind: "new_order" }, { notifyOrder } as unknown as PartnerNativeBridge)).toBe(false);
    expect(notifyOrder).not.toHaveBeenCalled();
  });
  it("posts a cancellation with its restaurant scope", async () => {
    vi.spyOn(Capacitor, "getPlatform").mockReturnValue("android");
    const notifyOrder = vi.fn().mockResolvedValue({ posted: true });
    expect(await postPartnerNativeNotice({ orderId: "fixture", scope: "fixture-kazoku", kind: "cancelled" }, { notifyOrder } as unknown as PartnerNativeBridge)).toBe(true);
    expect(notifyOrder).toHaveBeenCalledWith(expect.objectContaining({ title: "Pedido cancelado PIKI", kind: "cancelled", scope: "fixture-kazoku" }));
  });
  it("denied or rejected native alerts return false without audio fallback", async () => {
    vi.spyOn(Capacitor, "getPlatform").mockReturnValue("android");
    const notice = { orderId: "fixture", scope: "fixture-kazoku", kind: "new_order" as const };
    expect(await postPartnerNativeNotice(notice, { notifyOrder: vi.fn().mockResolvedValue({ posted: false }) } as unknown as PartnerNativeBridge)).toBe(false);
    expect(await postPartnerNativeNotice(notice, { notifyOrder: vi.fn().mockRejectedValue(new Error("Permission denied")) } as unknown as PartnerNativeBridge)).toBe(false);
  });
});
