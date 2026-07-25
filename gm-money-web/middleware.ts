import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

// Server-enforced session gate, ported from skrybix-webapp/middleware.ts.
// Runs before every request (Vercel Edge Middleware) except /login,
// /api/tiller-sync, and /api/cron/** -- those two API paths authenticate
// with their own shared secrets instead (Apps Script and Vercel Cron have
// no session cookie to send). Fails closed if AUTH_SECRET isn't configured.
export async function middleware(request: NextRequest) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return new NextResponse("Auth not configured", { status: 500 });
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (await verifySessionToken(secret, token)) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|api/tiller-sync|api/cron).*)"],
};
