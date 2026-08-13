function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim();
}

/**
 * Builds a filesystem-safe PNG filename from the URL the user typed into
 * the form, so a screenshot of this app's results page is named after what
 * was scraped rather than a generic "screenshot.png". Drops the protocol
 * (its slashes would otherwise sanitize into noisy underscores) but keeps
 * host/path/query so different inputs still produce distinct filenames.
 */
export function filenameForUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "screenshot.png";

  let base: string;
  try {
    const u = new URL(trimmed);
    base = `${u.hostname}${u.pathname}${u.search}`.replace(/\/+$/, "") || u.hostname;
  } catch {
    base = trimmed;
  }

  return `${sanitize(base) || "screenshot"}.png`;
}
