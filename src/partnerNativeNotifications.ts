import { Capacitor, registerPlugin } from "@capacitor/core";

export type NativeNotificationChannel = {
  id: string;
  enabled: boolean;
  importance: number;
  soundConfigured: boolean;
  sampleAvailable: boolean;
  customSampleSelected: boolean;
};
export type NativeNotificationStatus = {
  permission: "prompt" | "prompt-with-rationale" | "granted" | "denied";
  notificationsEnabled: boolean;
  dndMaySuppress: boolean;
  silentMode: boolean;
  notificationVolumeZero: boolean;
  newOrder: NativeNotificationChannel;
  cancelled: NativeNotificationChannel;
  backgroundReceiver: false;
};
export type PartnerNativeNotice = { orderId: string; publicCode?: string; scope: string; kind: "new_order" | "cancelled" };
export type PartnerNativeBridge = {
  getStatus(): Promise<NativeNotificationStatus>;
  requestNotificationPermission(): Promise<NativeNotificationStatus>;
  openSettings(input: { category: "app" | "new_order" | "cancelled" }): Promise<void>;
  notifyOrder(input: PartnerNativeNotice & { title: string; body: string }): Promise<{ posted: boolean }>;
  clearOrder(input: { orderId: string; scope: string }): Promise<void>;
  clearAllOrders(): Promise<void>;
};
export const partnerNativeNotifications = registerPlugin<PartnerNativeBridge>("PartnerNotifications");
export const isPartnerNativeAndroid = () => Capacitor.getPlatform() === "android";
export const nativeNotificationStatusEvent = "piki:partner-native-notification-status";

export function nativeNotificationWarnings(status: NativeNotificationStatus): string[] {
  const warnings: string[] = [];
  if (!status.notificationsEnabled) warnings.push("Los avisos Android están bloqueados. Concede el permiso o revisa los ajustes de la aplicación.");
  if (!status.newOrder.enabled || !status.cancelled.enabled) warnings.push("Hay un canal de pedidos desactivado: revisa nuevos pedidos y cancelaciones.");
  if (!status.newOrder.soundConfigured || !status.cancelled.soundConfigured) warnings.push("Hay un canal sin sonido o con importancia baja. Android conserva tus ajustes; solo tú puedes cambiarlos.");
  if (status.silentMode || status.notificationVolumeZero) warnings.push("El dispositivo está en silencio, vibración o sin volumen de notificaciones.");
  if (status.dndMaySuppress) warnings.push("No molestar puede silenciar estos avisos. PIKI no evita esa configuración.");
  if (!status.newOrder.sampleAvailable || !status.cancelled.sampleAvailable) warnings.push("Falta un sonido PIKI en este APK; se utiliza el sonido de notificación del sistema.");
  else if (!status.newOrder.customSampleSelected || !status.cancelled.customSampleSelected) warnings.push("Este dispositivo conserva sonidos anteriores o elegidos en Android; no se restablecen automáticamente.");
  return warnings;
}

export async function postPartnerNativeNotice(notice: PartnerNativeNotice, bridge = partnerNativeNotifications): Promise<boolean> {
  if (!isPartnerNativeAndroid() || !notice.orderId) return false;
  try {
    const cancelled = notice.kind === "cancelled";
    const result = await bridge.notifyOrder({
      ...notice,
      title: cancelled ? "Pedido cancelado PIKI" : "Nuevo pedido PIKI",
      body: `Pedido ${notice.publicCode || notice.orderId} ${cancelled ? "cancelado. No lo prepares" : "pendiente de aceptación"}`,
    });
    if (typeof window !== "undefined") window.dispatchEvent(new Event(nativeNotificationStatusEvent));
    return result.posted;
  } catch {
    // A denied/unavailable native notification must not trigger Web Audio on Android:
    // that could defeat the user's channel/DND settings. The board stays usable.
    if (typeof window !== "undefined") window.dispatchEvent(new Event(nativeNotificationStatusEvent));
    return false;
  }
}
