export const apiOrigin = (import.meta.env.VITE_API_URL ?? "/piki-api").replace(/\/$/, "");

export type PartnerLocation = {
  id: string;
  name: string;
  address?: string;
  isOpen?: boolean;
};

export type PartnerProfile = {
  name: string;
  email: string;
  role: string;
  roles: string[];
  permissions: string[];
  locations: PartnerLocation[];
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function bool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function values(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringList(value: unknown): string[] {
  return values(value).map(text).filter(Boolean);
}

function firstText(...input: unknown[]): string {
  return input.map(text).find(Boolean) ?? "";
}

function normaliseLocation(value: unknown): PartnerLocation | null {
  const source = record(value);
  const id = firstText(source.id, source._id, source.restaurantId, source.locationId, source.slug);
  const name = firstText(source.name, source.restaurantName, source.locationName, source.tradeName);
  if (!id && !name) return null;
  return {
    id: id || name.toLocaleLowerCase("es-ES").replace(/\s+/g, "-"),
    name: name || "Mi establecimiento",
    address: firstText(source.address, source.fullAddress) || undefined,
    isOpen: bool(source.isOpen) ?? bool(source.open) ?? (text(source.status).toLowerCase() === "open" ? true : undefined),
  };
}

function rolePermissions(roles: string[]): string[] {
  const result = new Set<string>();
  const add = (...permissions: string[]) => permissions.forEach((permission) => result.add(permission));
  for (const role of roles.map((item) => item.toLowerCase())) {
    if (["owner", "partner_admin", "admin", "administrator", "propietario"].includes(role)) add("*");
    else if (["area_manager", "zone_manager", "manager", "gerente", "store_manager"].includes(role)) add("store:write", "orders:read", "orders:write", "orders:cancel", "menu:write", "metrics:read");
    else if (["cashier", "cajero"].includes(role)) add("orders:read", "orders:write");
    else if (["kitchen", "cocina", "cook"].includes(role)) add("orders:read", "orders:prepare");
    else if (["catalog", "catalogue", "menu_manager"].includes(role)) add("menu:write");
    else if (["viewer", "read_only", "solo_lectura"].includes(role)) add("orders:read", "metrics:read");
  }
  return [...result];
}

export function normalisePartnerProfile(value: unknown): PartnerProfile {
  const payload = record(value);
  const employee = record(payload.employee || payload.user || payload.profile);
  const partner = record(payload.partner || employee.partner);
  const locationsInput = [
    ...values(payload.locations),
    ...values(payload.restaurants),
    ...values(employee.locations),
    ...values(employee.restaurants),
    ...values(partner.locations),
    ...values(partner.restaurants),
    payload.restaurant,
    employee.restaurant,
    partner.restaurant,
  ];
  const locations = locationsInput
    .map(normaliseLocation)
    .filter((location): location is PartnerLocation => Boolean(location))
    .filter((location, index, all) => all.findIndex((item) => item.id === location.id) === index);
  const roles = [
    ...stringList(payload.roles),
    ...stringList(employee.roles),
    firstText(payload.role, employee.role, payload.employeeRole),
  ].filter(Boolean);
  const directPermissions = [
    ...stringList(payload.permissions),
    ...stringList(employee.permissions),
  ];
  const permissions = [...new Set([...directPermissions, ...rolePermissions(roles)])];

  return {
    name: firstText(employee.name, employee.fullName, payload.name, payload.fullName, employee.email, payload.email) || "Equipo Partner",
    email: firstText(employee.email, payload.email),
    role: roles[0] || "operador",
    roles,
    permissions: permissions.length ? permissions : ["store:write", "orders:read", "orders:write", "orders:cancel", "menu:write", "metrics:read"],
    locations: locations.length ? locations : [{ id: "assigned-store", name: "Mi establecimiento" }],
  };
}

export function displayRole(role: string): string {
  const labels: Record<string, string> = {
    owner: "Propietario",
    partner_admin: "Administrador",
    admin: "Administrador",
    administrator: "Administrador",
    area_manager: "Gerente de zona",
    zone_manager: "Gerente de zona",
    store_manager: "Gerente de local",
    manager: "Gerente",
    cashier: "Cajero",
    kitchen: "Cocina",
    cook: "Cocina",
    catalog: "Catálogo",
    viewer: "Solo lectura",
    read_only: "Solo lectura",
    operador: "Operador",
  };
  return labels[role.toLowerCase()] ?? "Operador";
}

export function hasPermission(profile: PartnerProfile | null, permission: string): boolean {
  if (!profile) return false;
  if (profile.permissions.includes("*")) return true;
  if (profile.permissions.includes(permission)) return true;
  if (permission === "orders:prepare") return profile.permissions.includes("orders:write");
  return false;
}

export function partnerHeaders(token: string, locationId?: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "X-PIKI-Surface": "partner",
    ...(locationId && locationId !== "assigned-store" ? { "X-PIKI-Restaurant-Id": locationId } : {}),
  };
}
