import { describe, expect, it } from "vitest";
import { readPasswordRecoveryLink } from "./passwordRecoveryLink";

describe("password recovery link", () => {
  it("keeps the reset secret in memory input and removes it from the visible path", () => {
    expect(readPasswordRecoveryLink("https://partner.example/login?next=orders&reset=one-time-token#access")).toEqual({
      token: "one-time-token",
      cleanPath: "/login?next=orders#access",
    });
  });

  it("does not alter ordinary login links", () => {
    expect(readPasswordRecoveryLink("https://partner.example/login?next=orders#access")).toEqual({
      token: "",
      cleanPath: null,
    });
  });

  it("also removes an empty reset parameter without entering reset mode", () => {
    expect(readPasswordRecoveryLink("/login?reset=&next=orders")).toEqual({
      token: "",
      cleanPath: "/login?next=orders",
    });
  });
});
