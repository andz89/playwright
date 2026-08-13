"use client";

import { useState, type RefObject } from "react";
import { filenameForUrl } from "@/lib/appScreenshotFilename";

interface AppScreenshotButtonProps {
  url: string;
  targetRef: RefObject<HTMLElement | null>;
  disabled?: boolean;
}

/**
 * An SVG that declares only a `viewBox` (no explicit width/height on the
 * root element) is valid and renders correctly in a real browser, but
 * html2canvas-pro's own image loader assigns it a wrong "natural size" in
 * that case, causing it to draw a cropped/zoomed fragment instead of the
 * whole graphic. Baking explicit width/height (derived from the viewBox)
 * into the markup sidesteps that at the source; SVGs that already declare
 * both are returned unchanged.
 */
function ensureSvgDimensions(svgText: string): string {
  const tagMatch = svgText.match(/<svg\b[^>]*>/i);
  if (!tagMatch) return svgText;
  const tag = tagMatch[0];
  if (/\bwidth\s*=/.test(tag) && /\bheight\s*=/.test(tag)) return svgText;

  const viewBoxMatch = tag.match(/\bviewBox\s*=\s*["']([^"']+)["']/i);
  if (!viewBoxMatch) return svgText;
  const parts = viewBoxMatch[1].trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return svgText;
  const [, , width, height] = parts;

  const patchedTag = tag.replace(/<svg\b/i, `<svg width="${width}" height="${height}"`);
  return svgText.replace(tag, patchedTag);
}

export function AppScreenshotButton({
  url,
  targetRef,
  disabled,
}: AppScreenshotButtonProps) {
  const [state, setState] = useState<"idle" | "working" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleClick = async () => {
    if (!targetRef.current) return;
    setState("working");
    setErrorMessage(null);
    try {
      // Tailwind v4's default palette uses oklch()/oklab() colors, which
      // plain html2canvas can't parse ("unsupported color function"); the
      // -pro fork adds support for those modern CSS color functions.
      const { default: html2canvas } = await import("html2canvas-pro");
      const canvas = await html2canvas(targetRef.current, {
        useCORS: true,
        backgroundColor: null,
        // Cross-origin images the source site doesn't send CORS headers
        // for (e.g. some scraped-page thumbnails) can never be captured
        // client-side; html2canvas already skips them and renders that
        // spot blank, so logging each one is just unactionable noise.
        logging: false,
        // A cross-origin <img> without CORS cooperation from its server
        // can be displayed on the page but not read back out by canvas
        // ("tainted canvas"). Rewriting those srcs, on the clone only, to
        // go through our same-origin image proxy sidesteps that
        // regardless of the source server's CORS policy.
        onclone: async (clonedDoc) => {
          // Swapping `src` kicks off a fresh async image load, which can
          // change the element's intrinsic size and, for `h-auto` /
          // `object-fit` boxes, trigger a layout reflow. html2canvas reads
          // layout right after this callback returns, so we must wait for
          // each swapped image to actually finish loading (and the browser
          // to settle the resulting reflow) — otherwise html2canvas draws
          // the new image into a box sized for the old/incomplete one,
          // which crops or misaligns it instead of leaving it blank.
          const swaps: Promise<void>[] = [];
          const loadInto = (img: HTMLImageElement, newSrc: string) =>
            new Promise<void>((resolve) => {
              img.addEventListener("load", () => resolve(), { once: true });
              img.addEventListener("error", () => resolve(), { once: true });
              img.src = newSrc;
            });

          clonedDoc.querySelectorAll("img").forEach((img) => {
            const src = img.getAttribute("src");
            if (!src || src.startsWith("data:") || src.startsWith("blob:")) return;
            let absolute: URL;
            try {
              absolute = new URL(src, window.location.href);
            } catch {
              return;
            }
            if (absolute.origin === window.location.origin) return;
            const proxied = `/api/image-proxy?url=${encodeURIComponent(absolute.href)}`;

            if (absolute.pathname.toLowerCase().endsWith(".svg")) {
              // SVGs need the width/height patch above, which requires the
              // markup text in hand, so fetch it ourselves (through the
              // same proxy) instead of letting html2canvas's own loader
              // fetch the raw URL.
              swaps.push(
                (async () => {
                  try {
                    const res = await fetch(proxied);
                    if (!res.ok) return;
                    const patched = ensureSvgDimensions(await res.text());
                    const dataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(patched)))}`;
                    await loadInto(img, dataUrl);
                  } catch {
                    // Leave the original (likely blank) src on failure.
                  }
                })(),
              );
            } else {
              swaps.push(loadInto(img, proxied));
            }
          });
          await Promise.all(swaps);
        },
      });
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) throw new Error("Failed to generate screenshot image.");

      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filenameForUrl(url);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      setState("idle");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to capture screenshot.",
      );
      setState("error");
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleClick}
        disabled={disabled || state === "working"}
        className="rounded-md border border-black/15 dark:border-white/15 bg-white dark:bg-black/20 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {state === "working" ? "Capturing…" : "Screenshot this page"}
      </button>
      {state === "error" && (
        <span className="text-xs text-red-600 dark:text-red-400">
          {errorMessage ?? "Failed to capture screenshot."} Try again.
        </span>
      )}
    </div>
  );
}
