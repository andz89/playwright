import robotsParser from "robots-parser";

export const SCRAPER_USER_AGENT =
  "ImageScraperBot/1.0 (single-page educational image scraping tool; run locally, not a crawler)";

export interface RobotsCheckResult {
  allowed: boolean;
  message: string;
}

/**
 * Fetches and evaluates the target site's robots.txt before we scrape a page.
 * If robots.txt is missing or unreachable we fall back to "allowed" per the
 * standard convention (no robots.txt = no restrictions).
 */
export async function checkRobotsAllowed(
  targetUrl: string,
): Promise<RobotsCheckResult> {
  const url = new URL(targetUrl);
  const robotsUrl = `${url.protocol}//${url.host}/robots.txt`;

  let body = "";
  try {
    const res = await fetch(robotsUrl, {
      headers: { "User-Agent": SCRAPER_USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      body = await res.text();
    } else {
      return {
        allowed: true,
        message: `No robots.txt restrictions found (${robotsUrl} returned ${res.status}).`,
      };
    }
  } catch {
    return {
      allowed: true,
      message: `Could not fetch ${robotsUrl}; proceeding as if scraping is allowed.`,
    };
  }

  const robots = robotsParser(robotsUrl, body);
  const allowed = robots.isAllowed(targetUrl, SCRAPER_USER_AGENT) ?? true;

  return {
    allowed,
    message: allowed
      ? `robots.txt at ${robotsUrl} allows scraping this page.`
      : `robots.txt at ${robotsUrl} disallows scraping this page for our user agent (${SCRAPER_USER_AGENT}).`,
  };
}
