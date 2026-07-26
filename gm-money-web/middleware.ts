import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

// Server-enforced session gate, ported from skrybix-webapp/middleware.ts.
// Runs before every request (Vercel Edge Middleware) except /login,
// /setup,
// /api/health, /api/tiller-sync, and /api/cron/** -- those API paths
// authenticate with shared secrets or need to be reachable for deployment
// checks. Fails closed if AUTH_SECRET isn't configured.
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
  // icon/apple-icon/manifest.webmanifest are Next's generated PWA assets
  // (app/icon.tsx, app/apple-icon.tsx, app/manifest.ts) -- browsers and
  // iOS's "Add to Home Screen" fetch these without a session cookie, so
  // they need to stay reachable the same way favicon.ico already is.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|login|setup|api/health|api/tiller-sync|api/cron).*)",
  ],
};
