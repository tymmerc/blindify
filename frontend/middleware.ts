import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

const protectedPrefixes = ["/menu", "/solo", "/game"]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const protectedRoute = protectedPrefixes.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))

  if (protectedRoute) {
    const sessionCookie = request.cookies.get("blindify_session")
    if (!sessionCookie) {
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = "/auth/login"
      loginUrl.searchParams.set("redirectTo", pathname + request.nextUrl.search)
      return NextResponse.redirect(loginUrl)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/menu/:path*", "/solo/:path*", "/game/:path*"],
}
