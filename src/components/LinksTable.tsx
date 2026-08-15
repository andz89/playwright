"use client";

import { useMemo, useState } from "react";
import type { LinkResult } from "@/lib/types";
import AInote from "./AInote";
import { RemoveButton } from "./RemoveButton";
interface LinksTableProps {
  links: LinkResult[];
  onRemove?: (id: string) => void;
}

type SortKey = "text" | "url" | "status";
type SortDir = "asc" | "desc";

export function LinksTable({ links, onRemove }: LinksTableProps) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("url");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return links;
    return links.filter(
      (link) =>
        link.url.toLowerCase().includes(q) ||
        link.text.toLowerCase().includes(q),
    );
  }, [links, search]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "text":
          return dir * a.text.localeCompare(b.text);
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
        placeholder="Filter by link text or URL…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-sm rounded-md border border-black/15 dark:border-white/15 bg-white dark:bg-black/20 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
      />
      <AInote />
      <div className="overflow-x-auto rounded-md border border-black/10 dark:border-white/10">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-black/[.03] dark:bg-white/[.05] text-xs uppercase tracking-wide text-black/60 dark:text-white/60">
            <tr>
              <Th
                label="Text"
                sortKey="text"
                active={sortKey}
                dir={sortDir}
                onClick={toggleSort}
              />
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
            {sorted.map((link) => (
              <tr
                key={link.id}
                className="border-t align-top border-black/10 dark:border-white/10"
              >
                <td className="px-3 py-2 max-w-[280px]">
                  <p className="line-clamp-2 text-black/80 dark:text-white/80">
                    {link.text || (
                      <span className="text-black/40 dark:text-white/40">
                        —
                      </span>
                    )}
                  </p>
                </td>
                <td className="px-3 py-2 max-w-[360px]">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="block truncate text-blue-600 hover:underline dark:text-blue-400"
                    title={link.url}
                  >
                    {link.url}
                  </a>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      link.error
                        ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300"
                        : link.note
                          ? "bg-black/10 text-black/60 dark:bg-white/10 dark:text-white/60"
                          : "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300"
                    }`}
                    title={link.error ?? link.note}
                  >
                    {link.error
                      ? (link.status ?? "Broken")
                      : link.note
                        ? "Not checkable"
                        : (link.status ?? "OK")}
                  </span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <AInote />
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {onRemove && (
                    <RemoveButton onClick={() => onRemove(link.id)} />
                  )}
                </td>
              </tr>
            ))}
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
