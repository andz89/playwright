"use client";

import { useEffect, useState } from "react";
import {
  PROMPT_FEATURES,
  buildPrompt,
  defaultPromptSelection,
  type PromptSelection,
} from "@/lib/promptBuilder";
import { LanguageSelect } from "./LanguageSelect";

export function PromptBuilderPanel() {
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<PromptSelection>(() =>
    defaultPromptSelection(),
  );
  const [prompt, setPrompt] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const toggleFeature = (id: string) => {
    setSelection((s) => ({
      ...s,
      features: {
        ...s.features,
        [id]: { ...s.features[id], included: !s.features[id].included },
      },
    }));
  };

  const toggleCheck = (featureId: string, checkKey: string) => {
    setSelection((s) => ({
      ...s,
      features: {
        ...s.features,
        [featureId]: {
          ...s.features[featureId],
          checks: {
            ...s.features[featureId].checks,
            [checkKey]: !s.features[featureId].checks[checkKey],
          },
        },
      },
    }));
  };

  const languageMissing = selection.targetLanguage === "";

  const handleGenerate = () => {
    if (languageMissing) return;
    setPrompt(buildPrompt(selection));
    setCopied(false);
  };

  const handleCopy = async () => {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable (permissions, non-secure context) —
      // the textarea below is still selectable/copyable by hand.
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-fit items-center gap-2 rounded-md border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
      >
        AI Review Prompt Builder
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="prompt-builder-title"
            className="flex max-h-[90vh] w-full max-w-2xl flex-col gap-4 overflow-hidden rounded-lg border border-black/10 bg-zinc-50 p-4 shadow-xl dark:border-white/10 dark:bg-zinc-950"
          >
            <div className="flex items-center justify-between gap-3">
              <span
                id="prompt-builder-title"
                className="text-lg font-semibold tracking-tight"
              >
                AI Review Prompt Builder
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-md p-1 text-black/50 hover:bg-black/5 dark:text-white/50 dark:hover:bg-white/10"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-4 overflow-y-auto pr-1">
              <p className="text-xs text-black/60 dark:text-white/60">
                Choose which sections and checks to include, then generate a
                checklist prompt for an AI assistant that can see this tab
                (e.g. Claude&apos;s Chrome extension) to fill in directly.
              </p>

              <div className="flex flex-col gap-1 text-sm">
                <span className="font-medium">
                  Target language <span className="text-red-600">*</span> —
                  what language should the page&apos;s content be in?
                </span>
                <LanguageSelect
                  value={selection.targetLanguage}
                  onChange={(name) =>
                    setSelection((s) => ({ ...s, targetLanguage: name }))
                  }
                  invalid={languageMissing}
                />
                {languageMissing ? (
                  <span className="text-xs font-normal text-red-600">
                    Required — select the language the page&apos;s content
                    should be in.
                  </span>
                ) : (
                  <span className="text-xs font-normal text-black/50 dark:text-white/50">
                    Used to fill in every language check below — e.g.
                    &quot;confirm all text is strictly in{" "}
                    {selection.targetLanguage}.&quot; Anything not in this
                    language gets flagged as English (or otherwise foreign)
                    content.
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-3">
                {PROMPT_FEATURES.map((feature) => {
                  const featureState = selection.features[feature.id];
                  return (
                    <div
                      key={feature.id}
                      className="rounded-md border border-black/10 dark:border-white/10 p-3"
                    >
                      <label className="flex items-center gap-2 text-sm font-medium">
                        <input
                          type="checkbox"
                          checked={featureState.included}
                          onChange={() => toggleFeature(feature.id)}
                          className="accent-blue-600"
                        />
                        {feature.title}
                        <code className="ml-1 rounded bg-black/5 px-1.5 py-0.5 text-[11px] font-normal text-black/50 dark:bg-white/10 dark:text-white/50">
                          #{feature.sectionId}
                        </code>
                      </label>

                      {featureState.included && (
                        <div className="mt-2 flex flex-col gap-1 pl-6">
                          {feature.checks.map((check) => (
                            <label
                              key={check.key}
                              className="flex items-center gap-2 text-xs text-black/70 dark:text-white/70"
                            >
                              <input
                                type="checkbox"
                                checked={featureState.checks[check.key] ?? false}
                                onChange={() => toggleCheck(feature.id, check.key)}
                                className="accent-blue-600"
                              />
                              {check.label}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={languageMissing}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Generate prompt
                </button>
              </div>

              {prompt && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      Generated prompt
                    </span>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="rounded-md border border-black/15 dark:border-white/15 px-2.5 py-1 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/10"
                    >
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <textarea
                    readOnly
                    value={prompt}
                    rows={12}
                    className="w-full resize-y rounded-md border border-black/15 dark:border-white/15 bg-black/[.02] p-3 font-mono text-xs leading-relaxed dark:bg-white/[.03]"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
