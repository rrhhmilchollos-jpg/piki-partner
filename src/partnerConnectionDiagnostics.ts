import type { HttpOptions, HttpResponse } from "@capacitor/core";

export const PARTNER_CONNECTION_TIMEOUT_MS = 8000;
export type PartnerConnectionDependencies = {
  isNativePlatform: () => boolean;
  getPlatform: () => string;
  isNativeHttpAvailable: () => boolean;
  nativeGet: (options: HttpOptions) => Promise<HttpResponse>;
  fetch: typeof globalThis.fetch;
  now: () => number;
};
export type PartnerConnectionResult = {
  ok: boolean;
  url: string;
  platform: string;
  deviceUtc: string;
  httpStatus?: number;
  errorCode?: string;
  errorMessage?: string;
  guidance: string;
  clockDifferenceSeconds?: number;
};

// Never stringify an error, response body or headers: they may contain credentials.
export function sanitizePartnerDiagnosticText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\b(?:set-cookie|cookie)\b\s*[:=][^\r\n]*/gi, "[cookies ocultas]")
    .replace(/https?:\/\/[^\s<>"']+/gi, (url) => {
      try { const parsed = new URL(url); return `${parsed.protocol}//${parsed.host}${parsed.pathname}${parsed.search ? "?[oculto]" : ""}`; }
      catch { return "[URL oculta]"; }
    })
    .replace(/\bBearer\s+\S+/gi, "Bearer [oculto]")
    .replace(/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?\b/g, "[token oculto]")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[email oculto]")
    .replace(/(?:["']?\b(?:password|passwd|contraseña|token|access_token|refresh_token|authorization|cookie|set-cookie|secret)\b["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "[dato oculto]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[dato oculto]")
    // eslint-disable-next-line no-control-regex -- Deliberately remove control characters from displayed diagnostics.
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .slice(0, 180);
}

function errorFields(reason: unknown): { code: string; message: string; name: string } {
  if (reason === null || typeof reason !== "object") return { code: "", message: typeof reason === "string" ? reason : "", name: "" };
  const value = reason as { code?: unknown; message?: unknown; name?: unknown };
  return {
    code: typeof value.code === "string" || typeof value.code === "number" ? String(value.code) : "",
    message: typeof value.message === "string" ? value.message : "",
    name: typeof value.name === "string" ? value.name : "",
  };
}

function connectionGuidance(reason: unknown, diagnosticProbe = false): string | undefined {
  const { code, message, name } = errorFields(reason);
  const diagnostic = `${code} ${name} ${message}`;
  if (/SSLHandshakeException|certificateChain|certpath|ERR_CERT_/i.test(diagnostic)) return "Posible problema de fecha o certificado TLS. Revisa fecha y hora automáticas; no desactives la seguridad TLS. La causa no está confirmada.";
  if (/UnknownHostException|ERR_NAME_NOT_RESOLVED/i.test(diagnostic)) return "No se ha resuelto el nombre del servidor (DNS). Revisa la red o consulta al soporte; la causa no está confirmada.";
  if (/SocketTimeoutException/i.test(diagnostic) || /timeout|timed_out/i.test(code) || (diagnosticProbe && /timeout|timed out/i.test(message))) return "La conexión ha agotado el tiempo de espera. Revisa la red; no permite confirmar la causa.";
  if (((name === "TypeError" || diagnosticProbe) && /failed to fetch|networkerror|load failed/i.test(message)) || /ERR_NETWORK|NETWORK_ERROR/i.test(code)) return "El navegador/WebView no ha podido conectar. Puede ser red, DNS, TLS o restricciones del navegador; no se puede determinar la causa solo con este error.";
  if (/UNIMPLEMENTED|UNAVAILABLE|NATIVE_HTTP_UNAVAILABLE/i.test(code)) return "El método HTTP nativo no está disponible. No se ha usado otro transporte ni evitado TLS.";
  return undefined;
}

/** Only transport failures are translated; normal authentication Errors keep their message. */
export function getPartnerTransportErrorMessage(reason: unknown): string {
  const { code, name } = errorFields(reason);
  const nativeCode = Boolean(code) || /SSLHandshakeException|UnknownHostException|SocketTimeoutException/.test(name);
  const guidance = nativeCode || name === "TypeError" ? connectionGuidance(reason) : undefined;
  return guidance || (reason instanceof Error ? reason.message : "No se ha podido completar la solicitud.");
}

export function getPartnerReadyUrl(apiOrigin: string, nativeAndroid: boolean): string {
  // Web production has a same-origin proxy; do not accept arbitrary relative paths.
  if (!nativeAndroid && (apiOrigin === "/piki-api" || apiOrigin === "/piki-api/")) return "/piki-api/ready";
  if (apiOrigin !== apiOrigin.trim() || /[\s\\]/.test(apiOrigin)) throw new Error("El origen API debe ser HTTPS absoluto, sin ruta ni credenciales.");
  const url = new URL(apiOrigin);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("El origen API debe ser HTTPS absoluto, sin ruta ni credenciales.");
  }
  return `${url.origin}/ready`;
}

