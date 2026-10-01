export const PARTNER_RELEASE_VERSION = "0.3.0";
export const PARTNER_SURFACE = "partner";

export type ReleaseManifest = {
  version?: unknown;
  minimumVersion?: unknown;
  surface?: unknown;
};

export type RequiredRelease = {
  version: string;
  minimumVersion: string;
};

function versionParts(value: string): number[] | null {
  if (!/^\d+(?:\.\d+){1,3}$/.test(value)) return null;
  return value.split(".").map(Number);
}

export function isVersionNewer(candidate: string, current: string): boolean {
  const candidateParts = versionParts(candidate);
  const currentParts = versionParts(current);
  if (!candidateParts || !currentParts) return false;

  const length = Math.max(candidateParts.length, currentParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (candidateParts[index] ?? 0) - (currentParts[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
}

export function getRequiredRelease(manifest: ReleaseManifest): RequiredRelease | null {
  const version = typeof manifest.version === "string" ? manifest.version : "";
  const minimumVersion = typeof manifest.minimumVersion === "string" ? manifest.minimumVersion : "";
  if (manifest.surface !== PARTNER_SURFACE || !versionParts(version) || !versionParts(minimumVersion)) return null;
  return isVersionNewer(minimumVersion, PARTNER_RELEASE_VERSION) ? { version, minimumVersion } : null;
}

export async function checkRequiredPartnerRelease(): Promise<RequiredRelease | null> {
  const response = await fetch("/release.json", {
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return null;
  return getRequiredRelease(await response.json() as ReleaseManifest);
}

const updateAttemptKey = (minimumVersion: string) => `piki-partner-update-reload:${minimumVersion}`;

export async function updateServiceWorkerAndReloadOnce(minimumVersion: string): Promise<"reloading" | "already-attempted"> {
  const key = updateAttemptKey(minimumVersion);
  if (sessionStorage.getItem(key)) return "already-attempted";
  sessionStorage.setItem(key, "1");

  if ("serviceWorker" in navigator) {
    try {
      const registration = await navigator.serviceWorker.getRegistration("/")
        ?? await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
      await registration.update();
      registration.waiting?.postMessage({ type: "SKIP_WAITING" });
    } catch {
      // The single reload below still lets a network-served build replace a stale worker.
    }
  }

  window.location.reload();
  return "reloading";
}
