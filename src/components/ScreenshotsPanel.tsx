import type { ScreenshotDevice, ScreenshotSet } from "@/lib/types";

interface ScreenshotsPanelProps {
  screenshots: ScreenshotSet;
}

const DEVICES: { key: ScreenshotDevice; label: string }[] = [
  { key: "desktop", label: "Desktop" },
  { key: "tablet", label: "Tablet" },
  { key: "mobile", label: "Mobile" },
];

export function ScreenshotsPanel({ screenshots }: ScreenshotsPanelProps) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-black/10 dark:border-white/10 p-4">
      <h2 className="text-sm font-semibold">Full-page screenshots</h2>
      {screenshots.error && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {screenshots.error}
        </p>
      )}
      <div className="flex flex-col">
        {DEVICES.map(({ key, label }) => {
          const src = screenshots[key];
          return (
            <div key={key} className="flex flex-col gap-2 mt-5 items-center">
              <div className="flex  justify-between p-3 bg-blue-100 border  items-center border-blue-500 rounded w-full ">
                <p className="text-md font-medium text-blue-500  w-full">
                  {label}
                </p>
                {src && (
                  <a
                    href={src}
                    download={`${key}.png`}
                    className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Download
                  </a>
                )}
              </div>
              <div className="overflow-y-auto rounded-md border border-black/10 dark:border-white/10 bg-black/[.02] dark:bg-white/[.03]">
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={src}
                    alt={`${label} screenshot`}
                    className="w-full h-full"
                  />
                ) : (
                  <p className="p-3 text-xs text-black/50 dark:text-white/50">
                    Failed to capture.
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
