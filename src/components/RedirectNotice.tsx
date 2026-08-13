import type { RedirectInfo } from "@/lib/types";

interface RedirectNoticeProps {
  info: RedirectInfo;
}

export function RedirectNotice({ info }: RedirectNoticeProps) {
  return (
    <div className="rounded-md border border-blue-400/50 bg-blue-50 dark:bg-blue-950/40 px-4 py-3 text-sm text-blue-900 dark:text-blue-200">
      <p className="font-medium">Page redirected</p>
      <p className="mt-1 text-xs opacity-90 break-all">
        Requested <span className="font-mono">{info.requestedUrl}</span>, but
        results below came from{" "}
        <span className="font-mono">{info.finalUrl}</span>.
      </p>
      {info.chain.length > 2 && (
        <p className="mt-1 text-xs opacity-75 break-all">
          Chain: {info.chain.join(" → ")}
        </p>
      )}
    </div>
  );
}
