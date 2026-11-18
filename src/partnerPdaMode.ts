export type PartnerPdaEnvironment = { hostname: string; search?: string; nativeAndroid: boolean };

/** A native APK normally runs on localhost, not on the dedicated public PDA hostname. */
export function isPartnerPdaMode({ hostname, search = "", nativeAndroid }: PartnerPdaEnvironment): boolean {
  return nativeAndroid || hostname === "partners-pda.pikidelivery.com" || hostname.startsWith("partners-pda.") || new URLSearchParams(search).get("pda") === "1";
}