function readServerDate(headers: unknown): number | undefined {
  if (!headers || typeof headers !== "object") return undefined;
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === "date");
  if (!entry || typeof entry[1] !== "string") return undefined;
  const date = Date.parse(entry[1]);
  return Number.isFinite(date) ? date : undefined;
}

/** Single user-triggered GET; callers supply dependencies so tests never touch a real API. */
export async function probePartnerConnection(apiOrigin: string, dependencies: PartnerConnectionDependencies): Promise<PartnerConnectionResult> {
  const started = dependencies.now();
  const platform = dependencies.getPlatform();
  const nativeAndroid = dependencies.isNativePlatform() && platform === "android";
  const result: PartnerConnectionResult = { ok: false, url: "Configuración API no válida", platform, deviceUtc: new Date(started).toISOString(), guidance: "" };
  try {
    try { result.url = getPartnerReadyUrl(apiOrigin, nativeAndroid); }
    catch { throw { code: "INVALID_API_ORIGIN", message: "El origen API debe ser HTTPS absoluto, sin ruta ni credenciales; en web se admite /piki-api." }; }
    let response: Pick<HttpResponse, "status" | "data" | "headers">;
    if (nativeAndroid) {
      if (!dependencies.isNativeHttpAvailable()) throw { code: "NATIVE_HTTP_UNAVAILABLE", message: "CapacitorHttp.get no disponible." };
      response = await dependencies.nativeGet({ url: result.url, connectTimeout: PARTNER_CONNECTION_TIMEOUT_MS, readTimeout: PARTNER_CONNECTION_TIMEOUT_MS, responseType: "json", disableRedirects: true });
    } else {
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, PARTNER_CONNECTION_TIMEOUT_MS);
      try {
        const webResponse = await dependencies.fetch(result.url, { method: "GET", credentials: "omit", redirect: "error", signal: controller.signal });
        result.httpStatus = webResponse.status;
        const date = webResponse.headers.get("date");
        const serverTime = date ? Date.parse(date) : NaN;
        if (Number.isFinite(serverTime)) result.clockDifferenceSeconds = Math.round((dependencies.now() - serverTime) / 1000);
        let data: unknown;
        try { data = await webResponse.json(); }
        catch (reason) { if (timedOut) throw reason; throw { code: "INVALID_READY_JSON", message: "La respuesta de /ready no es JSON válido." }; }
        response = { status: webResponse.status, data, headers: date ? { date } : {} };
      } catch (reason) {
        if (timedOut) throw { code: "WEB_TIMEOUT", message: "Tiempo de espera de 8000 ms agotado." };
        throw reason;
      } finally { clearTimeout(timer); }
    }
    result.httpStatus = response.status;
    const serverTime = readServerDate(response.headers);
    if (serverTime !== undefined) result.clockDifferenceSeconds = Math.round((dependencies.now() - serverTime) / 1000);
    if (response.status !== 200) throw { code: "READY_HTTP_STATUS", message: `El endpoint /ready respondió HTTP ${response.status}.` };
    const data: unknown = response.data;
    if (!data || typeof data !== "object" || (data as { service?: unknown }).service !== "piki-api" || (data as { status?: unknown }).status !== "ready") {
      throw { code: "INVALID_READY_RESPONSE", message: "La respuesta no confirma service=piki-api y status=ready." };
    }
    result.ok = true;
    result.guidance = "Conexión con /ready confirmada. Esta prueba no valida el usuario ni la contraseña.";
  } catch (reason) {
    const fields = errorFields(reason);
    const safeCode = sanitizePartnerDiagnosticText(fields.code || fields.name);
    result.errorCode = /^[A-Za-z0-9._-]{1,180}$/.test(safeCode) ? safeCode : "UNKNOWN_ERROR";
    result.errorMessage = sanitizePartnerDiagnosticText(fields.message) || "Sin descripción disponible.";
    result.guidance = connectionGuidance(reason, true) || "No se ha podido confirmar la conexión. Este resultado no determina la causa; facilita una foto del panel al soporte.";
  }
  if (result.clockDifferenceSeconds !== undefined && Math.abs(result.clockDifferenceSeconds) > 300) {
    result.guidance += " El reloj difiere más de 5 minutos del servidor: activa fecha y hora automáticas y vuelve a comprobar. No desactives TLS.";
  }
  return result;
}
