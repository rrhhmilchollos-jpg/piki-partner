const emailKey = (host: string) => `piki-${host}-login-email`;
export function getStoredEmail(): string {
  try { return localStorage.getItem(emailKey(location.hostname)) || ""; } catch { return ""; }
}
export function storeEmail(email: string): void {
  const value = email.trim().toLowerCase();
  try {
    if (value.includes("@")) localStorage.setItem(emailKey(location.hostname), value);
  } catch { /* almacenamiento no disponible */ }
}
export function forgetEmail(): void {
  try { localStorage.removeItem(emailKey(location.hostname)); } catch { /* noop */ }
}
