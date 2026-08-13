import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { downloadImage } from "@/lib/download";
import { buildExportFilename } from "@/lib/exportFilename";
import type { ExportRequestBody } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGES = 50;

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  let body: ExportRequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const targetUrl = body?.url?.trim();
  if (!targetUrl || !isHttpUrl(targetUrl)) {
    return new Response("A valid http(s) URL is required", { status: 400 });
  }
  if (!Array.isArray(body.images) || body.images.length === 0) {
    return new Response("No images to export", { status: 400 });
  }

  const images = body.images.slice(0, MAX_IMAGES);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Images");
  sheet.columns = [
    { header: "Filename", key: "filename", width: 40 },
    { header: "Source", key: "source", width: 12 },
    { header: "Local path (click to open)", key: "path", width: 45 },
    { header: "Original URL", key: "url", width: 60 },
    { header: "Status", key: "status", width: 30 },
  ];

  const zip = new JSZip();
  const imagesFolder = zip.folder("images")!;
  const usedNames = new Set<string>();

  for (let i = 0; i < images.length; i += 1) {
    const item = images[i];
    if (i > 0) await new Promise((r) => setTimeout(r, 150));

    let buffer: Buffer;
    let contentType: string | null;
    try {
      ({ buffer, contentType } = await downloadImage(item.src, targetUrl));
    } catch (err) {
      // Cancel the whole export on the first failure rather than silently
      // dropping the bad image — the failing URL is reported back as
      // structured data (not just baked into the message string) so the UI
      // can point at the exact row, and the user can uncheck it and retry.
      const reason = err instanceof Error ? err.message : "Download failed";
      return Response.json(
        {
          message: `Failed to fetch image ${i + 1} of ${images.length} (${item.src}): ${reason}. Download canceled — uncheck this image and try again.`,
          failedSrc: item.src,
        },
        { status: 502 },
      );
    }

    const filename = buildExportFilename(item.src, i, contentType, usedNames);
    const localPath = `images/${filename}`;
    imagesFolder.file(filename, buffer);

    sheet.addRow({
      filename,
      source: item.source,
      path: { text: localPath, hyperlink: localPath },
      url: item.src,
      status: "OK",
    });
  }

  if (body.hyvorTalk?.found && body.hyvorTalk.screenshot) {
    const hyvorSheet = workbook.addWorksheet("Hyvor Talk");
    hyvorSheet.columns = [
      { header: "Property", key: "property", width: 20 },
      { header: "Value", key: "value", width: 60 },
    ];

    const screenshotPath = "hyvor-talk/screenshot.png";
    hyvorSheet.addRow({
      property: "screenshot",
      value: { text: screenshotPath, hyperlink: screenshotPath },
    });
    for (const [key, value] of Object.entries(body.hyvorTalk.properties ?? {})) {
      hyvorSheet.addRow({ property: key, value });
    }

    const base64 = body.hyvorTalk.screenshot.split(",")[1] ?? "";
    zip.file(screenshotPath, base64, { base64: true });
  }

  const excelBuffer = await workbook.xlsx.writeBuffer();
  zip.file("images.xlsx", excelBuffer);

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  const filenameStem = (() => {
    try {
      const u = new URL(targetUrl);
      // The scheme's "://" would otherwise leave a stray colon in the
      // filename (invalid on Windows), so it's dropped before the
      // slash-to-hyphen swap; everything else that isn't filename-safe
      // (query string punctuation, etc.) collapses to "_" same as before.
      return `${u.hostname}${u.pathname}${u.search}`
        .replace(/\/+$/, "")
        .replace(/\//g, "-")
        .replace(/[^a-z0-9.-]/gi, "_");
    } catch {
      return "images";
    }
  })();

  return new Response(new Uint8Array(zipBuffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filenameStem}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
