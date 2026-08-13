import { chromium, type Page, type Request, type Response } from "playwright";
import { SCRAPER_USER_AGENT } from "./robots";
import {
  FEATURED_TAGS,
  type FeaturedTag,
  type HyvorTalkResult,
  type RedirectInfo,
  type ScreenshotDevice,
  type ScreenshotSet,
  type ScrapeOptions,
} from "./types";

export const MAX_IMAGES = 50;

export interface DiscoveredImage {
  url: string;
  source: "img" | "background" | FeaturedTag;
  /** Set when the browser could not actually load this image. */
  error?: string;
}

export interface ScrapePageResult {
  images: DiscoveredImage[];
  totalFound: number;
  hyvorTalk: HyvorTalkResult;
  /** Set when the requested URL redirected somewhere else before we scraped it. */
  redirect: RedirectInfo | null;
  /** Absolute URL from the page's <link rel="canonical">, or null if absent/not requested. */
  canonicalUrl: string | null;
  /** Full-page screenshots at desktop/tablet/mobile sizes, or null if not requested. */
  screenshots: ScreenshotSet | null;
}

const SCREENSHOT_VIEWPORTS: [ScreenshotDevice, { width: number; height: number }][] = [
  ["desktop", { width: 1440, height: 900 }],
  ["tablet", { width: 768, height: 1024 }],
  ["mobile", { width: 375, height: 812 }],
];

// The current Hyvor Talk embed is the <hyvor-talk-comments website-id=...
// page-id=...> custom element itself — that's what carries the real
// properties, so it's always preferred over a page's own wrapper. Some
// sites wrap it in their own container (e.g. <div id="hyvor-talk">), which
// would wrongly win a combined "first match in document order" selector
// since a wrapper precedes its child; querying for the custom element first
// avoids that. The looser selector is only a fallback for older/nonstandard
// embeds that don't create that element at all.
const HYVOR_TALK_PRIMARY_SELECTOR = "hyvor-talk-comments";
const HYVOR_TALK_FALLBACK_SELECTOR =
  '[id^="hyvor-talk"], [class*="hyvor-talk"], iframe[src*="hyvor.com"]';

const GOTO_ATTEMPTS = 3;

/**
 * Some sites/WAFs reset the connection intermittently rather than
 * deterministically blocking every request (observed even from plain curl,
 * independent of browser fingerprint) — a couple of retries with backoff
 * clears most of these transient resets without masking a real failure.
 */
