/// <reference types="node" />
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PartnerAccountIdentity, { AccountPhoto } from "./PartnerAccountIdentity";
import { accountPhotoDimensions, accountPhotoUrl, acknowledgedAccountPhoto, prepareAccountPhoto } from "./accountPhoto";
import { displayRole, hasPermission, normalisePartnerProfile } from "./partnerApi";

vi.mock("./pwaUpdateRuntime", () => ({ usePwaUpdateBlocker: () => undefined }));
const photo = "data:image/jpeg;base64,AQID";
afterEach(() => vi.unstubAllGlobals());

const longName = "María del Carmen Fernández de la Vega y Rodríguez de los Santos";
const profile = () => normalisePartnerProfile({ employee: {
  id: "real-account", name: "Nombre antiguo", fullName: longName, photoUrl: photo,
  jobRole: "Coordinadora de operaciones", role: "fleet_dispatch_v2", primaryRole: "owner", surface: "partner",
  memberships: [{ restaurant: { id: "local", name: "Restaurante" }, roles: ["kitchen"] }],
} });

describe("Partner canonical account identity (offline)", () => {
  it("keeps full name, real job and active employee role separate from local assignment and ACL", () => {
    const result = profile();
    expect(result).toMatchObject({ id: "real-account", name: longName, fullName: longName, jobRole: "Coordinadora de operaciones", role: "fleet_dispatch_v2", photoUrl: photo });
    expect(result.locations[0].roles).toEqual(["kitchen"]);
    expect(hasPermission(result.locations[0], "orders:prepare")).toBe(true);
    expect(hasPermission(result.locations[0], "menu:write")).toBe(false);
    expect(displayRole("fleet_dispatch_v2")).toBe("fleet_dispatch_v2");
  });
  it("renders complete long names and actual role instead of restaurant/surface/primaryRole", () => {
    const html = renderToStaticMarkup(<PartnerAccountIdentity profile={profile()} token="offline" identityKey="A" isCurrentSession={() => true} onUnauthorized={() => undefined} onPhotoSaved={() => undefined} />);
    expect(html).toContain(longName);
    expect(html).toContain("Puesto: Coordinadora de operaciones");
    expect(html).toContain("Rol activo: fleet_dispatch_v2");
    expect(html).not.toContain("Propietario");
    expect(html).not.toContain("Restaurante");
    expect(html).toContain(`Foto propia de ${longName}`);
    expect(html).toContain("Cambiar foto propia");
    expect(html).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(html).not.toContain("capture=");
  });
  it("uses legacy canonical name only, without inventing a missing name/job/session role", () => {
    expect(normalisePartnerProfile({ employee: { name: "Nombre completo legado", email: "test@example.invalid", primaryRole: "owner" } })).toMatchObject({ fullName: "Nombre completo legado", role: "", jobRole: "", photoUrl: null });
    const missing = normalisePartnerProfile({ employee: { email: "not-a-name@example.invalid" } });
    expect(missing.fullName).toBe("");
    const html = renderToStaticMarkup(<PartnerAccountIdentity profile={missing} token="offline" identityKey="A" isCurrentSession={() => true} onUnauthorized={() => undefined} onPhotoSaved={() => undefined} />);
    expect(html).toContain("Nombre no disponible");
    expect(html).toContain("Puesto: No informado");
    expect(html).toContain("Rol activo: No informado");
    expect(html).not.toContain("not-a-name");
    expect(html).toContain("Añadir foto propia");
  });
  it.each([null, "data:image/svg+xml;base64,AQID", "https://api.dicebear.com/9.x/personas/svg?seed=A"])("renders a neutral no-photo fallback for %s", (photoUrl) => {
    const html = renderToStaticMarkup(<AccountPhoto photoUrl={photoUrl} fullName={longName} />);
    expect(html).toContain("Sin foto");
    expect(html).not.toContain("<img");
  });
  it("keeps the identity name visible and wrapped in mobile CSS, with safe-area padding", () => {
    const css = readFileSync(new URL("./PartnerAccountIdentity.css", import.meta.url), "utf8");
    expect(css).toContain("overflow-wrap: anywhere");
    expect(css).toContain("white-space: normal");
    expect(css).toContain("env(safe-area-inset-top");
    expect(css).not.toMatch(/display:\s*none|text-overflow:\s*ellipsis|white-space:\s*nowrap/);
  });
});

