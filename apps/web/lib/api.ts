/**
 * Vendor API base URL. Same-origin Next.js route handlers (app/api/vendors)
 * replaced the old Lambda + API Gateway — no cross-origin config needed.
 * Server components should import lib/server/vendors directly instead.
 */
export function getVendorApiBaseUrl(): string {
  return "/api/vendors";
}
