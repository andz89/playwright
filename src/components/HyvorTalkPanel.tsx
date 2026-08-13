import type { HyvorTalkResult } from "@/lib/types";

interface HyvorTalkPanelProps {
  result: HyvorTalkResult;
}

export function HyvorTalkPanel({ result }: HyvorTalkPanelProps) {
  if (!result.found && !result.error)
    return (
      <div className="p-2 bg-yellow-100 border border-yellow-500">
        Hyvor talk are only available for pages with a Hyvor Talk widget. Please
        visit a page to confirm it.
      </div>
    );

  if (result.error) {
    return (
      <div className="rounded-md border border-amber-400/50 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
        <p className="font-medium">Something went wrong. Please Try again.</p>
        <p className="mt-1 text-xs opacity-90">{result.error}</p>
      </div>
    );
  }

  const properties = result.properties ?? {};
  const propertyKeys = Object.keys(properties);

  return (
    <div className="flex flex-col gap-3 rounded-md border border-black/10 dark:border-white/10 p-4">
      <h2 className="text-sm font-semibold">Hyvor Talk widget detected</h2>

      <div className="overflow-x-auto rounded-md border border-black/10 dark:border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-black/[.03] dark:bg-white/[.05] text-xs uppercase tracking-wide text-black/60 dark:text-white/60">
            <tr>
              <th className="px-3 py-2 font-medium">Screenshot</th>
              {propertyKeys.map((key) => (
                <th
                  key={key}
                  className="px-3 py-2 font-medium whitespace-nowrap"
                >
                  {key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-black/10 dark:border-white/10 align-top">
              <td className="px-3 py-2">
                {result.screenshot && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={result.screenshot}
                    alt="Screenshot of the Hyvor Talk widget"
                    className="h-auto w-[500px] rounded-md border border-black/10 object-contain dark:border-white/10"
                  />
                )}
              </td>
              {propertyKeys.map((key) => (
                <td
                  key={key}
                  className="px-3 py-2 break-all text-black/80 dark:text-white/80"
                >
                  {properties[key]}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