async function gotoWithRetry(page: Page, url: string): Promise<Response | null> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= GOTO_ATTEMPTS; attempt += 1) {
    try {
      return await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    } catch (err) {
      lastError = err;
      if (attempt < GOTO_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
  }
  throw lastError;
}

/**
 * Detects that we ended up somewhere other than the requested URL, and
 * reconstructs the hop-by-hop path there from two distinct sources: Playwright
 * follows HTTP-level redirects (301/302) transparently during `goto`, so
 * those only show up by walking `request.redirectedFrom()` back from the
 * response it returns; but plenty of sites instead redirect via JS *after*
 * the page has loaded (an auth check that finds no session and sends the
 * visitor to a login/registration page) — that never touches the HTTP layer
 * at all, so it's only observable as a later `framenavigated` event on the
 * main frame, collected separately by the caller. Either way, everything we
 * scrape afterward actually comes from the final page, not the one the user
 * typed in, so it's worth surfacing regardless of which mechanism caused it.
 */
function buildRedirectInfo(
  requestedUrl: string,
  finalUrl: string,
  response: Response | null,
  laterNavigations: string[],
): RedirectInfo | null {
  const normalize = (u: string) => {
    try {
      return new URL(u).href;
    } catch {
      return u;
    }
  };
  if (normalize(requestedUrl) === normalize(finalUrl)) return null;

  const chain: string[] = [requestedUrl];
  const push = (u: string) => {
    if (chain[chain.length - 1] !== u) chain.push(u);
  };

  let req: Request | null = response?.request() ?? null;
  const hops: Request[] = [];
  while (req) {
    hops.unshift(req);
    req = req.redirectedFrom();
  }
  for (const hop of hops) push(hop.url());
  for (const url of laterNavigations) push(url);
  push(finalUrl);

  return { requestedUrl, finalUrl, chain };
}

/**
 * Loads a single page with Playwright (handling both static and JS-rendered
 * content) and collects every <img> src, any CSS background-image URL
 * that is reasonably detectable from computed styles, and the page's
 * featured-image metadata (Open Graph / Twitter Card / `link[rel=image_src]`
 * — the image(s) a link preview or social share would use). Each featured
 * tag is reported as its own row, even when two tags point at the same
 * file, since they're distinct declarations on the page. Results are capped
 * at `MAX_IMAGES` (`totalFound` reports the pre-cap count) and each kept
 * image is then load-tested in the same browser session so `error` reflects
 * whether it would actually display. Also checks for a Hyvor Talk comments
 * widget (capturing its attributes and a screenshot of just that block),
 * reads the page's canonical URL, and captures full-page screenshots at
 * desktop/tablet/mobile sizes. Each of these collection steps is skippable
 * via `options`, so unchecked categories aren't even fetched/verified.
 */
export async function scrapePage(
  pageUrl: string,
  options: ScrapeOptions,
): Promise<ScrapePageResult> {
  // Playwright's default headless mode launches a separate "headless shell"
  // binary with a network/TLS fingerprint that many WAFs (Cloudflare, etc.)
  // detect and reset connections against. `--headless=new` runs full
  // Chromium in headless mode instead, which is indistinguishable from a
  // normal browser and avoids those false-positive blocks.
  const launchArgs = ["--headless=new"];
  if (process.env.CHROMIUM_NO_SANDBOX === "1") {
    // Chromium's own sandbox needs a capability (SYS_ADMIN) that most
    // container PaaS's (Render included) don't grant, and refuses to start
    // as root without it. `--disable-dev-shm-usage` avoids a separate crash
    // from Docker's default 64MB /dev/shm being too small for Chromium's
    // shared memory use, falling back to (slower) /tmp instead. Opt-in via
    // env var rather than default-on, since it also weakens the isolation
    // between the browser and the (untrusted, attacker-controlled) pages
    // this app renders.
    launchArgs.push("--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage");
  }
  const browser = await chromium.launch({ headless: true, args: launchArgs });
  try {
    const context = await browser.newContext({ userAgent: SCRAPER_USER_AGENT });
    const page = await context.newPage();

    // Some sites redirect via JS only after the initial page has loaded
    // (e.g. an auth check that bounces an unregistered visitor to a login
    // page) rather than via an HTTP 3xx, so a plain before/after URL
    // comparison right after `goto` would miss it. Track every URL the
    // main frame navigates to for the whole load so those show up too.
    const laterNavigations: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) laterNavigations.push(frame.url());
    });

    const response = await gotoWithRetry(page, pageUrl);
    // Give JS-rendered pages a chance to finish lazy-loading images (and
    // any post-load JS redirect a chance to fire) before we settle on a
    // final URL.
    try {
      await page.waitForLoadState("networkidle", { timeout: 8000 });
    } catch {
      // Non-fatal: some pages never go idle (polling, websockets, etc).
    }
    const redirect = buildRedirectInfo(pageUrl, page.url(), response, laterNavigations);

    const raw = await page.evaluate(
      ({ featuredImages, pageImages }) => {
        const found: { url: string; source: string }[] = [];

        if (featuredImages) {
          const featuredSelectors: [string, string, string][] = [
            ["og:image", 'meta[property="og:image"]', "content"],
            ["og:image:secure_url", 'meta[property="og:image:secure_url"]', "content"],
            ["twitter:image", 'meta[name="twitter:image"]', "content"],
            ["twitter:image:src", 'meta[name="twitter:image:src"]', "content"],
            ["image_src", 'link[rel="image_src"]', "href"],
          ];
          for (const [tag, selector, attr] of featuredSelectors) {
            // A page can have multiple tags for the same property (some sites
            // ship duplicate/leftover og:image tags); per the Open Graph spec
            // the first one declared is the canonical value consumers use, so
            // only that one qualifies as this tag's featured image.
            const value = document.querySelector(selector)?.getAttribute(attr);
            if (value) found.push({ url: value, source: tag });
          }
        }

        if (pageImages) {
          document.querySelectorAll("img").forEach((img) => {
            const src = img.currentSrc || img.getAttribute("src") || "";
            if (src) found.push({ url: src, source: "img" });
            const srcset = img.getAttribute("srcset");
            if (srcset) {
              const first = srcset.split(",")[0]?.trim().split(/\s+/)[0];
              if (first) found.push({ url: first, source: "img" });
            }
          });

          const urlFromCss = (value: string): string | null => {
            const match = value.match(/url\((['"]?)(.*?)\1\)/);
            return match ? match[2] : null;
          };

          document.querySelectorAll<HTMLElement>("*").forEach((el) => {
            const bg = window.getComputedStyle(el).backgroundImage;
            if (bg && bg !== "none") {
              const url = urlFromCss(bg);
              if (url) found.push({ url, source: "background" });
            }
          });
        }

        return found;
      },
      { featuredImages: options.featuredImages, pageImages: options.pageImages },
    );

    const featuredTags: Set<string> = new Set(FEATURED_TAGS);
    const seen = new Set<string>();
    const results: DiscoveredImage[] = [];
    for (const item of raw) {
      let absolute: string;
      try {
        absolute = item.url.startsWith("data:")
          ? item.url
          : new URL(item.url, page.url()).href;
      } catch {
        continue;
      }
      // Featured tags are always kept as their own row (even when two tags
      // share a URL) — only <img>/background matches are deduped, since
      // repeated <img> references to the same file aren't meaningfully
      // distinct the way separate meta-tag declarations are.
      if (!featuredTags.has(item.source)) {
        if (seen.has(absolute)) continue;
        seen.add(absolute);
      }
      results.push({ url: absolute, source: item.source as DiscoveredImage["source"] });
    }

    const totalFound = results.length;
    const truncated = results.slice(0, MAX_IMAGES);
    await verifyInBrowser(page, truncated);
    const hyvorTalk = options.hyvorTalk
      ? await captureHyvorTalk(page)
      : { found: false };
    const canonicalUrl = options.canonicalUrl ? await captureCanonicalUrl(page) : null;
    // Resizes the viewport repeatedly, so it must run after every step above
    // that depends on the page's original layout/viewport.
    const screenshots = options.screenshots ? await captureScreenshots(page) : null;

    return { images: truncated, totalFound, hyvorTalk, redirect, canonicalUrl, screenshots };
  } finally {
    await browser.close();
  }
}

/**
 * Looks for a Hyvor Talk comments widget on the page and, if found, reads
 * the attributes off its root element and screenshots just that block
 * (rather than the whole page) so the result shows the widget on its own.
 * Distinguishes "no widget on this page" (found: false, no error) from
 * "a widget is there but couldn't be captured" (found: false, with error) —
 * e.g. a page can ship the markup but never render it because the visitor
 * isn't logged in, so it's worth surfacing that differently than a plain
 * "not present".
 */
async function captureHyvorTalk(page: Page): Promise<HyvorTalkResult> {
  let widget = page.locator(HYVOR_TALK_PRIMARY_SELECTOR).first();
  if ((await widget.count()) === 0) {
    widget = page.locator(HYVOR_TALK_FALLBACK_SELECTOR).first();
  }
  if ((await widget.count()) === 0) {
    return { found: false };
  }

  try {
    await widget.waitFor({ state: "visible", timeout: 10000 });
  } catch {
    return {
      found: false,
      error:
        "A Hyvor Talk widget was found on the page but never became visible — it may require the visitor to be logged in, or failed to load.",
    };
  }

  try {
    await widget.scrollIntoViewIfNeeded();
    // Let any lazy-loaded reaction icons/avatars inside the widget settle
    // before screenshotting, so the capture isn't mid-render.
    await page.waitForTimeout(500);

    const properties = await widget.evaluate((el) => {
      const props: Record<string, string> = {};
      for (const attr of Array.from(el.attributes)) {
        props[attr.name] = attr.value;
      }
      return props;
    });
    const buffer = await widget.screenshot({ type: "png" });

    return {
      found: true,
      properties,
      screenshot: `data:image/png;base64,${buffer.toString("base64")}`,
    };
  } catch (err) {
    return {
      found: false,
      error: `A Hyvor Talk widget was found on the page but could not be captured: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
}

/**
 * Reads the page's <link rel="canonical"> href, if any, resolved to an
 * absolute URL against the page's actual (post-redirect) location — a
 * relative canonical href is only meaningful relative to where it was
 * actually served from, not the URL the user originally typed in.
 */
async function captureCanonicalUrl(page: Page): Promise<string | null> {
  const raw = await page.evaluate(
    () => document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null,
  );
  if (!raw) return null;
  try {
    return new URL(raw, page.url()).href;
  } catch {
    return raw;
  }
}

/**
 * Captures a full-page screenshot at each of three standard device sizes.
 * Runs last (after image verification and Hyvor Talk capture, both of which
 * are viewport-sensitive) since it repeatedly resizes the already-loaded
 * page rather than re-navigating three separate times — re-navigating per
 * size would triple the load on whatever WAF/rate-limit the target site
 * already applied to the single load done for everything else. Resizing
 * still lets responsive CSS (media queries) recompute for each size; a
 * network-idle wait after each resize gives responsive images/lazy content
 * a chance to catch up before the capture. Each device is captured
 * independently so one failing doesn't lose the other two.
 */
async function captureScreenshots(page: Page): Promise<ScreenshotSet> {
  const result: ScreenshotSet = { desktop: null, tablet: null, mobile: null };

  for (const [device, viewport] of SCREENSHOT_VIEWPORTS) {
    try {
      await page.setViewportSize(viewport);
      try {
        await page.waitForLoadState("networkidle", { timeout: 5000 });
      } catch {
        // Non-fatal, same as the initial page load.
      }
      const buffer = await page.screenshot({ fullPage: true, type: "png" });
      result[device] = `data:image/png;base64,${buffer.toString("base64")}`;
    } catch (err) {
      result.error = `Failed to capture ${device} screenshot: ${
        err instanceof Error ? err.message : String(err)
      }`;
    }
  }

  return result;
}

/**
 * Checks each discovered URL by actually loading it as an `Image()` inside
 * the already-open page — the same browser session (cookies, TLS/HTTP
 * fingerprint, connection reuse) that just successfully rendered the page
 * itself. A separate out-of-band request (e.g. a plain server-side fetch)
 * is a *less* reliable signal: some WAFs reset or rate-limit isolated
 * automated requests even though the exact same image loads fine as part
 * of normal page rendering, which would falsely flag working images as
 * broken. Mutates `images` in place, setting `error` on ones that fail to
 * load after a couple of retries.
 */
async function verifyInBrowser(page: Page, images: DiscoveredImage[]): Promise<void> {
  const uniqueUrls = Array.from(new Set(images.map((img) => img.url)));
  if (uniqueUrls.length === 0) return;

  const failed = await page.evaluate(async (urls: string[]) => {
    const CONCURRENCY = 6;
    const TIMEOUT_MS = 10000;
    const ATTEMPTS = 2;

    function loadOnce(url: string): Promise<boolean> {
      return new Promise((resolve) => {
        if (url.startsWith("data:")) {
          resolve(true);
          return;
        }
        const img = new Image();
        let settled = false;
        const finish = (ok: boolean) => {
          if (settled) return;
          settled = true;
          resolve(ok);
        };
        const timer = setTimeout(() => finish(false), TIMEOUT_MS);
        img.onload = () => {
          clearTimeout(timer);
          finish(true);
        };
        img.onerror = () => {
          clearTimeout(timer);
          finish(false);
        };
        img.src = url;
      });
    }

    async function checkUrl(url: string): Promise<boolean> {
      for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
        if (await loadOnce(url)) return true;
      }
      return false;
    }

    const failedUrls = new Set<string>();
    let cursor = 0;
    async function worker() {
      while (cursor < urls.length) {
        const url = urls[cursor];
        cursor += 1;
        if (!(await checkUrl(url))) failedUrls.add(url);
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, urls.length) }, () => worker()),
    );

    return Array.from(failedUrls);
  }, uniqueUrls);

  if (failed.length === 0) return;
  const failedSet = new Set(failed);
  for (const img of images) {
    if (failedSet.has(img.url)) {
      img.error = "Image failed to load in the browser";
    }
  }
}
