export function resolvePartnerApiOrigin(input: { production: boolean; native: boolean; configured?: string }): string {
  // Only a hosted web page has Vercel's same-origin proxy. Android is https://localhost.
  if (!input.native) return (input.production ? "/piki-api" : (input.configured?.trim() || "/piki-api")).replace(/\/$/, "");
  const origin = input.configured?.trim() || "https://api.pikidelivery.com";
  const url = new URL(origin);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("Partner nativo requiere VITE_API_URL como origen HTTPS absoluto, sin ruta ni credenciales.");
  }
  return url.origin;
}
