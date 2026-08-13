import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Guards the whole app (pages and API routes alike, since /api/scrape is the
// actual abuse vector) behind Supabase Auth.
export function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // /api/health stays open so Render's health check (which never sends
  // auth) doesn't get redirected and mark the service unhealthy.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health).*)"],
};
