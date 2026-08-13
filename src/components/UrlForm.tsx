"use client";

import { FormEvent, useState } from "react";
import { DEFAULT_SCRAPE_OPTIONS, type ScrapeOptions } from "@/lib/types";

interface UrlFormProps {
  onSubmit: (url: string, options: ScrapeOptions) => void;
  disabled: boolean;
}

const OPTION_LABELS: { key: keyof ScrapeOptions; label: string }[] = [
  { key: "featuredImages", label: "Featured images" },
  { key: "pageImages", label: "Page images" },
  { key: "hyvorTalk", label: "Hyvor Talk widget" },
  { key: "canonicalUrl", label: "Canonical URL" },
  { key: "screenshots", label: "Full-page screenshots" },
  { key: "links", label: "Check page links (broken/working)" },
];

export function UrlForm({ onSubmit, disabled }: UrlFormProps) {
  const [url, setUrl] = useState("");
  const [options, setOptions] = useState<ScrapeOptions>(DEFAULT_SCRAPE_OPTIONS);

  const noneSelected = OPTION_LABELS.every(({ key }) => !options[key]);

  const toggleOption = (key: keyof ScrapeOptions) => {
    setOptions((o) => ({ ...o, [key]: !o[key] }));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim() || noneSelected) return;
    onSubmit(url.trim(), options);
  };

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="url"
          required
          placeholder="https://example.com/page"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={disabled}
          className="flex-1 rounded-md border border-black/15 dark:border-white/15 bg-white dark:bg-black/20 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={disabled || noneSelected}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {disabled ? "Scraping…" : "Scrape page"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {OPTION_LABELS.map(({ key, label }) => (
          <label
            key={key}
            className="flex items-center gap-1.5 text-sm text-black/70 dark:text-white/70"
          >
            <input
              type="checkbox"
              checked={options[key]}
              onChange={() => toggleOption(key)}
              disabled={disabled}
              className="accent-blue-600"
            />
            {label}
          </label>
        ))}
      </div>
      {noneSelected && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Select at least one option to scrape.
        </p>
      )}
    </form>
  );
}
