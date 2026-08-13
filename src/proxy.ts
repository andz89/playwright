import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Guards the whole app (pages and API routes alike, since /api/scrape is the
// actual abuse vector) behind a single shared password until real
// authentication exists. No SITE_PASSWORD set means no gate — keeps local
// dev password-free unless you opt in via .env.local.
export function proxy(request: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) {
    return NextResponse.next();
  }

  const auth = request.headers.get("authorization");
  const [scheme, encoded] = auth?.split(" ") ?? [];
  if (scheme === "Basic" && encoded) {
    const [, suppliedPassword] = Buffer.from(encoded, "base64")
      .toString("utf-8")
      .split(":");
    if (suppliedPassword === password) {
      return NextResponse.next();
    }
  }

  return new Response("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Web Scraper"' },
  });
}

export const config = {
  // /api/health stays open so Render's health check (which never sends the
  // password) doesn't get a 401 and mark the service unhealthy.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health).*)"],
};
