import type { MetaResult } from "@/lib/types";
import AInote from "./AInote";

interface MetaPanelProps {
  result: MetaResult;
}

export function MetaPanel({ result }: MetaPanelProps) {
  const otherMeta = Object.entries(result.meta).filter(
    ([key]) => key !== "description",
  );

  return (
    <div className="rounded-md border border-black/10 dark:border-white/10 px-4 py-3 text-sm">
      <AInote />

      <p className="font-medium">Title</p>
      <p className="mt-1 text-black/80 dark:text-white/80">
        {result.title || (
          <span className="italic text-black/40 dark:text-white/40">
            No &lt;title&gt; found
          </span>
        )}
      </p>

      <p className="mt-3 font-medium">Description</p>
      <p className="mt-1 text-black/80 dark:text-white/80">
        {result.description || (
          <span className="italic text-black/40 dark:text-white/40">
            No meta description found
          </span>
        )}
      </p>

      <p className="mt-3 font-medium">Language</p>
      <p className="mt-1 text-black/80 dark:text-white/80">
        {result.language || (
          <span className="italic text-black/40 dark:text-white/40">
            No language declared (&lt;html lang&gt; missing)
          </span>
        )}
      </p>

      {otherMeta.length > 0 && (
        <>
          <p className="mt-3 font-medium">Other meta tags ({otherMeta.length})</p>
          <div className="mt-1 max-h-64 overflow-y-auto rounded-md border border-black/10 dark:border-white/10">
            <table className="w-full text-left text-xs">
              <tbody>
                {otherMeta.map(([key, value]) => (
                  <tr
                    key={key}
                    className="border-t first:border-t-0 border-black/10 dark:border-white/10"
                  >
                    <td className="whitespace-nowrap px-2 py-1 align-top font-medium text-black/60 dark:text-white/60">
                      {key}
                    </td>
                    <td className="break-all px-2 py-1 text-black/80 dark:text-white/80">
                      {value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
