"use client";

import { useState } from "react";
import type { ImageResult } from "@/lib/types";
import { filenameOf } from "@/lib/filename";

interface GalleryProps {
  images: ImageResult[];
}

export function Gallery({ images }: GalleryProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (images.length === 0) {
    return <p className="text-sm text-black/50 dark:text-white/50">No images match the current filter.</p>;
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {images.map((img, index) => (
          <div
            key={img.id}
            className={`group relative aspect-square overflow-hidden rounded-md border cursor-pointer bg-black/[.02] dark:bg-white/[.03] ${
              img.error
                ? "border-red-400/60 dark:border-red-500/50"
                : "border-black/10 dark:border-white/10"
            }`}
            onClick={() => setOpenIndex(index)}
            title={img.error ? `${filenameOf(img.src)} — ${img.error}` : filenameOf(img.src)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.src}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.opacity = "0.15";
              }}
            />

            {img.error && (
              <span className="absolute right-1 top-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow">
                ⚠ failed
              </span>
            )}

            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-4 text-white opacity-0 transition-opacity group-hover:opacity-100">
              <p className="truncate text-[11px] font-medium">{filenameOf(img.src)}</p>
            </div>
          </div>
        ))}
      </div>

      {openIndex !== null && (
        <ImageModal
          images={images}
          index={openIndex}
          onClose={() => setOpenIndex(null)}
          onPrev={() => setOpenIndex((i) => (i === null ? null : (i - 1 + images.length) % images.length))}
          onNext={() => setOpenIndex((i) => (i === null ? null : (i + 1) % images.length))}
        />
      )}
    </>
  );
}

function ImageModal({
  images,
  index,
  onClose,
  onPrev,
  onNext,
}: {
  images: ImageResult[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const img = images[index];

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/85 p-6"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute right-4 top-4 rounded-md px-3 py-1.5 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white"
      >
        Close ✕
      </button>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={img.src}
        alt=""
        className="max-h-[75vh] max-w-full rounded-md object-contain"
        onClick={(e) => e.stopPropagation()}
      />

      <div className="flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onPrev}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Previous
        </button>
        <div className="max-w-md">
          <p className="truncate text-sm text-white/90" title={filenameOf(img.src)}>
            {filenameOf(img.src)}
          </p>
          {img.error && <p className="truncate text-xs text-red-400">{img.error}</p>}
        </div>
        <button
          onClick={onNext}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Next
        </button>
      </div>
    </div>
  );
}