describe("Own raster photo helpers (offline)", () => {
  it.each([[4000, 2000, 256, 128], [2000, 4000, 128, 256], [256, 256, 256, 256], [12, 30, 12, 30], [1, 9000, 1, 256]])("sizes %sx%s without upscaling", (width, height, outputWidth, outputHeight) => {
    expect(accountPhotoDimensions(width, height)).toEqual({ width: outputWidth, height: outputHeight });
  });
  it.each([[0, 1], [1, 0], [NaN, 2], [Infinity, 2], [-1, 2]])("rejects invalid dimensions %s/%s", (width, height) => expect(() => accountPhotoDimensions(width, height)).toThrow());
  it.each(["javascript:alert(1)", "data:image/svg+xml;base64,AQID", "data:image/gif;base64,AQID", "https://api.dicebear.com/9.x/avataaars/png", "https://example.invalid/a.svg", `data:image/jpeg;base64,${"A".repeat(220000)}`])("rejects unsafe/oversized photo fixture %#", (value) => {
    expect(accountPhotoUrl(value)).toBeNull();
  });
  it("accepts raster data URLs and supplied HTTPS photos", () => {
    expect(accountPhotoUrl(photo)).toBe(photo);
    expect(accountPhotoUrl("https://uploads.example.invalid/photo-123")).toBe("https://uploads.example.invalid/photo-123");
  });
  it("acknowledges only photo, preserving server null and legacy success without introducing other fields", () => {
    expect(acknowledgedAccountPhoto({ employee: { photoUrl: null, role: "owner" } }, photo)).toBeNull();
    expect(acknowledgedAccountPhoto({ photoUrl: photo }, null)).toBe(photo);
    expect(acknowledgedAccountPhoto({}, photo)).toBe(photo);
    expect(() => acknowledgedAccountPhoto({ photoUrl: "javascript:alert(1)" }, photo)).toThrow();
  });
  it.each(["image/jpeg", "image/png", "image/webp"])("reduces selected %s to JPEG .8, <=256 px, and releases the temporary object URL", async (type) => {
    const bytes = type === "image/jpeg" ? [0xff, 0xd8, 0xff] : type === "image/png" ? [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] : [...new TextEncoder().encode("RIFF1234WEBP")];
    const file = new File([new Uint8Array(bytes)], "selected", { type });
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fixture");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.stubGlobal("Image", class {
      naturalWidth = 4000; naturalHeight = 2000; onload!: () => void;
      set src(_value: string) { this.onload(); }
    });
    const context = { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => context), toDataURL: vi.fn(() => photo) };
    vi.stubGlobal("document", { createElement: vi.fn(() => canvas) });
    expect(await prepareAccountPhoto(file)).toBe(photo);
    expect(canvas).toMatchObject({ width: 256, height: 128 });
    expect(canvas.toDataURL).toHaveBeenCalledWith("image/jpeg", 0.8);
    expect(context.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 256, 128);
    expect(context.fillStyle).toBe("#ffffff");
    expect(revoke).toHaveBeenCalledWith("blob:fixture");
    create.mockRestore(); revoke.mockRestore();
  });
  it.each(["image/svg+xml", "image/gif", "text/plain", ""])("rejects selection MIME %s", async (type) => {
    await expect(prepareAccountPhoto(new File(["invalid"], "selected", { type }))).rejects.toThrow("JPEG, PNG o WebP");
  });
  it("rejects a disguised SVG before image decode", async () => {
    await expect(prepareAccountPhoto(new File(["<svg>spoof</svg>"], "spoof.png", { type: "image/png" }))).rejects.toThrow("válida");
  });
});

describe("Own raster encoding failures (offline)", () => {
  it.each(["oversized", "invalid-output", "decode-error"])("rejects %s and releases the temporary image URL", async (failure) => {
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "own.jpg", { type: "image/jpeg" });
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:temporary-own-photo");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.stubGlobal("Image", class {
      naturalWidth = 300; naturalHeight = 300;
      onload!: () => void; onerror!: () => void;
      set src(_value: string) { if (failure === "decode-error") this.onerror(); else this.onload(); }
    });
    const context = { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
    vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0, getContext: () => context,
      toDataURL: () => failure === "oversized" ? `data:image/jpeg;base64,${"A".repeat(220000)}` : "data:image/svg+xml;base64,AQID",
    }) });
    await expect(prepareAccountPhoto(file)).rejects.toThrow(failure === "oversized" ? "tamaño permitido" : failure === "decode-error" ? "No se pudo leer" : "JPEG válida");
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:temporary-own-photo");
    create.mockRestore(); revoke.mockRestore();
  });
});
