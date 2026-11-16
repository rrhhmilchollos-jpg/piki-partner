import { describe, expect, it } from "vitest";
import { visiblePartnerViews } from "./partnerNavigation";

const noAccess = { ordersRead: false, menuRead: true, menuWrite: false, metricsRead: false, storeWrite: false };

describe("Partner navigation", () => {
  it("shows the online incoming queue to staff with order-read permission", () => {
    expect(visiblePartnerViews({ ...noAccess, ordersRead: true })).toEqual(["orders", "incoming", "history", "menu"]);
  });

  it("does not expose order views without order-read permission", () => {
    expect(visiblePartnerViews(noAccess)).toEqual(["menu"]);
  });
});
