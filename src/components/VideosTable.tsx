"use client";

import { useMemo, useState } from "react";
import type { VideoResult } from "@/lib/types";
import AInote from "./AInote";
import { RemoveButton } from "./RemoveButton";

interface VideosTableProps {
  videos: VideoResult[];
  onRemove?: (id: string) => void;
}

type SortKey = "url" | "status";
type SortDir = "asc" | "desc";

export function VideosTable({ videos, onRemove }: VideosTableProps) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("url");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return videos;
    return videos.filter((video) => video.url.toLowerCase().includes(q));
  }, [videos, search]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "url":
          return dir * a.url.localeCompare(b.url);
        case "status":
          return dir * ((a.status ?? -1) - (b.status ?? -1));
        default:
          return 0;
      }
    });
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        placeholder="Filter by video URL…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-sm rounded-md border border-black/15 dark:border-white/15 bg-white dark:bg-black/20 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
      />
      <AInote />
      <div className="overflow-x-auto rounded-md border border-black/10 dark:border-white/10">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="bg-black/[.03] dark:bg-white/[.05] text-xs uppercase tracking-wide text-black/60 dark:text-white/60">
            <tr>
              <th className="px-3 py-2 font-medium">Preview</th>
              <Th
                label="URL"
                sortKey="url"
                active={sortKey}
                dir={sortDir}
                onClick={toggleSort}
              />
              <Th
                label="Status"
                sortKey="status"
                active={sortKey}
                dir={sortDir}
                onClick={toggleSort}
              />
              <th className="px-3 py-2 font-medium">AI note</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((video) => {
              // `note` alone doesn't mean "unchecked" — a manifest URL
              // recovered for a blob: video still gets a real status from
              // checkVideos, it just also carries an explanatory note. Only
              // status===null with no error means the URL was deliberately
              // skipped (a genuine blob:/data: URL).
              const notCheckable = !video.error && video.status === null && video.note;
              return (
                <tr
                  key={video.id}
                  className="border-t align-top border-black/10 dark:border-white/10"
                >
                  <td className="px-3 py-2">
                    {video.screenshot ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={video.screenshot}
                        alt=""
                        className="h-auto w-[200px] rounded-md border border-black/10 object-contain dark:border-white/10"
                      />
                    ) : (
                      <span className="text-xs text-black/40 dark:text-white/40">
                        No preview
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 max-w-[360px]">
                    <a
                      href={video.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="block truncate text-blue-600 hover:underline dark:text-blue-400"
                      title={video.url}
                    >
                      {video.url}
                    </a>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        video.error
                          ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300"
                          : notCheckable
                            ? "bg-black/10 text-black/60 dark:bg-white/10 dark:text-white/60"
                            : "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300"
                      }`}
                      title={video.error ?? video.note}
                    >
                      {video.error
                        ? (video.status ?? "Broken")
                        : notCheckable
                          ? "Not checkable"
                          : (video.status ?? "OK")}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <AInote />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {onRemove && (
                      <RemoveButton onClick={() => onRemove(video.id)} />
                    )}
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center text-black/50 dark:text-white/50"
                >
                  No results match the current filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  label,
  sortKey,
  active,
  dir,
  onClick,
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  dir: SortDir;
  onClick: (key: SortKey) => void;
}) {
  const isActive = active === sortKey;
  return (
    <th className="px-3 py-2 font-medium select-none">
      <button
        onClick={() => onClick(sortKey)}
        className="inline-flex items-center gap-1 hover:text-black dark:hover:text-white"
      >
        {label}
        <span className="text-[10px]">
          {isActive ? (dir === "asc" ? "▲" : "▼") : ""}
        </span>
      </button>
    </th>
  );
}
