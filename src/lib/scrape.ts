import {
  chromium,
  type APIRequestContext,
  type BrowserContext,
  type Locator,
  type Page,
  type Request,
  type Response,
} from "playwright";
import { SCRAPER_USER_AGENT } from "./robots";
import {
  FEATURED_TAGS,
  type FailedSnapshotResource,
  type FeaturedTag,
  type HyvorTalkResult,
  type MetaResult,
  type PageSnapshotResult,
  type RedirectInfo,
  type ScreenshotDevice,
  type ScreenshotSet,
  type ScrapeOptions,
  type SnapshotResourceType,
} from "./types";

export const MAX_IMAGES = 50;
export const MAX_LINKS = 100;
export const MAX_VIDEOS = 50;

// Hosts of the common third-party video-embed players. Matched against an
// iframe's hostname (exact match or subdomain) so an embed can be reported
// even when its actual video file is unreachable — these players
// overwhelmingly stream via MediaSource/blob: URLs that were never a plain
// fetchable file to begin with, so the embed URL's own reachability is the
// only practically checkable signal.
const VIDEO_EMBED_HOSTS = [
  "youtube.com",
  "youtube-nocookie.com",
  "youtu.be",
  "vimeo.com",
  "player.vimeo.com",
  "dailymotion.com",
  "wistia.com",
  "wistia.net",
  "jwplatform.com",
  "brightcove.com",
  "brightcove.net",
  "vidyard.com",
  "loom.com",
  "facebook.com",
  "streamable.com",
];

function isVideoEmbedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return VIDEO_EMBED_HOSTS.some((embedHost) => host === embedHost || host.endsWith(`.${embedHost}`));
}

export interface DiscoveredImage {
  url: string;
  source: "img" | "background" | FeaturedTag;
  /** Set when the browser could not actually load this image. */
  error?: string;
}

export interface DiscoveredLink {
  url: string;
  text: string;
  /** HTTP status code the link resolved to, or null if it isn't an http(s) link. */
  status: number | null;
  /** Set when the link was checked and found broken. */
  error?: string;
  /** Set when the link isn't broken but also isn't something that can be verified. */
  note?: string;
}

export interface DiscoveredVideo {
  url: string;
  /** HTTP status code the video URL resolved to, or null until checked. */
  status: number | null;
  /** Set when the video URL was checked and found broken. */
  error?: string;
  /** Set when the URL isn't checkable (blob: URL) or is an embed iframe rather than a direct file. */
  note?: string;
  /** PNG screenshot of the <video>/embed iframe element itself, as a data: URL — best-effort, absent if the element couldn't be captured. */
  screenshot?: string;
}

