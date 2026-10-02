import { describe, expect, it } from "vitest";
import { bytesToBase64, prepareMenuImage } from "../src/menuImage";

describe("menu image uploads", () => {
  it("encodes image bytes as base64 for the API payload", () => {
    expect(bytesToBase64(new TextEncoder().encode("PIKI"))).toBe("UElLSQ==");
  });

  it("explains that unsupported phone image formats must be converted", async () => {
    const file = new File(["photo"], "menu.heic", { type: "image/heic" });
    await expect(prepareMenuImage(file)).rejects.toThrow("WEBP, JPG, JPEG o PNG");
  });
});
