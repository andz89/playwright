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
type SectionKey = "screenshots" | "featured" | "page" | "links";

export default function Home() {
  const { state, run } = useScrape();
  const [view, setView] = useState<ViewMode>("table");
  const [featuredView, setFeaturedView] = useState<ViewMode>("table");
  const [lastUrl, setLastUrl] = useState("");
  const [lastOptions, setLastOptions] = useState<ScrapeOptions>(
    DEFAULT_SCRAPE_OPTIONS,
  );
  const [collapsedSections, setCollapsedSections] = useState<
    Record<SectionKey, boolean>
  >({ screenshots: true, featured: true, page: true, links: true });
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
  const screenshotCount = useMemo(() => {
    if (!state.screenshots) return 0;
    return (["desktop", "tablet", "mobile"] as const).filter(
      (key) => state.screenshots?.[key],
    ).length;
  }, [state.screenshots]);
  const handleSubmit = (url: string, options: ScrapeOptions) => {
    setLastUrl(url);
    setLastOptions(options);
    run(url, false, options);
  };

  const toggleSection = (key: SectionKey) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const visibleSectionKeys = (
    ["screenshots", "featured", "page", "links"] as SectionKey[]
  ).filter((key) => {
    if (key === "screenshots") return state.screenshots != null;
    if (key === "featured") return featuredImages.length > 0;
    if (key === "page") return pageImages.length > 0;
    return state.links.length > 0;
  });
  const allSectionsCollapsed =
    visibleSectionKeys.length > 0 &&
    visibleSectionKeys.every((key) => collapsedSections[key]);

  const toggleAllSections = () => {
    const next = !allSectionsCollapsed;
    setCollapsedSections((prev) => {
      const updated = { ...prev };
      visibleSectionKeys.forEach((key) => {
        updated[key] = next;
      });
      return updated;
    });
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
          {visibleSectionKeys.length > 1 && (
            <div className="flex justify-end">
              <button
                onClick={toggleAllSections}
                className="rounded-md border border-black/15 dark:border-white/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10"
              >
                {allSectionsCollapsed ? "Show all" : "Hide all"}
              </button>
            </div>
          )}
          {state.links.length > 0 && (
            <CollapsibleSection
              title="Links"
              count={state.links.length}
              collapsed={collapsedSections.links}
              onToggle={() => toggleSection("links")}
            >
              <LinksTable links={state.links} />
            </CollapsibleSection>
          )}

          {state.screenshots && (
            <CollapsibleSection
              title="Full-page screenshots"
              count={screenshotCount}
              collapsed={collapsedSections.screenshots}
              onToggle={() => toggleSection("screenshots")}
            >
              <ScreenshotsPanel screenshots={state.screenshots} />
            </CollapsibleSection>
          )}
          {state.images.length > 0 && (
            <>
              {featuredImages.length > 0 && (
                <CollapsibleSection
                  title="Featured images"
                  count={featuredImages.length}
                  collapsed={collapsedSections.featured}
                  onToggle={() => toggleSection("featured")}
                  actions={
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
                  }
                >
                  {featuredView === "gallery" ? (
                    <Gallery images={featuredImages} />
                  ) : (
                    <ResultsTable images={featuredImages} />
                  )}
                </CollapsibleSection>
              )}

              {pageImages.length > 0 && (
                <CollapsibleSection
                  title="Page images"
                  count={pageImages.length}
                  collapsed={collapsedSections.page}
                  onToggle={() => toggleSection("page")}
                  actions={
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
                  }
                >
                  {view === "gallery" ? (
                    <Gallery images={pageImages} />
                  ) : (
                    <ResultsTable images={pageImages} />
                  )}
                </CollapsibleSection>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CollapsibleSection({
  title,
  count,
  collapsed,
  onToggle,
  actions,
  children,
}: {
  title: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={onToggle}
          aria-expanded={!collapsed}
          className="flex min-w-0 items-center gap-2 text-left"
        >
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`h-4 w-4 shrink-0 text-black/50 dark:text-white/50 transition-transform duration-200 ${
              collapsed ? "-rotate-90" : "rotate-0"
            }`}
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.293l3.71-4.06a.75.75 0 111.08 1.04l-4.25 4.65a.75.75 0 01-1.08 0l-4.25-4.65a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
          <h2 className="text-lg font-semibold tracking-tight">
            {title}
            <span className="ml-2 text-sm font-normal text-black/50 dark:text-white/50">
              ({count})
            </span>
          </h2>
        </button>
        {!collapsed && actions}
      </div>
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
          collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
        }`}
      >
        <div className="min-h-0 overflow-hidden">{children}</div>
      </div>
    </section>
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
