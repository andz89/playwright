"use client";

import { useMemo, useState } from "react";
import type { ImageResult } from "@/lib/types";
import { filenameOf } from "@/lib/filename";
import AInote from "./AInote";
import { RemoveButton } from "./RemoveButton";

interface ResultsTableProps {
  images: ImageResult[];
  onRemove?: (id: string) => void;
}

type SortKey = "name" | "source" | "status";
type SortDir = "asc" | "desc";

export function ResultsTable({ images, onRemove }: ResultsTableProps) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return images;
    return images.filter((img) => img.src.toLowerCase().includes(q));
  }, [images, search]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "name":
          return dir * filenameOf(a.src).localeCompare(filenameOf(b.src));
        case "source":
          return dir * a.source.localeCompare(b.source);
        case "status":
          return dir * (a.error ?? "").localeCompare(b.error ?? "");
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
        placeholder="Filter by filename or URL…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-sm rounded-md border border-black/15 dark:border-white/15 bg-white dark:bg-black/20 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
      />
      <AInote />
      <div className="overflow-x-auto rounded-md border border-black/10 dark:border-white/10">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-black/[.03] dark:bg-white/[.05] text-xs uppercase tracking-wide text-black/60 dark:text-white/60">
            <tr>
              <th className="px-3 py-2 font-medium">Thumbnail</th>
              <Th
                label="Filename / URL"
                sortKey="name"
                active={sortKey}
                dir={sortDir}
                onClick={toggleSort}
              />
              <Th
                label="Source"
                sortKey="source"
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
            {sorted.map((img) => (
              <tr
                key={img.id}
                className="border-t align-top border-black/10 dark:border-white/10"
              >
                <td className="px-3 py-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.src}
                    alt=""
                    loading="lazy"
                    className="h-auto w-[300px] rounded-md border border-black/10 object-contain dark:border-white/10"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.opacity = "0.15";
                    }}
                  />
                </td>
                <td className="px-3 py-2 max-w-[360px]">
                  <a
                    href={img.src}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="block truncate text-blue-600 hover:underline dark:text-blue-400"
                    title={img.src}
                  >
                    {filenameOf(img.src)}
                  </a>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{img.source}</td>
                <td className="px-3 py-2 max-w-[280px]">
                  <p
                    className="line-clamp-2 text-black/80 dark:text-white/80"
                    title={img.error}
                  >
                    {img.error ?? "OK"}
                  </p>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <AInote />
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {onRemove && (
                    <RemoveButton onClick={() => onRemove(img.id)} />
                  )}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td
                  colSpan={6}
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
