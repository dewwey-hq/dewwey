/** Vendor search API (Lambda + API Gateway). Override per Vercel environment. */
const DEFAULT_VENDOR_API_URL =
  "https://kfln0omb31.execute-api.us-east-1.amazonaws.com/vendors";

export function getVendorApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_VENDOR_API_URL?.trim();
  return configured || DEFAULT_VENDOR_API_URL;
}
