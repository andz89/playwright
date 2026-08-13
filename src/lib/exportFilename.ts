const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
  "image/x-icon": "ico",
  "image/avif": "avif",
  "image/tiff": "tiff",
};

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim();
}

function extensionFromMime(contentType: string | null): string | null {
  if (!contentType) return null;
  const mime = contentType.split(";")[0].trim().toLowerCase();
  return EXT_BY_MIME[mime] ?? null;
}

/**
 * Derives a filesystem-safe, unique filename for an exported image, using the
 * URL's basename when available and falling back to the content-type (or a
 * positional name) otherwise. `usedNames` is shared across a single export
 * run so collisions get a numeric suffix instead of overwriting each other.
 */
export function buildExportFilename(
  src: string,
  index: number,
  contentType: string | null,
  usedNames: Set<string>,
): string {
  let base = `image-${index + 1}`;
  let ext: string | null = null;

  if (src.startsWith("data:")) {
    base = `inline-${index + 1}`;
  } else {
    try {
      const u = new URL(src);
      const last = u.pathname.split("/").filter(Boolean).pop();
      if (last) {
        const dot = last.lastIndexOf(".");
        if (dot > 0 && dot < last.length - 1) {
          base = sanitize(last.slice(0, dot)) || base;
          ext = last.slice(dot + 1).toLowerCase();
        } else {
          base = sanitize(last) || base;
        }
      } else if (u.hostname) {
        base = sanitize(u.hostname) || base;
      }
    } catch {
      // Keep the positional fallback.
    }
  }

  if (!ext || ext.length > 5 || !/^[a-z0-9]+$/.test(ext)) {
    ext = extensionFromMime(contentType) ?? ext ?? "bin";
  }

  let candidate = `${base}.${ext}`;
  let n = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${base}-${n}.${ext}`;
    n += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}
