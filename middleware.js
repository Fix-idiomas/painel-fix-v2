import { NextResponse } from "next/server";

export function middleware(req) {
  const { pathname } = req.nextUrl;

  // rotas públicas
  const publicPaths = ["/login", "/api/mock-login", "/api/mock-logout"];
  const isPublic = publicPaths.includes(pathname) || pathname.startsWith("/_next");

  if (isPublic) return NextResponse.next();

  const isAuth = req.cookies.get("auth")?.value === "1";
  if (!isAuth) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
