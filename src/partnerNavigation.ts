export type PartnerView = "orders" | "incoming" | "history" | "catalog" | "menu" | "performance" | "settings";

export type PartnerNavigationPermissions = {
  ordersRead: boolean;
  menuRead: boolean;
  menuWrite: boolean;
  metricsRead: boolean;
  storeWrite: boolean;
};

export function visiblePartnerViews(permissions: PartnerNavigationPermissions): PartnerView[] {
  const views: PartnerView[] = [];
  if (permissions.ordersRead) { views.push("orders"); views.push("incoming"); views.push("history"); }
  if (permissions.menuWrite) views.push("catalog");
  if (permissions.menuRead) views.push("menu");
  if (permissions.metricsRead) views.push("performance");
  if (permissions.storeWrite) views.push("settings");
  return views;
}
