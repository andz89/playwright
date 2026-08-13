interface ProgressBarProps {
  message: string;
  current: number | null;
  total: number | null;
}

export function ProgressBar({ message, current, total }: ProgressBarProps) {
  const pct =
    total && total > 0 ? Math.round(((current ?? 0) / total) * 100) : null;

  return (
    <div className="w-full rounded-md border border-black/10 dark:border-white/10 bg-black/[.03] dark:bg-white/[.04] px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        <p className="text-sm">{message || "Working…"}</p>
        {pct !== null && (
          <span className="ml-auto text-xs tabular-nums text-black/60 dark:text-white/60">
            {current}/{total}
          </span>
        )}
      </div>
      {pct !== null && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
          <div
            className="h-full rounded-full bg-blue-600 transition-all duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}
