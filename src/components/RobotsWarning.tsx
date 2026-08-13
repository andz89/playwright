interface RobotsWarningProps {
  allowed: boolean;
  message: string;
  blocked: boolean;
  onScrapeAnyway?: () => void;
}

export function RobotsWarning({ allowed, message, blocked, onScrapeAnyway }: RobotsWarningProps) {
  if (allowed) {
    return (
      <p className="text-xs text-black/50 dark:text-white/50">✓ {message}</p>
    );
  }

  return (
    <div className="rounded-md border border-amber-400/50 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
      <p className="font-medium">robots.txt disallows scraping this page</p>
      <p className="mt-1 text-xs opacity-90">{message}</p>
      {blocked && onScrapeAnyway && (
        <button
          onClick={onScrapeAnyway}
          className="mt-2 rounded-md border border-amber-500 px-3 py-1 text-xs font-medium hover:bg-amber-100 dark:hover:bg-amber-900/40"
        >
          Scrape anyway
        </button>
      )}
    </div>
  );
}
