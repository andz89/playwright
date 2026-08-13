"use client";

import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  DEFAULT_SCRAPE_OPTIONS,
  type CanonicalResult,
  type HyvorTalkResult,
  type ImageResult,
  type RedirectInfo,
  type ScrapeEvent,
  type ScrapeOptions,
  type ScreenshotSet,
} from "./types";

export interface ScrapeState {
  status: "idle" | "running" | "done" | "error";
  statusMessage: string;
  progress: { current: number; total: number } | null;
  robots: { allowed: boolean; message: string } | null;
  redirect: RedirectInfo | null;
  canonical: CanonicalResult | null;
  screenshots: ScreenshotSet | null;
  images: ImageResult[];
  hyvorTalk: HyvorTalkResult | null;
  errorMessage: string | null;
  fatalRobotsBlock: boolean;
}

const initialState: ScrapeState = {
  status: "idle",
  statusMessage: "",
  progress: null,
  robots: null,
  redirect: null,
  canonical: null,
  screenshots: null,
  images: [],
  hyvorTalk: null,
  errorMessage: null,
  fatalRobotsBlock: false,
};

export function useScrape() {
  const [state, setState] = useState<ScrapeState>(initialState);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (
      url: string,
      ignoreRobots = false,
      options: ScrapeOptions = DEFAULT_SCRAPE_OPTIONS,
    ) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState({
        ...initialState,
        status: "running",
        statusMessage: "Starting…",
      });

      try {
        const res = await fetch("/api/scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, ignoreRobots, options }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => "Request failed");
          setState((s) => ({ ...s, status: "error", errorMessage: text }));
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            const event: ScrapeEvent = JSON.parse(line);
            applyEvent(event, setState);
          }
        }
        if (buffer.trim()) {
          applyEvent(JSON.parse(buffer), setState);
        }

        setState((s) => (s.status === "running" ? { ...s, status: "done" } : s));
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setState((s) => ({
          ...s,
          status: "error",
          errorMessage: err instanceof Error ? err.message : "Unexpected error",
        }));
      }
    },
    [],
  );

  const reset = useCallback(() => setState(initialState), []);

  return { state, run, reset };
}

function applyEvent(
  event: ScrapeEvent,
  setState: Dispatch<SetStateAction<ScrapeState>>,
) {
  switch (event.type) {
    case "robots":
      setState((s) => ({
        ...s,
        robots: { allowed: event.allowed, message: event.message },
      }));
      break;
    case "status":
      setState((s) => ({ ...s, statusMessage: event.message }));
      break;
    case "redirect":
      setState((s) => ({ ...s, redirect: event.info }));
      break;
    case "canonical":
      setState((s) => ({ ...s, canonical: event.result }));
      break;
    case "screenshots":
      setState((s) => ({ ...s, screenshots: event.result }));
      break;
    case "found":
      setState((s) => ({ ...s, progress: { current: 0, total: event.total } }));
      break;
    case "progress":
      setState((s) => ({
        ...s,
        statusMessage: event.message,
        progress: { current: event.current, total: event.total },
      }));
      break;
    case "image":
      setState((s) => ({ ...s, images: [...s.images, event.result] }));
      break;
    case "hyvorTalk":
      setState((s) => ({ ...s, hyvorTalk: event.result }));
      break;
    case "done":
      setState((s) => ({
        ...s,
        status: "done",
        statusMessage:
          event.failedImages > 0
            ? `Done. Found ${event.totalImages} images, ${event.failedImages} could not be fetched.`
            : `Complete `,
      }));
      break;
    case "error":
      setState((s) => ({
        ...s,
        status: "error",
        errorMessage: event.message,
        fatalRobotsBlock: Boolean(event.fatal && s.robots && !s.robots.allowed),
      }));
      break;
  }
}
