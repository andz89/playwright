import type { CanonicalResult } from "@/lib/types";
import AInote from "./AInote";
interface CanonicalLinkProps {
  result: CanonicalResult;
  pageUrl: string;
}

export function CanonicalLink({ result, pageUrl }: CanonicalLinkProps) {
  if (!result.url) {
    return (
      <div
      id="canonical-link"
      className="rounded-md border border-black/10 dark:border-white/10 px-4 py-3 text-sm"
    >
        <AInote />
        <p className="text-xs text-black/50 dark:text-white/50">
          No canonical link (&lt;link rel=&quot;canonical&quot;&gt;) found on
          this page.
        </p>
      </div>
    );
  }

  const differs = (() => {
    try {
      return new URL(result.url).href !== new URL(pageUrl).href;
    } catch {
      return result.url !== pageUrl;
    }
  })();

  return (
    <div
      id="canonical-link"
      className="rounded-md border border-black/10 dark:border-white/10 px-4 py-3 text-sm"
    >
      <AInote />

      <p className="font-medium">Source URL</p>
      <a
        href={pageUrl}
        target="_blank"
        rel="noreferrer noopener"
        className="mt-1 block truncate text-blue-600 hover:underline dark:text-blue-400"
        title={pageUrl}
      >
        {pageUrl}
      </a>
      <p className="mt-3 font-medium">Canonical URL</p>
      <a
        href={result.url}
        target="_blank"
        rel="noreferrer noopener"
        className="mt-1 block truncate text-blue-600 hover:underline dark:text-blue-400"
        title={result.url}
      >
        {result.url}
      </a>
      {differs && (
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
          This differs from the page that was scraped.
        </p>
      )}
    </div>
  );
}
