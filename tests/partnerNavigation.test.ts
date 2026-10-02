import { describe, expect, it } from "vitest";
import { visiblePartnerViews } from "../src/partnerNavigation";

describe("visiblePartnerViews", () => {
  it("shows the restaurant menu editor to a user with menu write permission", () => {
    expect(visiblePartnerViews({
      ordersRead: false,
      menuRead: true,
      menuWrite: true,
      metricsRead: false,
    })).toEqual(["catalog", "menu"]);
  });

  it("keeps the menu editor hidden from staff without menu write permission", () => {
    expect(visiblePartnerViews({
      ordersRead: true,
      menuRead: false,
      menuWrite: false,
      metricsRead: false,
    })).toEqual(["orders"]);
  });

  it("preserves the other operational sections and their order", () => {
    expect(visiblePartnerViews({
      ordersRead: true,
      menuRead: true,
      menuWrite: false,
      metricsRead: true,
    })).toEqual(["orders", "menu", "performance"]);
  });
});
