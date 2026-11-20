type ApiErrorPayload = {
  error?: unknown;
  message?: unknown;
  details?: unknown;
  fieldErrors?: unknown;
  retryAfterSeconds?: unknown;
};

const errorMessages: Record<string, string> = {
  AUTHENTICATION_REQUIRED: "Tu sesión no es válida o ha caducado. Inicia sesión de nuevo.",
  FORBIDDEN: "Esta cuenta no tiene permisos para realizar esta acción en Partners.",
  PASSWORD_CHANGE_REQUIRED: "Debes cambiar la contraseña temporal antes de operar.",
  INVALID_CREDENTIALS: "El correo o la contraseña no son correctos.",
  INVALID_LOGIN: "Introduce un correo válido y una contraseña de al menos 8 caracteres.",
  INVALID_CURRENT_PASSWORD: "La contraseña temporal actual no es correcta.",
  INVALID_PASSWORD_CHANGE: "La nueva contraseña debe tener entre 12 y 200 caracteres e incluir al menos una mayúscula, una minúscula y un número.",
  PASSWORD_RESET_INVALID: "El enlace de recuperación no es válido o ha caducado. Solicita un nuevo enlace e inténtalo de nuevo.",
  PARTNER_RESTAURANT_NOT_ASSIGNED: "Tu cuenta Partner no tiene un comercio asignado. Contacta con Administración de PIKI.",
  RESTAURANT_NOT_FOUND: "No se ha encontrado el comercio asignado a esta cuenta.",
  INVALID_ORDER_TRANSITION: "El pedido ya no admite ese cambio de estado. Actualiza la lista e inténtalo de nuevo.",
  PAYMENT_NOT_CONFIRMED: "No puedes aceptar este pedido hasta que el pago esté confirmado.",
  ORDER_NOT_FOUND: "El pedido ya no está disponible para este comercio.",
  ORDER_CHANGED_RETRY: "El pedido cambió mientras lo gestionabas. Actualiza la lista e inténtalo de nuevo.",
  MENU_IMAGE_TOO_LARGE: "La imagen supera el límite máximo de 200 KB.",
  INVALID_MENU: "La carta contiene datos no válidos. Revisa el producto e inténtalo de nuevo.",
  PARTNER_TAX_ID_ALREADY_EXISTS: "Ya existe una solicitud o comercio con este NIF/CIF.",
  REQUIRED_PARTNER_DOCUMENTS_MISSING: "Falta alguno de los cinco documentos obligatorios.",
  PARTNER_DOCUMENT_CHECKSUM_MISMATCH: "No se ha podido verificar uno de los documentos. Vuelve a seleccionarlo e inténtalo de nuevo.",
};

function asPayload(value: unknown): ApiErrorPayload {
  return value && typeof value === "object" ? value as ApiErrorPayload : {};
}

export function apiErrorMessage(value: unknown, status: number, fallback: string): string {
  const payload = asPayload(value);
  const code = typeof payload.error === "string" ? payload.error : "";
  const message = typeof payload.message === "string" ? payload.message.trim() : "";

  if (errorMessages[code]) return errorMessages[code];
  if (status === 429) {
    const seconds = payload.retryAfterSeconds;
    if (typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0) {
      const minutes = Math.max(1, Math.ceil(seconds / 60));
      return `Demasiados intentos. Espera ${minutes === 1 ? "un minuto" : `${minutes} minutos`} antes de volver a intentarlo.`;
    }
    return "Demasiados intentos. Espera un minuto antes de volver a intentarlo.";
  }
  if (status >= 500) return "El servicio de PIKI no está disponible ahora. Inténtalo de nuevo en unos minutos.";
  return message || fallback;
}

export async function getApiErrorMessage(response: Response, fallback: string): Promise<string> {
  return apiErrorMessage(await response.json().catch(() => null), response.status, fallback);
}

export function getNetworkErrorMessage(fallback = "No se ha podido contactar con PIKI. Comprueba tu conexión e inténtalo de nuevo."): string {
  return fallback;
}

export function fieldErrorsFromApiPayload(value: unknown): string {
  const payload = asPayload(value);
  const details = asPayload(payload.details);
  const fieldErrors = asPayload(details.fieldErrors);
  return Object.entries(fieldErrors)
    .map(([field, messages]) => `${field}: ${Array.isArray(messages) ? messages.filter((message): message is string => typeof message === "string").join(", ") : ""}`)
    .filter(Boolean)
    .join(" · ");
}
