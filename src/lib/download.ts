import { SCRAPER_USER_AGENT } from "./robots";

const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25MB safety cap

export interface DownloadedImage {
  buffer: Buffer;
  contentType: string | null;
}

function decodeDataUrl(dataUrl: string): DownloadedImage {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/);
  if (!match) throw new Error("Malformed data URL");
  const [, mime, isBase64, payload] = match;
  const buffer = isBase64
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload), "utf-8");
  return { buffer, contentType: mime ?? null };
}

const FETCH_ATTEMPTS = 3;

export async function downloadImage(
  url: string,
  refererPage: string,
): Promise<DownloadedImage> {
  if (url.startsWith("data:")) {
    return decodeDataUrl(url);
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": SCRAPER_USER_AGENT,
          Referer: refererPage,
          Accept: "image/*,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(20000),
      });

      if (!res.ok) {
        throw new Error(`Failed to download image (HTTP ${res.status})`);
      }

      const contentLength = res.headers.get("content-length");
      if (contentLength && Number(contentLength) > MAX_IMAGE_BYTES) {
        throw new Error("Image exceeds maximum allowed size");
      }

      const arrayBuffer = await res.arrayBuffer();
      if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
        throw new Error("Image exceeds maximum allowed size");
      }

      return {
        buffer: Buffer.from(arrayBuffer),
        contentType: res.headers.get("content-type"),
      };
    } catch (err) {
      lastError = err;
      // Oversized-image and bad-status errors won't resolve on retry;
      // only transient network resets (e.g. "fetch failed") are worth
      // another attempt, mirroring the retry scrape.ts already does for
      // page navigation against the same class of intermittent resets.
      if (err instanceof Error && err.message.startsWith("Failed to download image")) {
        throw err;
      }
      if (err instanceof Error && err.message.startsWith("Image exceeds")) {
        throw err;
      }
      if (attempt < FETCH_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
  }
  throw lastError;
}
