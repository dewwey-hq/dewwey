import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  BETA_ACCESS_COOKIE,
  isBetaAccessEnabled,
  isValidBetaAccessCookie,
} from "@/lib/beta-access";

export async function middleware(request: NextRequest) {
  if (!isBetaAccessEnabled()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (
    pathname === "/beta-access" ||
    pathname.startsWith("/api/beta-access")
  ) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get(BETA_ACCESS_COOKIE)?.value;
  if (await isValidBetaAccessCookie(cookie)) {
    return NextResponse.next();
  }

  const login = request.nextUrl.clone();
  login.pathname = "/beta-access";
  login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
