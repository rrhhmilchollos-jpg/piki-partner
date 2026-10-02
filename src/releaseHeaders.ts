import { apiOrigin } from "./partnerApi";
import { PIKI_RELEASE } from "./release-meta";

const apiHost = new URL(apiOrigin, window.location.origin).origin;

type ReleaseWindow = typeof window & { __pikiReleaseFetchInstalled?: boolean };

/** Adds PIKI release metadata to same-origin API proxy calls exactly once. */
export function installPikiReleaseHeaders(): void {
  const state = window as ReleaseWindow;
  if (state.__pikiReleaseFetchInstalled) return;
  state.__pikiReleaseFetchInstalled = true;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = new URL(
      typeof input === "string" || input instanceof URL ? input : input.url,
      window.location.origin,
    );
    if (requestUrl.origin !== apiHost) return nativeFetch(input, init);

    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    headers.set("X-PIKI-Surface", PIKI_RELEASE.surface);
    headers.set("X-PIKI-Client-Version", PIKI_RELEASE.version);
    headers.set("X-PIKI-Client-Build", PIKI_RELEASE.buildId);

    if (input instanceof Request) return nativeFetch(new Request(input, { ...init, headers }));
    return nativeFetch(input, { ...init, headers });
  };
}
