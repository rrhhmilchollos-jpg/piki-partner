import { describe, expect, it } from "vitest";
import { apiErrorMessage } from "./api";

describe("mensajes de recuperación Partner", () => {
  it("respeta los quince minutos de bloqueo que indica la API", () => {
    expect(apiErrorMessage({ error: "RATE_LIMITED", retryAfterSeconds: 900 }, 429, "Error"))
      .toBe("Demasiados intentos. Espera 15 minutos antes de volver a intentarlo.");
  });

  it("redondea hacia arriba la espera sin acortarla", () => {
    expect(apiErrorMessage({ retryAfterSeconds: 61 }, 429, "Error"))
      .toBe("Demasiados intentos. Espera 2 minutos antes de volver a intentarlo.");
  });

  it("no confía en valores de espera inválidos", () => {
    for (const seconds of [undefined, -1, 0, NaN, Infinity, "900"]) {
      expect(apiErrorMessage({ retryAfterSeconds: seconds }, 429, "Error"))
        .toBe("Demasiados intentos. Espera un minuto antes de volver a intentarlo.");
    }
  });

  it("mantiene el mensaje genérico de recuperación sin afirmar entrega", () => {
    const message = "Si el correo corresponde a una cuenta PIKI activa, recibirás un enlace para crear una contraseña nueva.";
    expect(apiErrorMessage({ message }, 202, "Error")).toBe(message);
  });

  it.each([undefined, "Detalle interno de cuenta/token que no debe mostrarse"])("traduce PASSWORD_RESET_INVALID sin revelar datos (%s)", (message) => {
    expect(apiErrorMessage({ error: "PASSWORD_RESET_INVALID", message }, 400, "Error"))
      .toBe("El enlace de recuperación no es válido o ha caducado. Solicita un nuevo enlace e inténtalo de nuevo.");
  });

  it("explica el rango completo de la contraseña", () => {
    expect(apiErrorMessage({ error: "INVALID_PASSWORD_CHANGE" }, 400, "Error"))
      .toBe("La nueva contraseña debe tener entre 12 y 200 caracteres e incluir al menos una mayúscula, una minúscula y un número.");
  });
});
