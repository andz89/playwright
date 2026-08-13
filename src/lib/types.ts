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
  | { type: "found"; total: number }
  | { type: "progress"; current: number; total: number; message: string }
  | { type: "image"; result: ImageResult }
  | { type: "hyvorTalk"; result: HyvorTalkResult }
  | { type: "done"; totalImages: number; failedImages: number }
  | { type: "error"; message: string; fatal?: boolean };

export interface ScrapeOptions {
  featuredImages: boolean;
  pageImages: boolean;
  hyvorTalk: boolean;
  canonicalUrl: boolean;
  screenshots: boolean;
}

export const DEFAULT_SCRAPE_OPTIONS: ScrapeOptions = {
  featuredImages: true,
  pageImages: true,
  hyvorTalk: true,
  canonicalUrl: true,
  screenshots: true,
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
