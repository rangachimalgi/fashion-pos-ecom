import { NextResponse, type NextRequest } from "next/server";

function hasAuthCookie(request: NextRequest) {
  return request.cookies.getAll().some((cookie) => cookie.name.includes("auth-token"));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const authed = hasAuthCookie(request);
  const isLogin = pathname === "/login";
  const isEmployeeLogin = pathname === "/employee/login";
  const isEmployeeArea = pathname.startsWith("/employee") && !isEmployeeLogin;
  const isProtected =
    pathname.startsWith("/admin") || pathname.startsWith("/billing");

  if (isEmployeeArea && !authed) {
    const url = request.nextUrl.clone();
    url.pathname = "/employee/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (isEmployeeLogin && authed) {
    const url = request.nextUrl.clone();
    url.pathname = "/employee";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (isProtected && !authed) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (isLogin && authed) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/billing/:path*", "/employee/:path*", "/login"],
};
