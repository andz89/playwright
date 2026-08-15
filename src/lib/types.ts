export const FEATURED_TAGS = [
  "og:image",
  "og:image:secure_url",
  "twitter:image",
  "twitter:image:src",
  "image_src",
] as const;

export type FeaturedTag = (typeof FEATURED_TAGS)[number];

export type ImageSource = "img" | "background" | FeaturedTag;

const FEATURED_TAG_SET: Set<string> = new Set(FEATURED_TAGS);

export function isFeaturedImage(image: { source: ImageSource }): boolean {
  return FEATURED_TAG_SET.has(image.source);
}

export interface ImageResult {
  id: string;
  /** Absolute URL of the image (or a data: URI if it was inlined) */
  src: string;
  /** Where the image reference was found on the page */
  source: ImageSource;
  /** Set when the image reference could not be resolved */
  error?: string;
}

export interface LinkResult {
  id: string;
  /** Absolute URL resolved from the anchor's href */
  url: string;
  /** The anchor's visible text, if any */
  text: string;
  /** HTTP status code the link resolved to, or null if it isn't an http(s) link */
  status: number | null;
  /** Set when the link was checked and found broken (bad status, missing anchor target, invalid email/phone) */
  error?: string;
  /** Set when the link isn't broken but also isn't something that can be verified (e.g. a javascript: action) */
  note?: string;
}

export interface HyvorTalkResult {
  found: boolean;
  /** Attributes read off the widget's root element (website-id, page-id, etc.) */
  properties?: Record<string, string>;
  /** PNG screenshot of just the widget block, as a data: URL */
  screenshot?: string;
  /** Set when a widget was detected but couldn't be captured (found stays false) */
  error?: string;
}

export interface RedirectInfo {
  /** The URL the user submitted */
  requestedUrl: string;
  /** The URL the browser actually ended up on (where results were scraped from) */
  finalUrl: string;
  /** Every hop between requestedUrl and finalUrl, inclusive of both ends */
  chain: string[];
}

export interface CanonicalResult {
  /** Absolute URL from <link rel="canonical">, or null if the page has none */
  url: string | null;
}

export type SnapshotResourceType = "stylesheet" | "image" | "font" | "video";

export interface FailedSnapshotResource {
  url: string;
  type: SnapshotResourceType;
  /** HTTP status if the request got a response (e.g. 404); absent for network-level failures. */
  status?: number;
}

export interface PageSnapshotResult {
  /**
   * Serialized outer HTML of the live-rendered page, with a <base> tag
   * injected so relative stylesheet/image/font URLs resolve against the
   * original site, and <script> tags stripped. Null if the capture failed.
   */
  html: string | null;
  error?: string;
  /** Sample of stylesheet/image/font/video resources that failed to load during capture (capped). */
  failedResources?: FailedSnapshotResource[];
  /** True total of failed resources — may exceed failedResources.length. */
  failedResourceCount?: number;
  /**
   * Tag/id/class of elements whose Shadow DOM content couldn't be included
   * in this snapshot (capped) — serializing `outerHTML` never captures what's
   * inside a shadow root, so those sections render blank/missing even though
   * nothing failed to fetch.
   */
  missingElements?: string[];
  /** True total of such elements — may exceed missingElements.length. */
  missingElementCount?: number;
}

export type ScreenshotDevice = "desktop" | "tablet" | "mobile";

export interface ScreenshotSet {
  /** Full-page PNG screenshot as a data: URL, per device size; null if that one failed to capture */
  desktop: string | null;
  tablet: string | null;
  mobile: string | null;
  /** Set when at least one device's capture failed */
  error?: string;
}

export type ScrapeEvent =
  | { type: "robots"; allowed: boolean; message: string }
  | { type: "status"; message: string }
  | { type: "redirect"; info: RedirectInfo }
  | { type: "canonical"; result: CanonicalResult }
  | { type: "screenshots"; result: ScreenshotSet }
  | { type: "pageSnapshot"; result: PageSnapshotResult }
  | { type: "found"; total: number }
  | { type: "progress"; current: number; total: number; message: string }
  | { type: "image"; result: ImageResult }
  | { type: "hyvorTalk"; result: HyvorTalkResult }
  | { type: "link"; result: LinkResult }
  | {
      type: "done";
      totalImages: number;
      failedImages: number;
      totalLinks?: number;
      brokenLinks?: number;
    }
  | { type: "error"; message: string; fatal?: boolean };

export interface ScrapeOptions {
  featuredImages: boolean;
  pageImages: boolean;
  hyvorTalk: boolean;
  canonicalUrl: boolean;
  screenshots: boolean;
  links: boolean;
  pageSnapshot: boolean;
}

export const DEFAULT_SCRAPE_OPTIONS: ScrapeOptions = {
  featuredImages: true,
  pageImages: true,
  hyvorTalk: true,
  canonicalUrl: true,
  screenshots: true,
  links: true,
  pageSnapshot: false,
};

export interface ScrapeRequestBody {
  url: string;
  ignoreRobots?: boolean;
  options?: ScrapeOptions;
}

export interface ExportRequestBody {
  url: string;
  images: ImageResult[];
  hyvorTalk?: HyvorTalkResult;
}
