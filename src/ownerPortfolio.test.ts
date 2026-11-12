import { describe, expect, it } from "vitest";
import { hasPermission, normalisePartnerProfile } from "./partnerApi";

const tenantId = "65f000000000000000000001";
const local = (id: string, extra = {}) => ({ id, name: `Offline ${id}`, tenantId, ...extra });
const owner = (locations: unknown[]) => ({ employee: { name: "Offline owner", tenantId, roles: ["owner"], permissions: ["*"], locations } });

describe("Owner effective location permissions (offline, backend response only)", () => {
  it("keeps seven tenant locations and server order without invented assignment IDs", () => {
    const locations = Array.from({ length: 7 }, (_, i) => local(String(i), i < 5 ? { permissions: ["*"], ordersEnabled: true } : { permissions: ["menu:read"], readOnly: true, ordersEnabled: false, reason: "not_approved", isOpen: false }));
    const profile = normalisePartnerProfile(owner(locations));
    expect(profile.locations.map((row) => row.id)).toEqual(locations.map((row) => row.id));
    for (const pending of profile.locations.slice(5)) {
      expect(pending.permissions).toEqual(["menu:read"]);
      expect(pending.reason).toBe("not_approved");
      expect(hasPermission(pending, "menu:read")).toBe(true);
      for (const permission of ["orders:read", "orders:write", "orders:prepare", "orders:cancel", "menu:write", "store:write", "metrics:read"]) expect(hasPermission(pending, permission)).toBe(false);
    }
    expect(hasPermission(profile.locations[0], "orders:write")).toBe(true);
  });
  it("per-local permissions [] override global Owner *", () => {
    const profile = normalisePartnerProfile(owner([local("none", { permissions: [] })]));
    expect(profile.locations[0].permissions).toEqual([]);
    expect(hasPermission(profile.locations[0], "orders:read")).toBe(false);
  });
  it("honors local kitchen roles instead of global Owner role inference", () => {
    const profile = normalisePartnerProfile(owner([local("kitchen", { roles: ["kitchen"] })]));
    expect(hasPermission(profile.locations[0], "orders:prepare")).toBe(true);
    expect(hasPermission(profile.locations[0], "orders:write")).toBe(false);
    expect(hasPermission(profile.locations[0], "menu:write")).toBe(false);
  });
  it("restrictive duplicate readiness cannot be overwritten by an unrestricted source", () => {
    const profile = normalisePartnerProfile({ ...owner([local("same", { permissions: ["menu:read"], readOnly: true, ordersEnabled: false })]), restaurants: [local("same", { permissions: ["*"], ordersEnabled: true })] });
    expect(profile.locations).toHaveLength(1);
    expect(hasPermission(profile.locations[0], "orders:write")).toBe(false);
    expect(hasPermission(profile.locations[0], "menu:write")).toBe(false);
  });
  it("never widens ordinary five-location manager from metadata outside restaurantIds", () => {
    const ids = ["1", "2", "3", "4", "5"];
    const profile = normalisePartnerProfile({ employee: { role: "manager", tenantId, restaurantIds: ids, locations: [...ids, "6", "7"].map((id) => local(id)) } });
    expect(profile.locations.map((row) => row.id)).toEqual(ids);
  });
  it("never uses client email/superadmin labels to waive empty assignments or tenant conflicts", () => {
    const account = { role: "owner", email: "rrhh.milchollos@gmail.com", ownerProtected: true, accessLevel: "superadmin", tenantId, restaurantIds: [] };
    expect(normalisePartnerProfile({ employee: account, locations: [local("pending", { readOnly: true })] }).locations).toEqual([]);
    expect(normalisePartnerProfile(owner([local("foreign", { tenantId: "other" })])).locations).toEqual([]);
  });
});
