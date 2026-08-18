import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">
        WebScout
      </p>
      <h1 className="text-2xl font-semibold text-black dark:text-white">
        Page not found
      </h1>
      <p className="max-w-sm text-sm text-black/60 dark:text-white/60">
        The page you&apos;re looking for doesn&apos;t exist, or the link
        you followed isn&apos;t a page — just an API endpoint the app calls
        in the background.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        Back to WebScout
      </Link>
    </div>
  );
}