export interface ScrapePageResult {
  images: DiscoveredImage[];
  totalFound: number;
  /**
   * Every <a href> found on the page, in document order and with duplicates
   * kept as-is (the same href appearing twice is two rows, not one) — unlike
   * images, repeated links are meaningfully distinct occurrences a link
   * checker needs to account for.
   */
  links: DiscoveredLink[];
  totalLinksFound: number;
  /** Every unique <video>/<source> src found on the page, each status-checked like a link. */
  videos: DiscoveredVideo[];
  totalVideosFound: number;
  hyvorTalk: HyvorTalkResult;
  /** Set when the requested URL redirected somewhere else before we scraped it. */
  redirect: RedirectInfo | null;
  /** Absolute URL from the page's <link rel="canonical">, or null if absent/not requested. */
  canonicalUrl: string | null;
  /** Full-page screenshots at desktop/tablet/mobile sizes, or null if not requested. */
  screenshots: ScreenshotSet | null;
  /** Sanitized HTML snapshot of the rendered page, or null if not requested. */
  pageSnapshot: PageSnapshotResult | null;
  /** Title, description, language, and other meta tags, or null if not requested. */
  meta: MetaResult | null;
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
 * Scrolls from top to bottom and back in a handful of steps, pausing
 * briefly between each. Content gated behind an IntersectionObserver or a
 * scroll listener (lazy-loaded images, nav items a menu component only
 * mounts once scrolled to, "load more" sections) never appears in the DOM
 * until something scrolls it into view — a plain `querySelectorAll` right
 * after load would miss it entirely regardless of shadow-DOM handling.
 * Best-effort: a page that blocks scripted scrolling or has nothing to
 * reveal just no-ops through this.
 */
async function triggerLazyContent(page: Page): Promise<void> {
  try {
    const height = await page.evaluate(() => document.body.scrollHeight);
    const steps = 6;
    for (let i = 1; i <= steps; i += 1) {
      await page.evaluate((y) => window.scrollTo(0, y), Math.round((height * i) / steps));
      await page.waitForTimeout(250);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(250);
  } catch {
    // Non-fatal.
  }
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
 * desktop/tablet/mobile sizes. When `options.links` is set, every `<a href>`
 * on the page is also collected (duplicates kept, capped at `MAX_LINKS`) and
 * each is checked for a working HTTP response. Each of these collection
 * steps is skippable via `options`, so unchecked categories aren't even
 * fetched/verified.
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

    // The snapshot's <base>-tag trick means the browser re-fetches every
    // stylesheet/image/font itself when the snapshot is later displayed —
    // it can't detect at that point which of those actually failed here
    // during the real load (a 404, a WAF block, a CORS-gated font). Tracking
    // it now, while we still have the real page and network, is the only
    // chance to tell the viewer the snapshot may not be pixel-accurate for
    // specific assets. These are only *candidates*: a single failed request
    // is frequently a transient blip (CDN rate-limit, slow first TLS
    // handshake) rather than a genuinely broken resource — same reasoning as
    // the retries used for image/link verification below — so each one is
    // re-confirmed with a direct request before being reported.
    const failedResourceCandidates: FailedSnapshotResource[] = [];
    const seenFailedUrls = new Set<string>();
    // Playwright's "media" resourceType covers <video>/<audio> sources —
    // reported to the user as "video" since that's what a 404'd source
    // actually means visually (no playable clip in the snapshot).
    const resourceTypeLabel: Partial<Record<string, SnapshotResourceType>> = {
      stylesheet: "stylesheet",
      image: "image",
      font: "font",
      media: "video",
    };
    const recordFailureCandidate = (request: Request, status?: number) => {
      const type = resourceTypeLabel[request.resourceType()];
      if (!type) return;
      const url = request.url();
      if (seenFailedUrls.has(url)) return;
      seenFailedUrls.add(url);
      failedResourceCandidates.push({ url, type, status });
    };
    const onRequestFailed = (request: Request) => recordFailureCandidate(request);
    const onResponse = (res: Response) => {
      if (res.status() >= 400) recordFailureCandidate(res.request(), res.status());
    };
    if (options.pageSnapshot) {
      page.on("requestfailed", onRequestFailed);
      page.on("response", onResponse);
    }

    // Modern players (hls.js/dash.js — used by YouTube, Vimeo, Bunny.net,
    // and most other streaming platforms) feed a <video> element through
    // MediaSource Extensions rather than setting its src to the real file,
    // so `currentSrc` ends up a `blob:` handle that only exists in that
    // browser tab — not a URL anyone else could check. The actual video
    // *is* still fetched over the network the whole time, as an HLS
    // (.m3u8) or DASH (.mpd) manifest; tracking those requests here, keyed
    // by which frame they came from, is the only way to recover a real,
    // checkable URL for that case.
    const manifestUrlsByFrame = new Map<string, string[]>();
    const onManifestRequest = (request: Request) => {
      if (!/\.(m3u8|mpd)(\?|$)/i.test(request.url())) return;
      const frameUrl = request.frame().url();
      const urls = manifestUrlsByFrame.get(frameUrl) ?? [];
      if (!urls.includes(request.url())) urls.push(request.url());
      manifestUrlsByFrame.set(frameUrl, urls);
    };
    if (options.videos) {
      page.on("request", onManifestRequest);
    }

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

    // Some content (below-the-fold images, nav/menu links, "load more"
    // sections) only renders once an IntersectionObserver or scroll handler
    // sees it enter the viewport. Scrolling through the page once before
    // extracting anything gives that content a chance to mount first.
    if (options.pageImages || options.links || options.pageSnapshot || options.videos) {
      await triggerLazyContent(page);
    }
    // Stop listening once the real page load is done — later steps
    // (synthetic image-load checks, link-navigation confirmations, resizing
    // for screenshots) make their own requests that aren't part of what a
    // normal visitor's browser would fetch for this page, so they shouldn't
    // feed into the snapshot's failure list.
    if (options.pageSnapshot) {
      page.off("requestfailed", onRequestFailed);
      page.off("response", onResponse);
    }

    const { images: rawImages, links: rawLinks } = await page.evaluate(
      ({ featuredImages, pageImages, links }) => {
        const found: { url: string; source: string }[] = [];
        const foundLinks: { url: string; text: string }[] = [];

        // Plain `querySelectorAll` never looks inside a shadow root, so a
        // link or image rendered by a web component (common in modern
        // design systems) would silently be invisible to it. This walks the
        // light DOM plus every (open) shadow root, arbitrarily nested.
        function queryDeep(root: ParentNode, selector: string): Element[] {
          const results = Array.from(root.querySelectorAll(selector));
          root.querySelectorAll("*").forEach((el) => {
            if (el.shadowRoot) results.push(...queryDeep(el.shadowRoot, selector));
          });
          return results;
        }

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
          queryDeep(document, "img").forEach((img) => {
            const el = img as HTMLImageElement;
            const src = el.currentSrc || el.getAttribute("src") || "";
            if (src) found.push({ url: src, source: "img" });
            const srcset = el.getAttribute("srcset");
            if (srcset) {
              const first = srcset.split(",")[0]?.trim().split(/\s+/)[0];
              if (first) found.push({ url: first, source: "img" });
            }
          });

          const urlFromCss = (value: string): string | null => {
            const match = value.match(/url\((['"]?)(.*?)\1\)/);
            return match ? match[2] : null;
          };

          queryDeep(document, "*").forEach((el) => {
            const bg = window.getComputedStyle(el).backgroundImage;
            if (bg && bg !== "none") {
              const url = urlFromCss(bg);
              if (url) found.push({ url, source: "background" });
            }
          });
        }

        if (links) {
          queryDeep(document, "a[href]").forEach((a) => {
            const href = a.getAttribute("href");
            if (!href) return;
            const text = (a.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 200);
            foundLinks.push({ url: href, text });
          });
        }

        return { images: found, links: foundLinks };
      },
      {
        featuredImages: options.featuredImages,
        pageImages: options.pageImages,
        links: options.links,
      },
    );

    const featuredTags: Set<string> = new Set(FEATURED_TAGS);
    const seen = new Set<string>();
    const results: DiscoveredImage[] = [];
    for (const item of rawImages) {
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

    // Every href is kept as its own row, duplicates included — the same
    // link appearing in a nav and a footer are two occurrences a link
    // checker needs to report on separately, unlike repeated <img> tags.
    const links: DiscoveredLink[] = [];
    for (const item of rawLinks) {
      let absolute: string;
      try {
        absolute = new URL(item.url, page.url()).href;
      } catch {
        continue;
      }
      links.push({ url: absolute, text: item.text, status: null });
    }
    const totalLinksFound = links.length;
    const truncatedLinks = links.slice(0, MAX_LINKS);
    await checkLinks(truncatedLinks, page);

    if (options.videos) {
      page.off("request", onManifestRequest);
    }
    const videos = options.videos
      ? await discoverVideos(page, manifestUrlsByFrame)
      : [];
    const totalVideosFound = videos.length;
    const truncatedVideos = videos.slice(0, MAX_VIDEOS);
    await checkVideos(truncatedVideos, page);

    const hyvorTalk = options.hyvorTalk
      ? await captureHyvorTalk(page)
      : { found: false };
    const canonicalUrl = options.canonicalUrl ? await captureCanonicalUrl(page) : null;
    const meta = options.pageMeta ? await captureMeta(page) : null;
    // Captured before screenshots resize the viewport — the DOM/HTML itself
    // doesn't depend on viewport size, so there's no reason to wait.
    const pageSnapshot = options.pageSnapshot
      ? await capturePageSnapshot(
          page,
          await confirmFailedResources(context.request, failedResourceCandidates),
        )
      : null;
    // Resizes the viewport repeatedly, so it must run after every step above
    // that depends on the page's original layout/viewport.
    const screenshots = options.screenshots ? await captureScreenshots(page) : null;

    return {
      images: truncated,
      totalFound,
      links: truncatedLinks,
      totalLinksFound,
      videos: truncatedVideos,
      totalVideosFound,
      hyvorTalk,
      redirect,
      canonicalUrl,
      screenshots,
      pageSnapshot,
      meta,
    };
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
 * Reads the page's <title>, meta description, effective language (<html
 * lang="...">, falling back to <meta http-equiv="content-language">), and
 * every other <meta name/property="..." content="..."> tag on the page —
 * the last of these covers Open Graph, Twitter Card, robots, viewport, and
 * any other meta tags a site happens to ship, without needing a curated
 * list of which ones to look for.
 */
async function captureMeta(page: Page): Promise<MetaResult> {
  return page.evaluate(() => {
    const title = document.title || null;
    const description =
      document.querySelector('meta[name="description"]')?.getAttribute("content") ?? null;
    const language =
      document.documentElement.getAttribute("lang") ||
      document.querySelector('meta[http-equiv="content-language"]')?.getAttribute("content") ||
      null;

    const meta: Record<string, string> = {};
    document.querySelectorAll("meta[name], meta[property]").forEach((el) => {
      const key = el.getAttribute("name") ?? el.getAttribute("property");
      const content = el.getAttribute("content");
      if (key && content !== null && !(key in meta)) {
        meta[key] = content;
      }
    });

    return { title, description, language, meta };
  });
}

const MAX_SNAPSHOT_BYTES = 5_000_000;
const MAX_FAILED_RESOURCES_SHOWN = 25;
const MAX_MISSING_ELEMENTS_SHOWN = 25;

/**
 * Finds every element (arbitrarily nested) with an open shadow root — a
 * plain `outerHTML` serialization never includes what's inside a shadow
 * root, so any section of the page built as a web component silently comes
 * out empty in the snapshot even though nothing failed to fetch. Returns a
 * short human-readable identifier (tag#id.class) per element so the viewer
 * can tell which sections of the page are affected.
 */
async function findShadowHostDescriptors(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const descriptors: string[] = [];
    function describe(el: Element): string {
      const tag = el.tagName.toLowerCase();
      const id = el.id ? `#${el.id}` : "";
      const classes =
        typeof el.className === "string" && el.className.trim()
          ? `.${el.className.trim().split(/\s+/).join(".")}`
          : "";
      return `${tag}${id}${classes}`;
    }
    function walk(root: ParentNode) {
      root.querySelectorAll("*").forEach((el) => {
        if (el.shadowRoot) {
          descriptors.push(describe(el));
          walk(el.shadowRoot);
        }
      });
    }
    walk(document);
    return descriptors;
  });
}

/**
 * Captures the page's live-rendered HTML so it can be displayed elsewhere
 * looking like the original — a `<base>` tag is injected pointing at the
 * page's own URL so every relative stylesheet/image/font reference in the
 * markup keeps resolving against the real site once rendered somewhere
 * else, without needing to fetch and inline each asset ourselves. `<script>`
 * tags are stripped so the snapshot can never execute code, regardless of
 * how it's later embedded — a raw copy of an untrusted third-party page is
 * not safe to render as live, scriptable HTML. Truncated at
 * `MAX_SNAPSHOT_BYTES` since some pages serialize to tens of megabytes.
 * `failedResources` (collected by the caller from the real page load) is
 * passed through so the viewer can be told which assets may render
 * differently than the live page.
 */
async function capturePageSnapshot(
  page: Page,
  failedResources: FailedSnapshotResource[],
): Promise<PageSnapshotResult> {
  try {
    const rawHtml = await page.evaluate(() => document.documentElement.outerHTML);
    const withoutScripts = rawHtml.replace(/<script[\s\S]*?<\/script\s*>/gi, "");
    const withBase = injectBaseHref(withoutScripts, page.url());
    const shadowHosts = await findShadowHostDescriptors(page).catch(() => []);

    const resourceFields =
      failedResources.length > 0
        ? {
            failedResources: failedResources.slice(0, MAX_FAILED_RESOURCES_SHOWN),
            failedResourceCount: failedResources.length,
          }
        : {};
    const missingElementFields =
      shadowHosts.length > 0
        ? {
            missingElements: shadowHosts.slice(0, MAX_MISSING_ELEMENTS_SHOWN),
            missingElementCount: shadowHosts.length,
          }
        : {};

    if (Buffer.byteLength(withBase, "utf-8") > MAX_SNAPSHOT_BYTES) {
      return {
        html: withBase.slice(0, MAX_SNAPSHOT_BYTES),
        error: "Snapshot was truncated because the page is unusually large.",
        ...resourceFields,
        ...missingElementFields,
      };
    }
    return { html: withBase, ...resourceFields, ...missingElementFields };
  } catch (err) {
    return {
      html: null,
      error: `Failed to capture page snapshot: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
}

function injectBaseHref(html: string, baseUrl: string): string {
  const baseTag = `<base href="${baseUrl.replace(/"/g, "&quot;")}">`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (match) => `${match}${baseTag}`);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, (match) => `${match}<head>${baseTag}</head>`);
  }
  return `${baseTag}${html}`;
}

const CONFIRM_RESOURCE_ATTEMPTS = 2;
const CONFIRM_RESOURCE_CONCURRENCY = 6;

/**
 * Re-checks each resource that looked like it failed during the real page
 * load, with a couple of direct retries, before trusting it enough to show
 * the user — a single failed request is frequently a transient blip (CDN
 * rate-limit, a slow first TLS handshake) rather than a genuinely broken
 * resource, the same reasoning `confirmBrokenViaNavigation` and
 * `verifyInBrowser` already apply to links and images elsewhere in this
 * file. Without this, the snapshot's failure list would flap between scrapes
 * of the same page for reasons that have nothing to do with the page itself.
 */
async function confirmFailedResources(
  request: APIRequestContext,
  candidates: FailedSnapshotResource[],
): Promise<FailedSnapshotResource[]> {
  if (candidates.length === 0) return [];

  const confirmed: FailedSnapshotResource[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < candidates.length) {
      const candidate = candidates[cursor];
      cursor += 1;
      const outcome = await stillFailing(request, candidate.url);
      if (outcome.failed) {
        confirmed.push({ ...candidate, status: outcome.status ?? candidate.status });
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONFIRM_RESOURCE_CONCURRENCY, candidates.length) }, worker),
  );
  return confirmed;
}

async function stillFailing(
  request: APIRequestContext,
  url: string,
): Promise<{ failed: boolean; status?: number }> {
  let lastStatus: number | undefined;
  for (let attempt = 1; attempt <= CONFIRM_RESOURCE_ATTEMPTS; attempt += 1) {
    try {
      const res = await request.fetch(url, {
        method: "GET",
        timeout: 10000,
        failOnStatusCode: false,
      });
      if (res.ok()) return { failed: false };
      lastStatus = res.status();
    } catch {
      // Network-level failure; fall through to retry/backoff below.
    }
    if (attempt < CONFIRM_RESOURCE_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return { failed: true, status: lastStatus };
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

const LINK_CHECK_CONCURRENCY = 8;
const LINK_CHECK_TIMEOUT_MS = 10000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+()\d][\d\s().-]{2,}$/;

/**
 * Checks every discovered link, regardless of scheme, rather than only
 * checking http(s) links and silently skipping the rest:
 *
 * - http(s) links to the *current* page (same origin/path/search, only the
 *   fragment differs, e.g. `#pricing`) are verified by looking for a
 *   matching id/name in the already-loaded DOM instead of re-fetching the
 *   page — a fetch would only prove the page loads, not that the anchor
 *   target actually exists.
 * - Other http(s) links get a real network request (see `requestWithFallback`).
 *   Every unique URL is only requested once and the result applied to every
 *   matching entry, so duplicate hrefs on the page (kept as separate rows
 *   for display) don't each trigger their own request. Anything that still
 *   looks broken afterward is re-verified with an actual browser navigation
 *   (see `confirmBrokenViaNavigation`) before being reported as broken.
 * - `mailto:`/`tel:` links are validated by format, since there's no
 *   network resource to fetch.
 * - Truly unverifiable hrefs (`javascript:`, `data:`, etc.) are reported
 *   with an informational `note`, not `error` — they aren't broken, they're
 *   just not a checkable web address.
 */
async function checkLinks(links: DiscoveredLink[], page: Page): Promise<void> {
  if (links.length === 0) return;

  const currentPage = parseUrl(page.url());
  const fragmentIds = new Set<string>();
  const httpUrls = new Set<string>();

  for (const link of links) {
    const url = parseUrl(link.url);
    if (!url) {
      link.error = "Could not parse URL";
      continue;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    if (currentPage && isSamePageFragment(url, currentPage)) {
      if (url.hash.slice(1)) fragmentIds.add(url.hash.slice(1));
    } else {
      httpUrls.add(link.url);
    }
  }

  const fragmentResults =
    fragmentIds.size > 0
      ? await checkFragmentsExist(page, Array.from(fragmentIds))
      : new Map<string, boolean>();
  const httpResults = await checkHttpUrls(Array.from(httpUrls), page.context().request);
  await confirmBrokenViaNavigation(httpResults, page.context());

  for (const link of links) {
    const url = parseUrl(link.url);
    if (!url) continue;

    if (url.protocol === "http:" || url.protocol === "https:") {
      if (currentPage && isSamePageFragment(url, currentPage)) {
        const id = url.hash.slice(1);
        if (!id) {
          // href="" or href="#" resolves to "the current page", which is
          // technically always true and tells the user nothing — this
          // pattern is almost always a JS-driven button (a click handler
          // opens a modal, toggles a menu, etc.) rather than a real link,
          // and whatever it actually does isn't in the page's HTML to check.
          link.note = "Empty href — likely a JavaScript-driven button, not a real link";
        } else if (!fragmentResults.get(id)) {
          link.error = `No element with id="${id}" (or name="${id}") found on the page`;
        }
        continue;
      }
      const result = httpResults.get(link.url);
      if (result) {
        link.status = result.status;
        link.error = result.error;
      }
      continue;
    }

    if (url.protocol === "mailto:") {
      const addresses = url.pathname.split(",").map((a) => a.trim()).filter(Boolean);
      const invalid = addresses.filter((a) => !EMAIL_RE.test(a));
      link.error =
        addresses.length === 0
          ? "mailto: link has no email address"
          : invalid.length > 0
            ? `Invalid email address: ${invalid.join(", ")}`
            : undefined;
      continue;
    }

    if (url.protocol === "tel:") {
      const number = decodeURIComponent(url.pathname);
      link.error = PHONE_RE.test(number) ? undefined : `Invalid phone number: ${number}`;
      continue;
    }

    link.note = `Not a checkable web address (${url.protocol} link)`;
  }
}

const VIDEO_ELEMENT_TIMEOUT_MS = 5000;

/**
 * Finds every video on the page — native <video> elements (in any frame,
 * including cross-origin iframes, and piercing open shadow roots the way
 * Playwright locators already do by default) plus iframes pointing at a
 * known video-embed host — and screenshots each element directly via
 * Playwright's own element-screenshot API. That's the only way to actually
 * see what a video *is*: the discovered URL alone tells you nothing for an
 * embed player (usually streams via a blob: URL with no visible file), and
 * not much more for a native file URL either. Screenshotting is
 * best-effort — an element that's zero-size, off-screen, or mid-navigation
 * simply comes back without one rather than failing the whole scrape.
 *
 * When a <video> reports a `blob:` src, `manifestUrlsByFrame` (an .m3u8/.mpd
 * request log keyed by frame URL, collected by the caller while the page was
 * loading) is used to substitute a real, checkable URL instead — see the
 * comment where that map is built for why the blob: URL itself never is
 * one. This is a same-frame heuristic (take that frame's first manifest
 * request) rather than a precise per-element match, so a frame hosting more
 * than one MSE-based video could attribute the wrong manifest to the wrong
 * element; single-video-per-frame, by far the common case for embed
 * players, is unaffected.
 */
async function discoverVideos(
  page: Page,
  manifestUrlsByFrame: Map<string, string[]>,
): Promise<DiscoveredVideo[]> {
  const found: DiscoveredVideo[] = [];
  const seen = new Set<string>();

  const add = (rawUrl: string, baseUrl: string, note: string | undefined, screenshot: string | undefined) => {
    let absolute: string;
    try {
      absolute = new URL(rawUrl, baseUrl).href;
    } catch {
      return;
    }
    if (seen.has(absolute)) return;
    seen.add(absolute);
    found.push({ url: absolute, status: null, note, screenshot });
  };

  const screenshotElement = async (locator: Locator): Promise<string | undefined> => {
    try {
      const buffer = await locator.screenshot({ type: "png", timeout: VIDEO_ELEMENT_TIMEOUT_MS });
      return `data:image/png;base64,${buffer.toString("base64")}`;
    } catch {
      return undefined;
    }
  };

  for (const frame of page.frames()) {
    const videoCount = await frame.locator("video").count().catch(() => 0);
    for (let i = 0; i < videoCount; i += 1) {
      const videoEl = frame.locator("video").nth(i);
      const screenshot = await screenshotElement(videoEl);
      let srcs: string[];
      try {
        srcs = await videoEl.evaluate((el: HTMLVideoElement) => {
          const list: string[] = [];
          const own = el.currentSrc || el.getAttribute("src") || "";
          if (own) list.push(own);
          el.querySelectorAll("source").forEach((source) => {
            const src = source.getAttribute("src");
            if (src) list.push(src);
          });
          return list;
        });
      } catch {
        continue;
      }
      for (const src of srcs) {
        if (src.startsWith("blob:")) {
          const manifestUrls = manifestUrlsByFrame.get(frame.url());
          if (manifestUrls && manifestUrls.length > 0) {
            add(
              manifestUrls[0],
              frame.url(),
              "Underlying stream manifest for this video — its <video> element reports a blob: URL because it plays via MediaSource/HLS (e.g. hls.js), so this manifest URL is the actual network resource being fetched, recovered from the page's own requests.",
              screenshot,
            );
            continue;
          }
        }
        add(src, frame.url(), undefined, screenshot);
      }
    }

    const iframeCount = await frame.locator("iframe[src]").count().catch(() => 0);
    for (let i = 0; i < iframeCount; i += 1) {
      const iframeEl = frame.locator("iframe[src]").nth(i);
      const src = await iframeEl.getAttribute("src").catch(() => null);
      if (!src) continue;
      let absoluteUrl: URL;
      try {
        absoluteUrl = new URL(src, frame.url());
      } catch {
        continue;
      }
      if (!isVideoEmbedHost(absoluteUrl.hostname)) continue;
      const screenshot = await screenshotElement(iframeEl);
      add(
        absoluteUrl.href,
        frame.url(),
        "Embedded video player (iframe) — only the embed URL's reachability was checked, not the underlying video file.",
        screenshot,
      );
    }
  }

  return found;
}

/**
 * Status-checks every discovered video URL the same way broken links are
 * checked — a HEAD/GET request, with anything that still looks broken
 * re-confirmed via an actual browser navigation (`confirmBrokenViaNavigation`
 * already exists for exactly that WAF-false-positive reason, so it's reused
 * as-is here rather than duplicated). `blob:` URLs (adaptive-streaming
 * players routinely hand `<video>` a `URL.createObjectURL()` reference) only
 * exist inside that specific browser tab's memory — there's nothing an
 * external HTTP request could ever check, so those are flagged via `note`
 * instead of being sent through the network check. `data:` URLs carry the
 * video inline already, so there's nothing to verify either — left alone.
 */
async function checkVideos(videos: DiscoveredVideo[], page: Page): Promise<void> {
  const checkable = videos.filter((video) => {
    if (video.url.startsWith("blob:")) {
      video.note =
        "Not checkable — this video streams via a blob: URL that only exists in the live browser tab, not as a fetchable file.";
      return false;
    }
    return !video.url.startsWith("data:");
  });
  if (checkable.length === 0) return;

  const uniqueUrls = Array.from(new Set(checkable.map((v) => v.url)));
  const results = await checkHttpUrls(uniqueUrls, page.context().request);
  await confirmBrokenViaNavigation(results, page.context());

  for (const video of checkable) {
    const result = results.get(video.url);
    if (result) {
      video.status = result.status;
      video.error = result.error;
    }
  }
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isSamePageFragment(url: URL, currentPage: URL): boolean {
  return (
    url.origin === currentPage.origin &&
    url.pathname === currentPage.pathname &&
    url.search === currentPage.search
  );
}

/** Looks for a matching `id` or `name` attribute in the already-loaded DOM, in one batched call. */
async function checkFragmentsExist(
  page: Page,
  ids: string[],
): Promise<Map<string, boolean>> {
  const found = await page.evaluate((ids: string[]) => {
    return ids.map(
      (id) =>
        !!document.getElementById(id) ||
        !!document.getElementsByName(id).length,
    );
  }, ids);
  return new Map(ids.map((id, i) => [id, found[i]]));
}

async function checkHttpUrls(
  urls: string[],
  request: APIRequestContext,
): Promise<Map<string, { status: number | null; error?: string }>> {
  const results = new Map<string, { status: number | null; error?: string }>();
  if (urls.length === 0) return results;

  let cursor = 0;
  async function worker() {
    while (cursor < urls.length) {
      const url = urls[cursor];
      cursor += 1;
      results.set(url, await checkLinkStatus(url, request));
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(LINK_CHECK_CONCURRENCY, urls.length) }, () => worker()),
  );
  return results;
}

const NAV_CONFIRM_CONCURRENCY = 3;
const MAX_NAV_CONFIRMATIONS = 30;

/**
 * The HEAD/GET request check above is still not the same request a human
 * clicking the link would make — it can be wrong for sites whose bot
 * detection specifically fingerprints non-navigation requests (TLS/HTTP2
 * handshake, timing, etc.) even when they share the page's cookies and
 * User-Agent. Rather than trust a "broken" verdict from that check, this
 * re-opens anything that looked broken as an actual browser navigation
 * (new tab, same context, so cookies still carry over) — the exact test a
 * person clicking the link gets — before reporting it broken. Only runs on
 * the (usually few) links that already look broken, capped at
 * `MAX_NAV_CONFIRMATIONS`, so a page full of working links isn't slowed
 * down by this extra pass.
 */
async function confirmBrokenViaNavigation(
  results: Map<string, { status: number | null; error?: string }>,
  context: BrowserContext,
): Promise<void> {
  const broken = Array.from(results.entries())
    .filter(([, r]) => r.error)
    .slice(0, MAX_NAV_CONFIRMATIONS);
  if (broken.length === 0) return;

  let cursor = 0;
  async function worker() {
    while (cursor < broken.length) {
      const [url] = broken[cursor];
      cursor += 1;
      results.set(url, await confirmViaNavigation(context, url));
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(NAV_CONFIRM_CONCURRENCY, broken.length) }, () => worker()),
  );
}

async function confirmViaNavigation(
  context: BrowserContext,
  url: string,
): Promise<{ status: number | null; error?: string }> {
  const page = await context.newPage();
  // A navigation to a URL that triggers a file download (a PDF, a ZIP, an
  // image served with Content-Disposition: attachment) makes `page.goto`
  // reject with ERR_ABORTED even though the link is completely fine — the
  // browser abandoned the *page* navigation in favor of downloading the
  // resource, which is the correct, working behavior for that link.
  let downloadDetected = false;
  page.once("download", () => {
    downloadDetected = true;
  });
  try {
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: LINK_CHECK_TIMEOUT_MS });
    if (!res) return { status: null, error: "No response received" };
    return {
      status: res.status(),
      error: res.ok() ? undefined : `${res.status()} ${res.statusText()}`.trim(),
    };
  } catch (err) {
    if (downloadDetected) return { status: null };
    return {
      status: null,
      error: err instanceof Error ? err.message : "Failed to reach URL",
    };
  } finally {
    await page.close().catch(() => {});
  }
}

// Checked through the browser context's own request API — which shares its
// cookies and User-Agent with the page that already loaded successfully —
// rather than a bare Node-side `fetch`. Sites behind a WAF/bot-detection
// (Cloudflare and friends) routinely let the real browser navigation through
// while resetting or 403-ing an isolated request that doesn't carry the same
// session/fingerprint, which was producing false "broken" results for links
// that work fine when actually clicked. Same rationale as why images are
// verified via the page's own `Image()` rather than a separate fetch.
async function requestOnce(
  request: APIRequestContext,
  url: string,
  method: "HEAD" | "GET",
) {
  return request.fetch(url, { method, timeout: LINK_CHECK_TIMEOUT_MS, failOnStatusCode: false });
}

// Some servers don't support HEAD at all (405/501); others specifically
// bot-detect HEAD requests (rarer method, easier tell) while answering GET
// normally, or just reset the connection. Any non-2xx or thrown HEAD is
// treated as inconclusive rather than broken, and retried with GET — the
// method an actual click always uses — before trusting the result.
async function requestWithFallback(request: APIRequestContext, url: string) {
  try {
    const res = await requestOnce(request, url, "HEAD");
    if (res.ok()) return res;
    return await requestOnce(request, url, "GET");
  } catch {
    return requestOnce(request, url, "GET");
  }
}

async function checkLinkStatus(
  url: string,
  request: APIRequestContext,
): Promise<{ status: number | null; error?: string }> {
  try {
    const res = await requestWithFallback(request, url);
    return {
      status: res.status(),
      error: res.ok() ? undefined : `${res.status()} ${res.statusText()}`.trim(),
    };
  } catch (err) {
    return {
      status: null,
      error: err instanceof Error ? err.message : "Failed to reach URL",
    };
  }
}
