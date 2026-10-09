import { describe, expect, it } from "vitest";
import { getPwaUpdateDecision, isValidReleasePolicy, shouldReloadAfterControllerChange } from "./pwaUpdatePolicy";

const client = { surface: "partner", version: "0.2.9", buildId: "old-build" };

describe("PWA update policy", () => {
  it("does not force an update just because a new build exists", () => {
    const policy = {
      surface: "partner",
      version: "0.2.9",
      minimumVersion: "0.2.9",
      buildId: "new-build",
      forceUpdate: true,
    };

    expect(isValidReleasePolicy(policy, "partner")).toBe(true);
    if (!isValidReleasePolicy(policy, "partner")) throw new Error("policy should be valid");
    expect(getPwaUpdateDecision(policy, client)).toEqual({
      updateAvailable: true,
      required: false,
      targetVersion: "0.2.9",
      targetBuildId: "new-build",
    });
  });

  it("requires a PWA update only when the minimum version is newer", () => {
    const policy = {
      surface: "partner",
      version: "0.2.10",
      minimumVersion: "0.2.10",
      buildId: "new-build",
      forceUpdate: true,
    };

    if (!isValidReleasePolicy(policy, "partner")) throw new Error("policy should be valid");
    expect(getPwaUpdateDecision(policy, client).required).toBe(true);
  });

  it("accepts an explicit compatibility block and rejects malformed policy", () => {
    const forced = {
      surface: "partner",
      version: "0.2.9",
      minimumVersion: "0.2.9",
      buildId: "new-build",
      forceUpdate: true,
      updateRequired: true,
    };
    if (!isValidReleasePolicy(forced, "partner")) throw new Error("policy should be valid");
    expect(getPwaUpdateDecision(forced, client).required).toBe(true);
    expect(isValidReleasePolicy({ ...forced, updateRequired: "yes" }, "partner")).toBe(false);
    expect(isValidReleasePolicy({ ...forced, surface: "customer" }, "partner")).toBe(false);
  });

  it("never reloads on a first controller or while an operation is active", () => {
    expect(shouldReloadAfterControllerChange({ hadController: false, isSafeToReload: true, alreadyReloadedForBuild: false })).toBe(false);
    expect(shouldReloadAfterControllerChange({ hadController: true, isSafeToReload: false, alreadyReloadedForBuild: false })).toBe(false);
    expect(shouldReloadAfterControllerChange({ hadController: true, isSafeToReload: true, alreadyReloadedForBuild: true })).toBe(false);
    expect(shouldReloadAfterControllerChange({ hadController: true, isSafeToReload: true, alreadyReloadedForBuild: false })).toBe(true);
  });
});
