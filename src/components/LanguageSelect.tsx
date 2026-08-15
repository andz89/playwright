"use client";

import { useEffect, useRef, useState } from "react";
import { LANGUAGE_OPTIONS } from "@/lib/promptBuilder";

interface LanguageSelectProps {
  /** Selected language name (e.g. "Polish"), or "" for none selected. */
  value: string;
  onChange: (name: string) => void;
  invalid?: boolean;
}

export function LanguageSelect({ value, onChange, invalid }: LanguageSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = LANGUAGE_OPTIONS.find((lang) => lang.name === value);

  // Rendered as plain DOM elements rather than a native <select>/<option>
  // list — on Windows, the native popup for <select> is drawn by the OS's
  // own combo-box control, which frequently can't display color emoji flags
  // (they show as boxed letters or nothing). Regular page content doesn't
  // have that limitation, so a custom listbox is the only reliable way to
  // actually show the flags.
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative w-full max-w-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-full items-center justify-between gap-2 rounded-md border bg-white px-3 py-1.5 text-left text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:bg-black/20 ${
          invalid
            ? "border-red-400 dark:border-red-800"
            : "border-black/15 dark:border-white/15"
        }`}
      >
        {selected ? (
          <span className="flex items-center gap-2">
            <span className="text-base leading-none">{selected.flag}</span>
            <span className="font-medium">{selected.code}</span>
            <span className="text-black/40 dark:text-white/40">—</span>
            <span>{selected.name}</span>
          </span>
        ) : (
          <span className="text-black/40 dark:text-white/40">
            Select a language…
          </span>
        )}
        <span className="text-black/40 dark:text-white/40">▾</span>
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-black/15 bg-white py-1 text-sm shadow-lg dark:border-white/15 dark:bg-zinc-900"
        >
          {LANGUAGE_OPTIONS.map((lang) => (
            <li key={lang.code} role="option" aria-selected={lang.name === value}>
              <button
                type="button"
                onClick={() => {
                  onChange(lang.name);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10 ${
                  lang.name === value ? "bg-blue-50 dark:bg-blue-950/40" : ""
                }`}
              >
                <span className="text-base leading-none">{lang.flag}</span>
                <span className="font-medium">{lang.code}</span>
                <span className="text-black/40 dark:text-white/40">—</span>
                <span>{lang.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
