import { Capacitor, CapacitorHttp, type HttpOptions, type HttpResponse } from "@capacitor/core";
import { apiOrigin } from "./partnerApi";

export type PartnerNativeApiFetchOptions = {
  browserFetch: typeof fetch;
  nativeAndroid: boolean;
  apiOrigin: string;
  httpRequest: (options: HttpOptions) => Promise<HttpResponse>;
};

const TRUSTED_ORIGIN = "https://api.pikidelivery.com";
const JSON_ROUTES = [
  /^\/api\/v1\/auth\/employee\/(?:login|logout|me|profile|change-password|password-reset\/(?:request|confirm))$/,
  /^\/api\/v1\/partners\/(?:profile|locations|onboarding|store\/(?:status|hours)|menu|metrics\/overview|support\/tickets)$/,
  /^\/api\/v1\/partners\/kitchen\/orders(?:\/archive|\/[A-Za-z0-9_-]+\/(?:status|partner-payment|actions))?$/,
  /^\/api\/v1\/partners\/google-business\/(?:status|connect|locations|location|sync|publish-hours)$/,
  /^\/api\/v1\/restaurants\/[A-Za-z0-9_-]+\/menu\/items\/[A-Za-z0-9_-]+\/availability$/,
  /^\/api\/v1\/notifications(?:\/read-all|\/[A-Za-z0-9_-]+\/read)?$/,
  /^\/api\/v1\/(?:app-version|push\/(?:config|subscriptions))$/,
];
const INIT_KEYS = new Set(["method", "headers", "body", "signal", "cache", "credentials", "mode", "redirect", "integrity", "keepalive", "referrer", "referrerPolicy"]);

function trustedOrigin(configured: string): string | null {
  try {
    const url = new URL(configured);
    return url.origin === TRUSTED_ORIGIN && url.protocol === "https:" && !url.username && !url.password
      && !url.search && !url.hash && url.pathname === "/" ? url.origin : null;
  } catch { return null; }
}

function unsupportedOptions(options: RequestInit): boolean {
  return Object.keys(options).some((key) => !INIT_KEYS.has(key))
    || (options.mode !== undefined && options.mode !== "cors")
    || (options.credentials !== undefined && options.credentials !== "same-origin")
    || (options.redirect !== undefined && options.redirect !== "follow")
    || (options.cache !== undefined && !["default", "no-store", "no-cache"].includes(options.cache))
    || Boolean(options.integrity || options.keepalive || options.referrerPolicy)
    || (options.referrer !== undefined && options.referrer !== "about:client");
}

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

function checkAbort(signal?: AbortSignal | null): void {
  if (signal?.aborted) throw abortError();
}

/** Native HTTP cannot be cancelled: reject locally and discard its late result.
 * Both native timeouts remain bounded; never retry/fallback after dispatch.
 */
function abortable<T>(run: () => Promise<T>, signal?: AbortSignal | null): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    const onAbort = () => { cleanup(); reject(abortError()); };
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) { onAbort(); return; }
    try {
      run().then((value) => {
        cleanup();
        if (signal?.aborted) reject(abortError());
        else resolve(value);
      }, (error: unknown) => { cleanup(); reject(error); });
    } catch (error) { cleanup(); reject(error); }
  });
}

function isJsonContentType(value: string | null): boolean {
  return Boolean(value && /^application\/(?:json|[\w.-]+\+json)(?:\s*;|\s*$)/i.test(value));
}

/** Only vetted JSON API calls cross the bridge. Every other call retains the
 * original input/init and browser implementation (especially SSE and uploads).
 * No Capacitor global fetch/XHR patch or TLS/config changes are required.
 */
