import { NextRequest } from "next/server";
import { checkRobotsAllowed } from "@/lib/robots";
import { scrapePage } from "@/lib/scrape";
import {
  DEFAULT_SCRAPE_OPTIONS,
  type ImageResult,
  type ScrapeEvent,
  type ScrapeRequestBody,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  let body: ScrapeRequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const targetUrl = body?.url?.trim();
  if (!targetUrl || !isHttpUrl(targetUrl)) {
    return new Response("A valid http(s) URL is required", { status: 400 });
  }

  const options = body.options ?? DEFAULT_SCRAPE_OPTIONS;

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: ScrapeEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };

      try {
        const robots = await checkRobotsAllowed(targetUrl);
        send({ type: "robots", allowed: robots.allowed, message: robots.message });

        if (!robots.allowed && !body.ignoreRobots) {
          send({
            type: "error",
            message:
              "Scraping this page is disallowed by robots.txt. Enable the override to proceed anyway.",
            fatal: true,
          });
          return close();
        }

        send({ type: "status", message: "Loading page with a headless browser…" });
        const {
          images: discovered,
          totalFound,
          hyvorTalk,
          redirect,
          canonicalUrl,
          screenshots,
        } = await scrapePage(targetUrl, options);

        if (redirect) {
          send({ type: "redirect", info: redirect });
        }
        if (options.hyvorTalk) {
          send({ type: "hyvorTalk", result: hyvorTalk });
        }
        if (options.canonicalUrl) {
          send({ type: "canonical", result: { url: canonicalUrl } });
        }
        if (options.screenshots && screenshots) {
          send({ type: "screenshots", result: screenshots });
        }

        if (discovered.length === 0) {
          send({ type: "status", message: "No images found on this page." });
          send({ type: "done", totalImages: 0, failedImages: 0 });
          return close();
        }

        if (totalFound > discovered.length) {
          send({
            type: "status",
            message: `Found ${totalFound} images; showing the first ${discovered.length}.`,
          });
        } else {
          send({ type: "status", message: `Found ${discovered.length} images.` });
        }
        send({ type: "found", total: discovered.length });

        let failedImages = 0;

        for (let i = 0; i < discovered.length; i += 1) {
          const item = discovered[i];
          const current = i + 1;
          send({
            type: "progress",
            current,
            total: discovered.length,
            message: `Loading image ${current} of ${discovered.length}`,
          });

          const result: ImageResult = {
            id: `img-${i}`,
            src: item.url,
            source: item.source,
          };
          if (item.error) {
            result.error = item.error;
            failedImages += 1;
          }

          send({ type: "image", result });
        }

        send({ type: "done", totalImages: discovered.length, failedImages });
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : "Unexpected error while scraping",
          fatal: true,
        });
      } finally {
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
