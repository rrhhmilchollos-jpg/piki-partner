import { describe, expect, it } from "vitest";
import { resolvePartnerApiOrigin } from "./partnerApiOrigin";

describe("Partner API origin", () => {
  it("keeps the hosted production proxy even with an obsolete build variable", () => {
    expect(resolvePartnerApiOrigin({ production: true, native: false, configured: "https://obsolete.example" })).toBe("/piki-api");
  });
  it("uses a direct canonical API on Android, never localhost/piki-api", () => {
    expect(resolvePartnerApiOrigin({ production: true, native: true })).toBe("https://api.pikidelivery.com");
  });
  it("honors an explicitly isolated native origin", () => {
    expect(resolvePartnerApiOrigin({ production: true, native: true, configured: "https://api-staging.example/" })).toBe("https://api-staging.example");
  });
  it.each(["/piki-api", "http://api.example", "https://user:pass@api.example", "https://api.example/v1", "https://api.example?token=a", "https://api.example#fragment"])("rejects an invalid native origin %s rather than silently falling back to production", (configured) => {
    expect(() => resolvePartnerApiOrigin({ production: true, native: true, configured })).toThrow();
  });
  it("preserves the development proxy and configured development origin", () => {
    expect(resolvePartnerApiOrigin({ production: false, native: false })).toBe("/piki-api");
    expect(resolvePartnerApiOrigin({ production: false, native: false, configured: "http://localhost:8080/" })).toBe("http://localhost:8080");
  });
});