export function createPartnerNativeApiFetch(options: PartnerNativeApiFetchOptions): typeof fetch {
  const origin = trustedOrigin(options.apiOrigin);
  return async (input, init) => {
    const delegate = () => options.browserFetch(input, init);
    if (!options.nativeAndroid || !origin) return delegate();
    const request = input instanceof Request ? input : undefined;
    let url: URL;
    try {
      // No native rewriting of web proxy/relative URLs.
      url = new URL(request ? request.url : String(input));
    } catch { return delegate(); }
    if (url.origin !== origin || url.username || url.password || url.hash
      || !JSON_ROUTES.some((route) => route.test(url.pathname))) return delegate();
    if (init && unsupportedOptions(init)) return delegate();
    if (request && (request.bodyUsed || unsupportedOptions({
      mode: request.mode, credentials: request.credentials, redirect: request.redirect,
      cache: request.cache, integrity: request.integrity, keepalive: request.keepalive,
      referrer: request.referrer, referrerPolicy: request.referrerPolicy,
    }))) return delegate();
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
    if (!["GET", "HEAD", "DELETE", "POST", "PATCH", "PUT"].includes(method)) return delegate();
    const headers = new Headers(request?.headers);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    const accept = headers.get("accept") || "";
    if (headers.has("content-type") && !isJsonContentType(headers.get("content-type"))) return delegate();
    if (/text\/event-stream|image\/|audio\/|video\/|application\/(?:octet-stream|pdf)/i.test(accept)
      || headers.has("range")) return delegate();
    const hasInitBody = init?.body != null;
    const hasRequestBody = Boolean(request?.body) && !hasInitBody;
    const hasBody = hasInitBody || hasRequestBody;
    if (hasBody && (["GET", "HEAD", "DELETE"].includes(method)
      || !isJsonContentType(headers.get("content-type"))
      || (hasInitBody && typeof init?.body !== "string"))) return delegate();
    const signal = init?.signal !== undefined ? init.signal : request?.signal;
    checkAbort(signal);
    let data: string | undefined;
    if (hasBody) {
      if (hasInitBody) data = init!.body as string;
      else {
        // Only inspect a clone: unsupported/invalid JSON still uses the original.
        try { data = await abortable(() => request!.clone().text(), signal); }
        catch (error) {
          checkAbort(signal);
          // A locked/opaque Request cannot safely cross the bridge.
          if (error instanceof TypeError) return delegate();
          throw error;
        }
      }
      checkAbort(signal);
      try {
        const parsed: unknown = JSON.parse(data!);
        if (parsed === null || typeof parsed !== "object") return delegate();
      } catch { return delegate(); }
    }
    checkAbort(signal);
    const nativeHeaders: Record<string, string> = {};
    headers.forEach((value, key) => { nativeHeaders[key] = value; });
    const result = await abortable(() => options.httpRequest({
      url: url.href, method, headers: nativeHeaders,
      ...(data === undefined ? {} : { data }),
      responseType: "text", connectTimeout: 8000, readTimeout: 8000, disableRedirects: true,
    }), signal);
    checkAbort(signal);
    const noBody = method === "HEAD" || [204, 205, 304].includes(result.status);
    const body = noBody || result.data == null ? null
      : typeof result.data === "string" ? result.data : JSON.stringify(result.data);
    return new Response(body, { status: result.status, headers: new Headers(result.headers) });
  };
}

type TransportWindow = Window & { __pikiPartnerNativeApiTransportInstalled?: boolean };

/** Install BEFORE installPikiReleaseHeaders so its metadata reaches this bridge. */
export function installPartnerNativeApiTransport(): void {
  if (typeof window === "undefined" || !Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return;
  const state = window as TransportWindow;
  if (state.__pikiPartnerNativeApiTransportInstalled || !trustedOrigin(apiOrigin)) return;
  const browserFetch = window.fetch.bind(window);
  window.fetch = createPartnerNativeApiFetch({
    browserFetch, nativeAndroid: true, apiOrigin,
    httpRequest: (options) => CapacitorHttp.request(options),
  });
  state.__pikiPartnerNativeApiTransportInstalled = true;
}
