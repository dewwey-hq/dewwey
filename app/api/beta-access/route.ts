import { NextResponse } from "next/server";
import {
  BETA_ACCESS_COOKIE,
  betaAccessToken,
  isBetaAccessEnabled,
} from "@/lib/beta-access";

export async function POST(request: Request) {
  const hostname =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    new URL(request.url).hostname;

  if (!isBetaAccessEnabled(hostname)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const form = await request.formData();
  const submitted = String(form.get("password") ?? "");
  const nextPath = String(form.get("next") ?? "/") || "/";
  const password = process.env.BETA_ACCESS_PASSWORD!.trim();

  const redirectBase = new URL("/beta-access", request.url);

  if (submitted !== password) {
    redirectBase.searchParams.set("error", "1");
    redirectBase.searchParams.set("next", nextPath);
    return NextResponse.redirect(redirectBase);
  }

  const token = await betaAccessToken(password);
  const destination = new URL(nextPath, request.url);
  const response = NextResponse.redirect(destination);
  response.cookies.set(BETA_ACCESS_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return response;
}
