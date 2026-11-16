import { Capacitor } from "@capacitor/core";
import { resolvePartnerApiOrigin } from "./partnerApiOrigin";
import { accountPhotoUrl } from "./accountPhoto";

export const apiOrigin = resolvePartnerApiOrigin({
  production: import.meta.env.PROD,
  native: Capacitor.isNativePlatform(),
  configured: import.meta.env.VITE_API_URL,
});

export type PartnerLocation = {
  id: string;
  partnerCode?: string;
  name: string;
  cuisine?: string;
  category?: string;
  locality?: string;
  address?: string;
  email?: string;
  phone?: string;
  deliveryFeeCents?: number;
  commissionRateBps?: number;
  promoted?: boolean;
  availabilityStatus?: "available" | "coming_soon";
  isOpen?: boolean;
  ordersEnabled?: boolean;
  readOnly?: boolean;
  reason?: string;
  roles: string[];
  permissions: string[];
  tenant?: string;
  lifecycle?: string;
};

export type PartnerProfile = {
  id: string;
  name: string;
  fullName: string;
  photoUrl: string | null;
  jobRole: string;
  role: string;
  email: string;
  locations: PartnerLocation[];
  tenant?: string;
  lifecycle?: string;
  accessIssue?: string;
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

function tenantOf(source: JsonRecord): string {
  const tenant = record(source.tenant);
  return firstText(source.tenantId, tenant.id, tenant._id, source.tenant);
}

function lifecycleOf(source: JsonRecord): string {
  return firstText(record(source.lifecycle).status, source.lifecycle, source.lifecycleStatus).toLowerCase();
}

// Compatibility adapter, not a new backend lifecycle. Explicit unknown/non-operational
// lifecycle values fail closed until the backend owner confirms their meaning.
function accessActive(source: JsonRecord): boolean {
  const lifecycle = lifecycleOf(source);
  return source.isActive !== false && source.disabled !== true
    && (!lifecycle || ["active", "approved", "operational", "enabled"].includes(lifecycle));
}

function normaliseLocation(value: unknown): Omit<PartnerLocation, "roles" | "permissions"> | null {
  const source = record(value);
  const id = firstText(source.id, source._id, source.restaurantId, source.locationId, source.storeId);
  const name = firstText(source.name, source.restaurantName, source.locationName, source.storeName, source.tradeName);
  if (!id || !accessActive(source)) return null;
  return {
    id,
    tenant: tenantOf(source) || undefined,
    lifecycle: lifecycleOf(source) || undefined,
    partnerCode: firstText(source.partnerCode, source.partnerId, source.onboardingCode) || undefined,
    name: name || "Establecimiento asignado",
    cuisine: firstText(source.cuisine) || undefined,
    category: firstText(source.category) || undefined,
    locality: firstText(source.locality) || undefined,
    address: firstText(source.address, source.fullAddress) || undefined,
    email: firstText(source.email) || undefined,
    phone: firstText(source.phone) || undefined,
    deliveryFeeCents: typeof source.deliveryFeeCents === "number" ? source.deliveryFeeCents : undefined,
    commissionRateBps: typeof source.commissionRateBps === "number" ? source.commissionRateBps : undefined,
    promoted: bool(source.promoted),
    availabilityStatus: source.availabilityStatus === "coming_soon" ? "coming_soon" : source.availabilityStatus === "available" ? "available" : undefined,
    isOpen: bool(source.isOpen) ?? bool(source.open) ?? (text(source.status).toLowerCase() === "open" ? true : undefined),
    ordersEnabled: bool(source.ordersEnabled),
    readOnly: bool(source.readOnly),
    reason: text(source.reason) || undefined,
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

function scopeRoles(source: JsonRecord, fallbackRoles: string[]): string[] {
  const roles = [
    ...stringList(source.roles),
    firstText(source.role, source.employeeRole),
  ].filter(Boolean);
  return Array.isArray(source.roles) || roles.length ? [...new Set(roles)] : fallbackRoles;
}

function normaliseMembership(value: unknown, fallbackRoles: string[], fallbackPermissions: string[]): PartnerLocation | null {
  const source = record(value);
  if (!accessActive(source)) return null;
  const location = normaliseLocation(source.location || source.restaurant || source.store || source);
  if (!location) return null;
  if (tenantOf(source) && location.tenant && tenantOf(source) !== location.tenant) return null;
  const roles = scopeRoles(source, fallbackRoles);
  const ownRoles = Array.isArray(source.roles) || Boolean(firstText(source.role, source.employeeRole));
  const permissions = Array.isArray(source.permissions) ? stringList(source.permissions)
    : ownRoles ? rolePermissions(roles) : fallbackPermissions;
  return { ...location, tenant: tenantOf(source) || location.tenant, lifecycle: lifecycleOf(source) || location.lifecycle, roles, permissions };
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
    existing.cuisine ??= location.cuisine; existing.category ??= location.category; existing.locality ??= location.locality;
    existing.isOpen ??= location.isOpen;
    // A second metadata source must not resurrect a read-only/order-disabled local.
    if (location.readOnly === true) existing.readOnly = true;
    if (location.ordersEnabled === false) existing.ordersEnabled = false;
    existing.reason ??= location.reason;
    existing.address ??= location.address; existing.email ??= location.email; existing.phone ??= location.phone;
    existing.deliveryFeeCents ??= location.deliveryFeeCents; existing.commissionRateBps ??= location.commissionRateBps; existing.promoted ??= location.promoted; existing.availabilityStatus ??= location.availabilityStatus;
    return result;
  }, []);
}

export function normalisePartnerProfile(value: unknown): PartnerProfile {
  const payload = record(value);
  const employee = record(payload.employee || payload.user || payload.profile);
  const partner = record(payload.partner || employee.partner);
  const tenant = firstText(tenantOf(employee), tenantOf(payload), tenantOf(partner));
  const lifecycle = firstText(lifecycleOf(employee), lifecycleOf(payload), lifecycleOf(partner));
  const tenantConflict = [employee, payload, partner].some((source) => tenantOf(source) && tenantOf(source) !== tenant);
  const active = [employee, payload, partner].every(accessActive);
  const globalRoles = [
    ...stringList(payload.roles),
    ...stringList(employee.roles),
    firstText(payload.role, employee.role, payload.employeeRole),
  ].filter(Boolean);
  const globalPermissions = [
    ...stringList(payload.permissions),
    ...stringList(employee.permissions),
  ];
  const effectiveGlobalPermissions = Array.isArray(payload.permissions) || Array.isArray(employee.permissions)
    ? [...new Set(globalPermissions)] : rolePermissions(globalRoles);
  // If more than one explicit list is returned, intersect them; [] revokes access.
  const idScopes = [payload, employee, partner].filter((source) => Array.isArray(source.restaurantIds))
    .map((source) => new Set(stringList(source.restaurantIds)));
  const assignedIds = idScopes.length ? new Set([...idScopes[0]].filter((id) => idScopes.every((scope) => scope.has(id)))) : null;
  const membershipInput = [
    ...values(payload.memberships),
    ...values(payload.assignments),
    ...values(employee.memberships),
    ...values(employee.assignments),
  ];
  const memberships = membershipInput
    .map((membership) => normaliseMembership(membership, globalRoles, effectiveGlobalPermissions))
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
    .map((value): PartnerLocation | null => {
      const source = record(value);
      const location = normaliseLocation(value);
      if (!location) return null;
      const roles = scopeRoles(source, globalRoles);
      const ownRoles = Array.isArray(source.roles) || Boolean(firstText(source.role, source.employeeRole));
      const permissions = Array.isArray(source.permissions) ? stringList(source.permissions)
        : ownRoles ? rolePermissions(roles) : effectiveGlobalPermissions;
      return { ...location, roles, permissions };
    })
    .filter((location): location is PartnerLocation => Boolean(location));
  // An explicit membership list is authoritative, including an empty or invalid one.
  const membershipProvided = [payload, employee].some((source) => Array.isArray(source.memberships) || Array.isArray(source.assignments));
  const candidates = membershipProvided ? memberships : directLocations;
  if (!membershipProvided && assignedIds) {
    for (const id of assignedIds) {
      if (!candidates.some((location) => location.id === id) && !locationInput.some((value) => {
        const source = record(value);
        return firstText(source.id, source._id, source.restaurantId, source.locationId, source.storeId) === id;
      })) candidates.push({ id, name: "Establecimiento asignado", tenant: tenant || undefined, roles: globalRoles, permissions: effectiveGlobalPermissions });
    }
  }
  const locations = candidates.filter((location) => (!assignedIds || assignedIds.has(location.id))
    && (!tenant || !location.tenant || location.tenant === tenant));

  return {
    id: firstText(employee.id, employee._id),
    name: firstText(employee.fullName, employee.name, payload.fullName, payload.name),
    fullName: firstText(employee.fullName, employee.name, payload.fullName, payload.name),
    photoUrl: accountPhotoUrl(employee.photoUrl),
    jobRole: text(employee.jobRole),
    role: text(employee.role),
    email: firstText(employee.email, payload.email),
    tenant: tenant || undefined,
    lifecycle: lifecycle || undefined,
    accessIssue: tenantConflict ? "La respuesta de acceso contiene tenants incompatibles. PIKI debe revisar la asignación."
      : !active ? "La cuenta o expediente no tiene un lifecycle operativo confirmado. Contacta con PIKI."
      : undefined,
    // Never grant by name, slug, local storage or a client-created Kazoku account.
    locations: active && !tenantConflict ? mergeLocations(locations) : [],
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
  return labels[role.toLowerCase()] ?? role;
}

export function hasPermission(location: PartnerLocation | null | undefined, permission: string): boolean {
  if (!location) return false;
  if (location.readOnly === true && permission !== "menu:read") return false;
  if (location.ordersEnabled === false && permission.startsWith("orders:")) return false;
  if (location.permissions.includes("*")) return true;
  if (location.permissions.includes(permission)) return true;
  if (permission === "menu:read") return location.permissions.includes("menu:write");
  return false;
}

/** Visibility is separate from operation readiness: the team can see the workspace while a local is paused or pending approval. */
export function hasDeclaredPermission(location: PartnerLocation | null | undefined, permission: string): boolean {
  if (!location) return false;
  return location.permissions.includes("*") || location.permissions.includes(permission);
}

export function partnerHeaders(token: string, locationId?: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "X-PIKI-Surface": "partner",
    ...(locationId ? { "X-PIKI-Restaurant-Id": locationId } : {}),
  };
}
