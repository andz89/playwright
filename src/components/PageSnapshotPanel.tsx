"use client";

import { useState } from "react";
import type {
  FailedSnapshotResource,
  PageSnapshotResult,
  SnapshotResourceType,
} from "@/lib/types";
import AInote from "./AInote";

interface PageSnapshotPanelProps {
  result: PageSnapshotResult;
}

const TYPE_LABELS: Record<SnapshotResourceType, string> = {
  stylesheet: "stylesheet",
  image: "image",
  font: "font",
  video: "video",
};

const TYPE_IMPACT: Record<SnapshotResourceType, string> = {
  stylesheet: "styling from this file will be missing in the snapshot",
  image: "will appear broken in the snapshot",
  font: "text may fall back to a default font in the snapshot",
  video: "won't be playable in the snapshot",
};

function summarizeCounts(resources: FailedSnapshotResource[]): string {
  const counts = new Map<SnapshotResourceType, number>();
  for (const r of resources) {
    counts.set(r.type, (counts.get(r.type) ?? 0) + 1);
  }
  const parts = Array.from(counts.entries()).map(
    ([type, count]) => `${count} ${TYPE_LABELS[type]}${count === 1 ? "" : "s"}`,
  );
  if (parts.length <= 1) return parts.join("");
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

type DeviceView = "desktop" | "tablet" | "mobile";

const DEVICES: {
  key: DeviceView;
  label: string;
  width: string;
  height: string;
}[] = [
  { key: "desktop", label: "Desktop", width: "100%", height: "75vh" },
  { key: "tablet", label: "Tablet", width: "768px", height: "1024px" },
  { key: "mobile", label: "Mobile", width: "375px", height: "812px" },
];

export function PageSnapshotPanel({ result }: PageSnapshotPanelProps) {
  const [device, setDevice] = useState<DeviceView>("desktop");
  const active = DEVICES.find((d) => d.key === device) ?? DEVICES[0];

  return (
    <div className="flex flex-col gap-2  ">
      <AInote />
      {result.error && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {result.error}
        </p>
      )}
      {result.failedResources && result.failedResources.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
          <p className="font-medium">
            {summarizeCounts(result.failedResources)} failed to load while
            capturing this page:
          </p>
          <ul className="mt-1 max-h-40 list-disc overflow-y-auto pl-4">
            {result.failedResources.map((r) => (
              <li key={r.url} className="break-all">
                <span className="font-medium capitalize">
                  {TYPE_LABELS[r.type]}
                </span>
                {r.status ? ` (${r.status})` : " (failed to load)"} —{" "}
                {TYPE_IMPACT[r.type]}
                <div>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="break-all text-amber-700/80 underline hover:text-amber-900 dark:text-amber-400/70 dark:hover:text-amber-300"
                  >
                    {r.url}
                  </a>
                </div>
              </li>
            ))}
          </ul>
          {result.failedResourceCount !== undefined &&
            result.failedResourceCount > result.failedResources.length && (
              <p className="mt-1 italic">
                …and{" "}
                {result.failedResourceCount - result.failedResources.length}{" "}
                more
              </p>
            )}
        </div>
      )}
      {result.missingElements && result.missingElements.length > 0 && (
        <div className="rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300">
          <p className="font-medium">
            {result.missingElementCount ?? result.missingElements.length}{" "}
            element
            {(result.missingElementCount ?? result.missingElements.length) ===
            1
              ? ""
              : "s"}{" "}
            use Shadow DOM content that couldn&apos;t be included in this
            snapshot — those sections will appear empty or missing, even
            though nothing failed to fetch:
          </p>
          <ul className="mt-1 max-h-28 list-disc overflow-y-auto pl-4">
            {result.missingElements.map((el) => (
              <li key={el} className="break-all">
                {el}
              </li>
            ))}
          </ul>
          {result.missingElementCount !== undefined &&
            result.missingElementCount > result.missingElements.length && (
              <p className="mt-1 italic">
                …and{" "}
                {result.missingElementCount - result.missingElements.length}{" "}
                more
              </p>
            )}
        </div>
      )}
      {result.html ? (
        <>
          <div className="flex overflow-hidden rounded-md border border-black/15 dark:border-white/15 text-sm w-fit">
            {DEVICES.map((d) => (
              <button
                key={d.key}
                type="button"
                onClick={() => setDevice(d.key)}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  device === d.key
                    ? "bg-blue-600 text-white"
                    : "bg-white dark:bg-black/20 hover:bg-black/5 dark:hover:bg-white/10"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
          <div className="w-full overflow-x-auto rounded-md border border-black/10 bg-black/[.02] p-3 dark:border-white/10 dark:bg-white/[.03] ">
            <iframe
              srcDoc={result.html}
              sandbox=""
              referrerPolicy="no-referrer"
              title="Page snapshot"
              style={{ width: active.width }}
              className="mx-auto max-w-full  h-screen rounded-md border border-black/10 bg-white dark:border-white/10"
            />
          </div>
        </>
      ) : (
        <p className="text-xs text-black/50 dark:text-white/50">
          No snapshot available.
        </p>
      )}
    </div>
  );
}
