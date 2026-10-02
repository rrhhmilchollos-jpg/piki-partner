import { describe, expect, it } from "vitest";
import { isMenuFile, isMenuImage, prepareMenuImage, validateMenuFile, MAX_MENU_FILE_BYTES } from "../src/menuAsset";

describe("menu asset uploads", () => {
  it("accepts common menu image formats", () => {
    expect(isMenuImage(new File(["photo"], "menu.webp", { type: "image/webp" }))).toBe(true);
    expect(isMenuImage(new File(["photo"], "menu.gif", { type: "image/gif" }))).toBe(true);
    expect(isMenuImage(new File(["photo"], "menu.heic", { type: "image/heic" }))).toBe(false);
  });

  it("accepts PDF menus and rejects oversized documents", () => {
    expect(isMenuFile(new File(["%PDF-1.7"], "carta.pdf", { type: "application/pdf" }))).toBe(true);
    expect(() => validateMenuFile(new File([new Uint8Array(MAX_MENU_FILE_BYTES + 1)], "carta.pdf", { type: "application/pdf" }))).toThrow("4 MB");
  });

  it("explains unsupported image formats", async () => {
    await expect(prepareMenuImage(new File(["photo"], "menu.heic", { type: "image/heic" }))).rejects.toThrow("WEBP, JPG, JPEG, PNG o GIF");
  });
});
