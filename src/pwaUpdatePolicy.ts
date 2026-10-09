export type ReleasePolicy = {
  surface?: unknown;
  version?: unknown;
  minimumVersion?: unknown;
  buildId?: unknown;
  forceUpdate?: unknown;
  updateRequired?: unknown;
};

export type ValidReleasePolicy = {
  surface: string;
  version: string;
  minimumVersion: string;
  buildId: string;
  forceUpdate: boolean;
  updateRequired?: boolean;
};

export type ClientRelease = {
  surface: string;
  version: string;
  buildId: string;
};

export type PwaUpdateDecision = {
  updateAvailable: boolean;
  required: boolean;
  targetVersion: string;
  targetBuildId: string;
};

function versionParts(value: string): number[] | null {
  const match = value.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  return match ? match.slice(1, 4).map(Number) : null;
}

export function isVersionNewer(candidate: string, current: string): boolean {
  const left = versionParts(candidate);
  const right = versionParts(current);
  if (!left || !right) return false;

  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index];
  }
  return false;
}

export function isValidReleasePolicy(value: ReleasePolicy, surface: string): value is ValidReleasePolicy {
  return value.surface === surface
    && typeof value.version === "string"
    && versionParts(value.version) !== null
    && typeof value.minimumVersion === "string"
    && versionParts(value.minimumVersion) !== null
    && typeof value.buildId === "string"
    && value.buildId.length > 0
    && typeof value.forceUpdate === "boolean"
    && (value.updateRequired === undefined || typeof value.updateRequired === "boolean");
}

/**
 * A build change means that a newer PWA worker may be downloaded. It is not,
 * by itself, an incompatibility: only a newer minimum version (or an explicit
 * forced policy) may block the running application.
 */
export function getPwaUpdateDecision(policy: ValidReleasePolicy, client: ClientRelease): PwaUpdateDecision {
  const newerMinimum = isVersionNewer(policy.minimumVersion, client.version);
  const required = policy.forceUpdate && (newerMinimum || policy.updateRequired === true);
  const newerBuild = policy.buildId !== client.buildId;
  const newerVersion = isVersionNewer(policy.version, client.version);

  return {
    updateAvailable: required || newerBuild || newerVersion,
    required,
    targetVersion: policy.version,
    targetBuildId: policy.buildId,
  };
}

/** A controller change can reload only an already-controlled, safe client. */
export function shouldReloadAfterControllerChange({
  hadController,
  isSafeToReload,
  alreadyReloadedForBuild,
}: {
  hadController: boolean;
  isSafeToReload: boolean;
  alreadyReloadedForBuild: boolean;
}): boolean {
  return hadController && isSafeToReload && !alreadyReloadedForBuild;
}
