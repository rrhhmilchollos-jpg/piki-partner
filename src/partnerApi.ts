// Production must always use the Vercel same-origin rewrite. This deliberately ignores a
// legacy VITE_API_URL project variable that could otherwise reintroduce browser CORS failures.
export const apiOrigin = (import.meta.env.PROD ? "/piki-api" : (import.meta.env.VITE_API_URL ?? "/piki-api")).replace(/\/$/, "");

export type PartnerLocation = {
  id: string;
  partnerCode?: string;
  name: string;
  address?: string;
  isOpen?: boolean;
  roles: string[];
  permissions: string[];
};

export type PartnerProfile = {
  name: string;
  email: string;
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

function normaliseLocation(value: unknown): Omit<PartnerLocation, "roles" | "permissions"> | null {
  const source = record(value);
  const id = firstText(source.id, source._id, source.restaurantId, source.locationId, source.storeId, source.slug);
  const name = firstText(source.name, source.restaurantName, source.locationName, source.storeName, source.tradeName);
  if (!id && !name) return null;
  return {
    id: id || name.toLocaleLowerCase("es-ES").replace(/\s+/g, "-"),
    partnerCode: firstText(source.partnerCode, source.partnerId, source.onboardingCode) || undefined,
    name: name || "Establecimiento asignado",
    address: firstText(source.address, source.fullAddress) || undefined,
    isOpen: bool(source.isOpen) ?? bool(source.open) ?? (text(source.status).toLowerCase() === "open" ? true : undefined),
  };
}

function rolePermissions(roles: string[]): string[] {
  const result = new Set<string>();
  const add = (...permissions: string[]) => permissions.forEach((permission) => result.add(permission));
  for (const role of roles.map((item) => item.toLowerCase())) {
    if (["owner", "partner_admin", "admin", "administrator", "propietario"].includes(role)) add("*");
    else if (["area_manager", "zone_manager", "manager", "gerente", "store_manager"].includes(role)) add("store:write", "orders:read", "orders:write", "orders:cancel", "orders:prepare", "menu:read", "menu:write", "metrics:read");
    else if (["cashier", "cajero"].includes(role)) add("orders:read", "orders:write");
    else if (["kitchen", "cocina", "cook"].includes(role)) add("orders:read", "orders:prepare");
    else if (["catalog", "catalogue", "menu_manager"].includes(role)) add("menu:read", "menu:write");
    else if (["viewer", "read_only", "solo_lectura"].includes(role)) add("orders:read", "metrics:read");
  }
  return [...result];
}

function scopePermissions(roles: string[], directPermissions: string[]): string[] {
  return [...new Set([...directPermissions, ...rolePermissions(roles)])];
}

function scopeRoles(source: JsonRecord, fallbackRoles: string[]): string[] {
  const roles = [
    ...stringList(source.roles),
    firstText(source.role, source.employeeRole),
  ].filter(Boolean);
  return roles.length ? [...new Set(roles)] : fallbackRoles;
}

function scopeDirectPermissions(source: JsonRecord, fallbackPermissions: string[]): string[] {
  const permissions = stringList(source.permissions);
  return permissions.length ? [...new Set(permissions)] : fallbackPermissions;
}

function normaliseMembership(value: unknown, fallbackRoles: string[], fallbackPermissions: string[]): PartnerLocation | null {
  const source = record(value);
  const location = normaliseLocation(source.location || source.restaurant || source.store || source);
  if (!location) return null;
  const roles = scopeRoles(source, fallbackRoles);
  const permissions = scopePermissions(roles, scopeDirectPermissions(source, fallbackPermissions));
  return { ...location, roles, permissions };
}

function mergeLocations(locations: PartnerLocation[]): PartnerLocation[] {
  return locations.reduce<PartnerLocation[]>((result, location) => {
    const existing = result.find((item) => item.id === location.id);
    if (!existing) {
      result.push(location);
      return result;
    }
    existing.roles = [...new Set([...existing.roles, ...location.roles])];
    existing.permissions = [...new Set([...existing.permissions, ...location.permissions])];
    existing.partnerCode ??= location.partnerCode;
    existing.isOpen ??= location.isOpen;
    existing.address ??= location.address;
    return result;
  }, []);
}

export function normalisePartnerProfile(value: unknown): PartnerProfile {
  const payload = record(value);
  const employee = record(payload.employee || payload.user || payload.profile);
  const partner = record(payload.partner || employee.partner);
  const globalRoles = [
    ...stringList(payload.roles),
    ...stringList(employee.roles),
    firstText(payload.role, employee.role, payload.employeeRole),
  ].filter(Boolean);
  const globalPermissions = [
    ...stringList(payload.permissions),
    ...stringList(employee.permissions),
  ];
  const membershipInput = [
    ...values(payload.memberships),
    ...values(payload.assignments),
    ...values(employee.memberships),
    ...values(employee.assignments),
  ];
  const memberships = membershipInput
    .map((membership) => normaliseMembership(membership, globalRoles, globalPermissions))
    .filter((location): location is PartnerLocation => Boolean(location));

  const locationInput = [
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
  const directLocations = locationInput
    .map(normaliseLocation)
    .filter((location): location is Omit<PartnerLocation, "roles" | "permissions"> => Boolean(location))
    .map((location) => ({ ...location, roles: globalRoles, permissions: scopePermissions(globalRoles, globalPermissions) }));

  return {
    name: firstText(employee.name, employee.fullName, payload.name, payload.fullName, employee.email, payload.email) || "Equipo Partner",
    email: firstText(employee.email, payload.email),
    // No synthetic location or permissive fallback is granted. The server must send an assignment.
    locations: mergeLocations(memberships.length ? memberships : directLocations),
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

export function hasPermission(location: PartnerLocation | null | undefined, permission: string): boolean {
  if (!location) return false;
  if (location.permissions.includes("*")) return true;
  if (location.permissions.includes(permission)) return true;
  if (permission === "orders:prepare") return location.permissions.includes("orders:write");
  if (permission === "menu:read") return location.permissions.includes("menu:write");
  return false;
}

export function partnerHeaders(token: string, locationId?: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "X-PIKI-Surface": "partner",
    ...(locationId ? { "X-PIKI-Restaurant-Id": locationId } : {}),
  };
}
