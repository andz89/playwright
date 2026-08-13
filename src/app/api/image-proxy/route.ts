import { NextRequest } from "next/server";
import { downloadImage } from "@/lib/download";

export const runtime = "nodejs";

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Re-fetches a third-party image server-side and serves it back same-origin.
 * Exists for the "screenshot this page" capture: a cross-origin <img> whose
 * server doesn't send CORS headers can be displayed by the browser but not
 * read back out via canvas ("tainted canvas"), so html2canvas can't rasterize
 * it directly. Routing it through this same-origin endpoint sidesteps that
 * regardless of the source server's CORS policy.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url || !isHttpUrl(url)) {
    return new Response("A valid http(s) 'url' query param is required", { status: 400 });
  }

  try {
    const { buffer, contentType } = await downloadImage(url, url);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType ?? "application/octet-stream",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Failed to fetch image", {
      status: 502,
    });
  }
}
