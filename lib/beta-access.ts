const SALT = "dewwey-beta-v1";
export const BETA_ACCESS_COOKIE = "beta-access";
const BETA_HOST = "beta.dewwey.com";

export function isBetaAccessHost(hostname: string): boolean {
  const host = hostname.toLowerCase().split(":")[0];
  return host === BETA_HOST;
}

/** Gate only beta.dewwey.com when BETA_ACCESS_PASSWORD is set. */
export function isBetaAccessEnabled(hostname: string): boolean {
  if (!isBetaAccessHost(hostname)) return false;
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
