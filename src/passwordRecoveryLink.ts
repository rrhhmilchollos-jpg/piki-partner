export type PasswordRecoveryLink = {
  token: string;
  cleanPath: string | null;
};

/**
 * The recovery secret is retained in component state only. Removing it from
 * the address bar promptly avoids leaving it in browser history or copying it
 * accidentally with the rest of the URL.
 */
export function readPasswordRecoveryLink(href: string): PasswordRecoveryLink {
  const url = new URL(href, "https://partner.piki.invalid");
  const resetValue = url.searchParams.get("reset");
  if (resetValue === null) return { token: "", cleanPath: null };

  url.searchParams.delete("reset");
  return {
    token: resetValue.trim(),
    cleanPath: `${url.pathname}${url.search}${url.hash}`,
  };
}
