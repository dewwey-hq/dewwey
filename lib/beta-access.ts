const SALT = "dewwey-beta-v1";
export const BETA_ACCESS_COOKIE = "beta-access";

export function isBetaAccessEnabled(): boolean {
  return Boolean(process.env.BETA_ACCESS_PASSWORD?.trim());
}

/** HMAC-SHA256 token stored in the beta-access cookie after login. */
export async function betaAccessToken(password: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(SALT),
  );
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function isValidBetaAccessCookie(
  cookieValue: string | undefined,
): Promise<boolean> {
  const password = process.env.BETA_ACCESS_PASSWORD?.trim();
  if (!password || !cookieValue) return false;
  const expected = await betaAccessToken(password);
  return cookieValue === expected;
}
