import { describe, expect, it } from "vitest";
import { hasPermission, normalisePartnerProfile, partnerHeaders } from "./partnerApi";

const kazoku = { _id: "fixture-kazoku", name: "Kazoku Algemesí", tenant: "fixture-tenant" };
const other = { _id: "fixture-other", name: "Otro local", tenant: "fixture-tenant" };
const employee = { name: "Operador de prueba", role: "owner", tenant: "fixture-tenant", lifecycle: "active", restaurantIds: [kazoku._id] };

describe("Partner access adapter (fixtures only)", () => {
  it("resolves the server-assigned Kazoku ID and filters another restaurant", () => {
    const profile = normalisePartnerProfile({ employee, restaurants: [kazoku, other] });
    expect(profile.locations.map((location) => location.id)).toEqual([kazoku._id]);
    expect(profile.locations[0].name).toBe("Kazoku Algemesí");
    expect(profile.tenant).toBe("fixture-tenant");
    expect(hasPermission(profile.locations[0], "orders:read")).toBe(true);
    expect(partnerHeaders("fixture-token", profile.locations[0].id)).toEqual({ Authorization: "Bearer fixture-token", "X-PIKI-Surface": "partner", "X-PIKI-Restaurant-Id": kazoku._id });
  });
  it("accepts explicit assigned IDs without inventing an ID or restaurant name", () => {
    const profile = normalisePartnerProfile({ employee });
    expect(profile.locations[0].id).toBe(kazoku._id);
    expect(profile.locations[0].name).toBe("Establecimiento asignado");
  });
  it("does not synthesize access from a restaurant name or slug", () => {
    expect(normalisePartnerProfile({ employee: { role: "owner" }, restaurants: [{ name: "Kazoku Algemesí", slug: "kazoku" }] }).locations).toEqual([]);
  });
  it("treats empty restaurantIds as revoked even when metadata remains", () => {
    expect(normalisePartnerProfile({ employee: { ...employee, restaurantIds: [] }, restaurants: [kazoku] }).locations).toEqual([]);
  });
  it("intersects explicit ID scopes instead of unioning them", () => {
    expect(normalisePartnerProfile({ employee, restaurantIds: [other._id], restaurants: [kazoku, other] }).locations).toEqual([]);
  });
  it.each(["pending", "suspended", "rejected", "deleted", "unknown_backend_state"])("does not operate lifecycle %s", (lifecycle) => {
    const profile = normalisePartnerProfile({ employee: { ...employee, lifecycle }, restaurants: [kazoku] });
    expect(profile.locations).toEqual([]);
    expect(profile.accessIssue).toContain("lifecycle");
  });
  it("does not resurrect an inactive restaurant from restaurantIds", () => {
    expect(normalisePartnerProfile({ employee, restaurants: [{ ...kazoku, lifecycle: "suspended" }] }).locations).toEqual([]);
  });
  it("rejects incompatible profile tenant values", () => {
    const profile = normalisePartnerProfile({ employee, tenant: "fixture-other-tenant", restaurants: [kazoku] });
    expect(profile.locations).toEqual([]);
    expect(profile.accessIssue).toContain("tenants");
  });
  it("rejects assigned metadata belonging to another tenant", () => {
    expect(normalisePartnerProfile({ employee, restaurants: [{ ...kazoku, tenant: "fixture-other-tenant" }] }).locations).toEqual([]);
  });
  it("does not fall back from an explicit empty membership list", () => {
    expect(normalisePartnerProfile({ employee, memberships: [], restaurants: [kazoku] }).locations).toEqual([]);
  });
  it("does not fall back from suspended memberships", () => {
    expect(normalisePartnerProfile({ employee, memberships: [{ restaurant: kazoku, lifecycle: "suspended" }], restaurants: [kazoku] }).locations).toEqual([]);
  });
  it("rejects tenant mismatch between a membership and its nested restaurant", () => {
    expect(normalisePartnerProfile({ employee, memberships: [{ restaurant: { ...kazoku, tenant: "fixture-other-tenant" }, tenant: employee.tenant }] }).locations).toEqual([]);
  });
  it("an explicit empty local role list does not inherit owner", () => {
    expect(normalisePartnerProfile({ employee, memberships: [{ restaurant: kazoku, roles: [] }] }).locations[0].permissions).toEqual([]);
  });
  it("membership kitchen role does not inherit global owner wildcard", () => {
    const profile = normalisePartnerProfile({ employee, memberships: [{ restaurant: kazoku, role: "kitchen" }] });
    expect(hasPermission(profile.locations[0], "orders:read")).toBe(true);
    expect(hasPermission(profile.locations[0], "orders:prepare")).toBe(true);
    expect(hasPermission(profile.locations[0], "menu:write")).toBe(false);
  });
  it("explicit empty permissions override role-derived owner permissions", () => {
    const profile = normalisePartnerProfile({ employee, memberships: [{ restaurant: kazoku, role: "owner", permissions: [] }] });
    expect(hasPermission(profile.locations[0], "orders:read")).toBe(false);
  });
  it("explicit global permissions are authoritative, including empty arrays", () => {
    const profile = normalisePartnerProfile({ employee: { ...employee, permissions: [] }, restaurants: [kazoku] });
    expect(profile.locations[0].permissions).toEqual([]);
  });
  it("preserves coming-soon visibility without mistaking it for account lifecycle", () => {
    expect(normalisePartnerProfile({ employee, restaurants: [{ ...kazoku, availabilityStatus: "coming_soon" }] }).locations[0].availabilityStatus).toBe("coming_soon");
  });
  it("does not grant any local access from a bare role", () => {
    expect(normalisePartnerProfile({ employee: { role: "owner" } }).locations).toEqual([]);
  });
  it("generic partner role alone does not invent operational permissions", () => {
    const profile = normalisePartnerProfile({ employee: { ...employee, role: "partner" }, restaurants: [kazoku] });
    expect(profile.locations[0].permissions).toEqual([]);
    expect(hasPermission(profile.locations[0], "orders:read")).toBe(false);
  });
  it("does not grant a disabled account", () => {
    expect(normalisePartnerProfile({ employee: { ...employee, isActive: false }, restaurants: [kazoku] }).locations).toEqual([]);
  });
});
