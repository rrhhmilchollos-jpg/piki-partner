const emailKey = (host: string) => `piki-${host}-login-email`;
export function getStoredEmail(): string {
  try { localStorage.removeItem(emailKey(location.hostname)); } catch { /* almacenamiento no disponible */ }
  return "";
}
export function storeEmail(_email: string): void { /* No recordar identidades en dispositivos compartidos. */ }
export function forgetEmail(): void {
  try { localStorage.removeItem(emailKey(location.hostname)); } catch { /* noop */ }
}
