"use client";

import { useMemo, useRef, useState } from "react";
import { UrlForm } from "@/components/UrlForm";
import { ProgressBar } from "@/components/ProgressBar";
import { RobotsWarning } from "@/components/RobotsWarning";
import { RedirectNotice } from "@/components/RedirectNotice";
import { CanonicalLink } from "@/components/CanonicalLink";
import { ScreenshotsPanel } from "@/components/ScreenshotsPanel";
import { Gallery } from "@/components/Gallery";
import { ResultsTable } from "@/components/ResultsTable";
import { LinksTable } from "@/components/LinksTable";
import { AppScreenshotButton } from "@/components/AppScreenshotButton";
import { HyvorTalkPanel } from "@/components/HyvorTalkPanel";
import { useScrape } from "@/lib/useScrape";
import {
  DEFAULT_SCRAPE_OPTIONS,
  isFeaturedImage,
  type ScrapeOptions,
} from "@/lib/types";

type ViewMode = "gallery" | "table";

export default function Home() {
  const { state, run } = useScrape();
  const [view, setView] = useState<ViewMode>("table");
  const [featuredView, setFeaturedView] = useState<ViewMode>("table");
  const [lastUrl, setLastUrl] = useState("");
  const [lastOptions, setLastOptions] = useState<ScrapeOptions>(
    DEFAULT_SCRAPE_OPTIONS,
  );
  const resultsRef = useRef<HTMLDivElement>(null);

  const isRunning = state.status === "running";

  const featuredImages = useMemo(
    () => state.images.filter(isFeaturedImage),
    [state.images],
  );
  const pageImages = useMemo(
    () => state.images.filter((img) => !isFeaturedImage(img)),
    [state.images],
  );
  const handleSubmit = (url: string, options: ScrapeOptions) => {
    setLastUrl(url);
    setLastOptions(options);
    run(url, false, options);
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black px-4 py-10 sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Web Scraper</h1>
          <small className="text-gray-500 text-sm">
            Developed by Andrew Rivero
          </small>
          <p className="text-sm text-black/60 dark:text-white/60">
            Scrape a single page and browse every details found on it.
          </p>
        </header>
        <UrlForm onSubmit={handleSubmit} disabled={isRunning} />
        {state.status !== "idle" && (
          <div className="flex items-center gap-3">
            <AppScreenshotButton
              url={lastUrl}
              targetRef={resultsRef}
              disabled={isRunning}
            />
          </div>
        )}
        <div ref={resultsRef} className="flex flex-col gap-6">
          {state.robots && (
            <RobotsWarning
              allowed={state.robots.allowed}
              message={state.robots.message}
              blocked={state.fatalRobotsBlock}
              onScrapeAnyway={() => run(lastUrl, true, lastOptions)}
            />
          )}
          {!isRunning && state.status !== "idle" && state.statusMessage && (
            <p className="text-sm    bg-green-100 p-2 text-green-800 rounded border border-green-500">
              {state.statusMessage}
            </p>
          )}
          {state.redirect && <RedirectNotice info={state.redirect} />}
          {state.canonical && (
            <CanonicalLink
              result={state.canonical}
              pageUrl={state.redirect?.finalUrl ?? lastUrl}
            />
          )}
          {isRunning && (
            <ProgressBar
              message={state.statusMessage}
              current={state.progress?.current ?? null}
              total={state.progress?.total ?? null}
            />
          )}

          {state.status === "error" &&
            state.errorMessage &&
            !state.fatalRobotsBlock && (
              <p className="rounded-md border border-red-400/50 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                {state.errorMessage}
              </p>
            )}
          {state.hyvorTalk && <HyvorTalkPanel result={state.hyvorTalk} />}
          {state.screenshots && (
            <ScreenshotsPanel screenshots={state.screenshots} />
          )}
          {state.images.length > 0 && (
            <>
              {featuredImages.length > 0 && (
                <section className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-semibold tracking-tight">
                      Featured images
                      <span className="ml-2 text-sm font-normal text-black/50 dark:text-white/50">
                        ({featuredImages.length})
                      </span>
                    </h2>

                    <div className="flex overflow-hidden rounded-md border border-black/15 dark:border-white/15 text-sm">
                      <ViewToggleButton
                        active={featuredView === "gallery"}
                        onClick={() => setFeaturedView("gallery")}
                        label="Gallery"
                      />
                      <ViewToggleButton
                        active={featuredView === "table"}
                        onClick={() => setFeaturedView("table")}
                        label="Table"
                      />
                    </div>
                  </div>

                  {featuredView === "gallery" ? (
                    <Gallery images={featuredImages} />
                  ) : (
                    <ResultsTable images={featuredImages} />
                  )}
                </section>
              )}

              {pageImages.length > 0 && (
                <section className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-semibold tracking-tight">
                      Page images
                      <span className="ml-2 text-sm font-normal text-black/50 dark:text-white/50">
                        ({pageImages.length})
                      </span>
                    </h2>

                    <div className="flex overflow-hidden rounded-md border border-black/15 dark:border-white/15 text-sm">
                      <ViewToggleButton
                        active={view === "gallery"}
                        onClick={() => setView("gallery")}
                        label="Gallery"
                      />
                      <ViewToggleButton
                        active={view === "table"}
                        onClick={() => setView("table")}
                        label="Table"
                      />
                    </div>
                  </div>

                  {view === "gallery" ? (
                    <Gallery images={pageImages} />
                  ) : (
                    <ResultsTable images={pageImages} />
                  )}
                </section>
              )}
            </>
          )}
          {state.links.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold tracking-tight">
                Links
                <span className="ml-2 text-sm font-normal text-black/50 dark:text-white/50">
                  ({state.links.length})
                </span>
              </h2>
              <LinksTable links={state.links} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function ViewToggleButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 font-medium transition-colors ${
        active
          ? "bg-blue-600 text-white"
          : "bg-white dark:bg-black/20 hover:bg-black/5 dark:hover:bg-white/10"
      }`}
    >
      {label}
    </button>
  );
}
