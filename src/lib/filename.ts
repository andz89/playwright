export function filenameOf(src: string): string {
  if (src.startsWith("data:")) return "(inline data URI)";
  try {
    const u = new URL(src);
    const last = u.pathname.split("/").filter(Boolean).pop();
    return last || u.hostname;
  } catch {
    return src;
  }
}
