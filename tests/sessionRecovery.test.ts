import { describe, expect, it } from "vitest";
import { partnerSessionIssue, shouldClearPartnerSession } from "../src/sessionRecovery";

describe("Partner session recovery", () => {
  it("only clears stored credentials for invalid or password-change-required sessions", () => {
    expect(shouldClearPartnerSession(401)).toBe(true);
    expect(shouldClearPartnerSession(428)).toBe(true);
    expect(shouldClearPartnerSession(403)).toBe(false);
    expect(shouldClearPartnerSession(500)).toBe(false);
    expect(shouldClearPartnerSession(503)).toBe(false);
  });

  it("shows a recoverable message for temporary service failures", () => {
    expect(partnerSessionIssue(503)).toContain("sesión sigue guardada");
    expect(partnerSessionIssue()).toContain("sesión sigue guardada");
  });
});
