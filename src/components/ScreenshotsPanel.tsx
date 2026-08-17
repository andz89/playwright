"use client";

import { useEffect, useRef, useState } from "react";
import type { ScreenshotDevice, ScreenshotSet } from "@/lib/types";
import AInote from "./AInote";
import { RemoveButton } from "./RemoveButton";

interface ScreenshotsPanelProps {
  screenshots: ScreenshotSet;
  onRemoveDevice?: (device: ScreenshotDevice) => void;
}

const DEVICES: { key: ScreenshotDevice; label: string; width: string }[] = [
  { key: "desktop", label: "Desktop", width: "100%" },
  { key: "tablet", label: "Tablet", width: "768px" },
  { key: "mobile", label: "Mobile", width: "375px" },
];

type PanelLayout = "tabs" | "stacked";

function DeviceCard({
  device,
  src,
  onRemoveDevice,
}: {
  device: (typeof DEVICES)[number];
  src: string | null | undefined;
  onRemoveDevice?: (device: ScreenshotDevice) => void;
}) {
  return (
    <div className="flex w-full flex-col gap-2 items-center">
      <div className="flex justify-between p-3 bg-blue-100 border items-center border-blue-500 rounded w-full gap-3">
        <p className="text-md font-medium text-blue-500 w-full">
          {device.label}
        </p>
        {src && (
          <a
            href={src}
            download={`${device.key}.png`}
            className="shrink-0 text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            Download
          </a>
        )}
        {src && onRemoveDevice && (
          <RemoveButton onClick={() => onRemoveDevice(device.key)} />
        )}
      </div>
      <AInote />
      <div className="w-full h-full overflow-auto rounded-md border border-black/10 dark:border-white/10 bg-black/[.02] dark:bg-white/[.03]">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={`${device.label} screenshot`}
            style={{ width: device.width }}
            className="mx-auto max-w-full h-full"
          />
        ) : (
          <p className="p-3 text-xs text-black/50 dark:text-white/50">
            Failed to capture.
          </p>
        )}
      </div>
    </div>
  );
}

export function ScreenshotsPanel({
  screenshots,
  onRemoveDevice,
}: ScreenshotsPanelProps) {
  const [device, setDevice] = useState<ScreenshotDevice>("desktop");
  const [layout, setLayout] = useState<PanelLayout>("tabs");
  const active = DEVICES.find((d) => d.key === device) ?? DEVICES[0];
  const src = screenshots[device];
  const panelRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [buttonPos, setButtonPos] = useState<{ top: number; left: number } | null>(null);

  // `position: sticky` doesn't work here — CollapsibleSection wraps this
  // panel in an `overflow-hidden` div (for its collapse animation), and any
  // ancestor with overflow other than visible becomes sticky's containing
  // block, which breaks it. So this fakes "sticky, but confined to this
  // panel" by hand: `fixed` positioning (immune to the overflow-hidden
  // clipping bug) with a top/left computed from the panel's own bounding
  // box every scroll, clamped so the button never renders outside it.
  useEffect(() => {
    const panelEl = panelRef.current;
    const topEl = topRef.current;
    if (!panelEl || !topEl) return;
    const margin = 16;

    const onScroll = () => {
      const panelRect = panelEl.getBoundingClientRect();
      const scrolledPastTabs = topEl.getBoundingClientRect().bottom < 0;
      const panelInView = panelRect.bottom > 0 && panelRect.top < window.innerHeight;
      if (!scrolledPastTabs || !panelInView) {
        setButtonPos(null);
        return;
      }
      const buttonEl = buttonRef.current;
      const buttonHeight = buttonEl?.offsetHeight ?? 32;
      const buttonWidth = buttonEl?.offsetWidth ?? 110;
      const top = Math.min(
        window.innerHeight - buttonHeight - margin,
        panelRect.bottom - buttonHeight - margin,
      );
      const left = panelRect.right - buttonWidth - margin;
      setButtonPos({ top, left });
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div ref={panelRef} className="relative flex flex-col gap-3">
      {screenshots.error && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {screenshots.error}
        </p>
      )}
      <AInote />
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          const el = topRef.current;
          if (!el) return;
          const top = el.getBoundingClientRect().top + window.scrollY - 16;
          window.scrollTo({ top, behavior: "smooth" });
        }}
        aria-hidden={!buttonPos}
        tabIndex={buttonPos ? 0 : -1}
        style={buttonPos ? { top: buttonPos.top, left: buttonPos.left } : undefined}
        className={`fixed z-10 rounded-full bg-blue-600 px-4 py-2 text-xs font-medium text-white shadow-lg transition-opacity duration-300 ease-out hover:bg-blue-700 ${
          buttonPos
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
      >
        ↑ Back to top
      </button>
      <div ref={topRef} className="flex flex-wrap items-center justify-between gap-2">
        {layout === "tabs" ? (
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
        ) : (
          <span />
        )}
        <div className="flex overflow-hidden rounded-md border border-black/15 dark:border-white/15 text-sm w-fit">
          <button
            type="button"
            onClick={() => setLayout("tabs")}
            className={`px-3 py-1.5 font-medium transition-colors ${
              layout === "tabs"
                ? "bg-blue-600 text-white"
                : "bg-white dark:bg-black/20 hover:bg-black/5 dark:hover:bg-white/10"
            }`}
          >
            Tabs
          </button>
          <button
            type="button"
            onClick={() => setLayout("stacked")}
            className={`px-3 py-1.5 font-medium transition-colors ${
              layout === "stacked"
                ? "bg-blue-600 text-white"
                : "bg-white dark:bg-black/20 hover:bg-black/5 dark:hover:bg-white/10"
            }`}
          >
            Stacked
          </button>
        </div>
      </div>
      {layout === "tabs" ? (
        <DeviceCard device={active} src={src} onRemoveDevice={onRemoveDevice} />
      ) : (
        <div className="flex flex-col gap-5">
          {DEVICES.map((d) => (
            <DeviceCard
              key={d.key}
              device={d}
              src={screenshots[d.key]}
              onRemoveDevice={onRemoveDevice}
            />
          ))}
        </div>
      )}
    </div>
  );
}
