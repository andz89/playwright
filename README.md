# Image Scraper

A Next.js (App Router, TypeScript) app that scrapes every image from a single
webpage and lets you browse them in a gallery or table.

## How it works

1. **Scraping** — `src/lib/scrape.ts` uses Playwright (server-side, headless
   Chromium) to load the page (static or JS-rendered) and collect every
   `<img>` `src`/`srcset` plus any CSS `background-image` URL it can detect
   from computed styles.
2. **robots.txt** — `src/lib/robots.ts` fetches and checks the target site's
   `robots.txt` *before* scraping. If disallowed for our user agent, the API
   stops and the UI shows a warning with an explicit "Scrape anyway" override
   button rather than silently proceeding.
3. **Streaming progress** — `src/app/api/scrape/route.ts` streams
   newline-delimited JSON events (robots check → status → per-image
   progress → per-image result → done) over a single `POST` response, which
   `src/lib/useScrape.ts` reads incrementally on the client so the UI shows
   "Loading image N of M" live instead of a blank loading state.
4. **Results UI** — `src/app/page.tsx` renders a gallery (click a tile to
   open it full-size in a modal with a "Next" button to step through the
   results) and a toggle-able sortable/filterable table.

Everything is computed per-request; nothing is persisted to a database.

## Setup

```bash
npm install
npx playwright install chromium
```

## Run

```bash
npm run dev
```

Open http://localhost:3000, paste a page URL, and click "Scrape page".

## Deploying to Render

This app needs a real Node.js server (not an edge/serverless runtime) because
`scrape.ts` launches a real headless Chromium via Playwright. It ships with a
`Dockerfile` (based on Playwright's own image, which already bundles a
matching Chromium build and OS deps) and a `render.yaml` blueprint.

1. Push this repo to GitHub/GitLab.
2. In Render, **New > Blueprint**, point it at the repo — it picks up
   `render.yaml` and provisions a Docker web service automatically. (Or
   **New > Web Service**, runtime **Docker**, no build/start command needed —
   they come from the `Dockerfile`.)
3. Deploy. First build takes a while (the Playwright base image is large).

Notes:

- The container runs Chromium with `--no-sandbox` (set via
  `CHROMIUM_NO_SANDBOX=1` in the `Dockerfile`), since Render doesn't grant the
  `SYS_ADMIN` capability Chromium's sandbox needs. This is standard practice
  for PaaS containers, but it does mean the browser has less isolation from
  the (untrusted, attacker-controlled) pages it renders — acceptable for a
  scraper, but worth knowing.
- If you see out-of-memory restarts under load, upgrade the Render plan in
  `render.yaml` from `starter` to `standard` (2GB RAM) — Chromium plus
  in-memory screenshot buffers can outgrow 512MB on heavy pages.
- If Playwright's version in `package.json` ever changes, update the
  `mcr.microsoft.com/playwright:vX.Y.Z-jammy` tag in the `Dockerfile` to
  match, or the bundled Chromium build will be out of sync.

## Known limitations

- Some hosts rate-limit or block generic scraper user agents when many
  images are fetched in quick succession; per-image failures are shown
  individually rather than aborting the whole run.
- A single scrape processes at most 50 discovered images to keep runtime
  bounded.
