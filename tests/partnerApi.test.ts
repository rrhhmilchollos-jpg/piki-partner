import { describe, expect, it } from "vitest";
import { hasPermission, normalisePartnerProfile } from "../src/partnerApi";

describe("normalisePartnerProfile", () => {
  it("keeps permissions scoped to each membership", () => {
    const profile = normalisePartnerProfile({
      employee: { name: "Ana", email: "ana@partner.es" },
      memberships: [
        { restaurant: { id: "centro", name: "PIKI Centro" }, roles: ["kitchen"] },
        { restaurant: { id: "norte", name: "PIKI Norte" }, roles: ["catalog"] },
      ],
    });

    const centro = profile.locations.find((location) => location.id === "centro");
    const norte = profile.locations.find((location) => location.id === "norte");
    expect(centro).toBeDefined();
    expect(norte).toBeDefined();
    expect(hasPermission(centro, "orders:prepare")).toBe(true);
    expect(hasPermission(centro, "menu:write")).toBe(false);
    expect(hasPermission(norte, "menu:write")).toBe(true);
    expect(hasPermission(norte, "orders:read")).toBe(false);
  });

  it("denies access when the API does not provide a local assignment or permission", () => {
    const profile = normalisePartnerProfile({ employee: { name: "Sin asignación", email: "sin@partner.es" } });
    expect(profile.locations).toEqual([]);
    expect(hasPermission(undefined, "orders:read")).toBe(false);
  });

  it("uses explicit global roles only for legacy payloads that name a local", () => {
    const profile = normalisePartnerProfile({
      employee: { role: "cashier", restaurant: { id: "sur", name: "PIKI Sur" } },
    });
    expect(profile.locations).toHaveLength(1);
    expect(hasPermission(profile.locations[0], "orders:read")).toBe(true);
    expect(hasPermission(profile.locations[0], "menu:write")).toBe(false);
  });
});
