export function shouldClearPartnerSession(status: number): boolean {
  return status === 401 || status === 428;
}

export function partnerSessionIssue(status?: number): string {
  if (status === 403) return "Tu sesión es válida, pero no tiene acceso a esta superficie. Contacta con el administrador PIKI.";
  if (status && status >= 500) return "PIKI está comprobando el servicio. Tu sesión sigue guardada: inténtalo de nuevo en unos segundos.";
  return "No se ha podido comprobar la conexión. Tu sesión sigue guardada: vuelve a intentarlo.";
}
