# Puppeteer Scraper

A Lovable app + a tiny local Node server that uses headless Chromium to fetch any URL and return its rendered screenshot and full HTML.

## Why a local server?

Lovable apps deploy to Cloudflare Workers, which can't run Puppeteer (no Chromium, no `child_process`). The Lovable UI just calls a small HTTP server that you run on your own machine.

## Setup

1. Copy `.env.example` to `.env` (defaults are fine):
   ```sh
   cp .env.example .env
   ```
2. Start the Puppeteer server in one terminal:
   ```sh
   bun run scrape:server
   ```
   It listens on `http://localhost:7070`. First run downloads Chromium (~150 MB).
3. Open the Lovable preview, enter a URL, click **Fetch**.

## What you get

- **Screenshot** — viewport or full page (toggle).
- **HTML** — full rendered DOM, with a Copy button.
- **Rendered** — the captured HTML loaded into a sandboxed iframe.

## Files

| File | What it does |
| --- | --- |
| `scripts/puppeteer-server.ts` | Local HTTP server. `POST /scrape { url, fullPage?, waitMs? }` → `{ html, screenshot, title, finalUrl }` |
| `src/lib/puppeteer.functions.ts` | TanStack server fn that proxies to `PUPPETEER_URL` |
| `src/lib/proxy-fetch.functions.ts` | Generic server-side HTTP GET used by plugins to call JSON APIs (bypasses CORS, forwards realistic headers) |
| `src/lib/config.ts` | App config (debug, theme) — synced to `?debug=…&theme=…` URL params |
| `src/lib/logger.ts` | Client+server log bus shown in the UI when debug is on |
| `src/plugins/index.ts` | Plugin registry |
| `src/plugins/types.ts` | `ScraperPlugin` contract |
| `src/plugins/yad2/yad2.plugin.ts` | Yad2 plugin: landing URL, listings JSON API, item phone API, item detail HTML parser |
| `plugins/yad2/README.md` | Yad2 API reference notes (endpoints, payload shapes, selectors) |
| `src/routes/index.tsx` | UI: plugin select, query input, debug toggle, theme switcher, flows, logs panel |

## Plugin system

Each plugin lives in `src/plugins/<id>/` and exports a `ScraperPlugin`:

- `buildSearchUrl(q)` — landing HTML URL for puppeteer
- `buildListingsApiUrl(q)` — JSON listings endpoint (called server-side)
- `buildItemDetailUrl(id)` / `buildPhoneApiUrl(id)` — per-item endpoints
- `extractIds(text)` — pull IDs from HTML or JSON
- `parseItemDetail(html)` — extract structured fields from an item page
- `flows[]` — ordered, dependency-aware steps the UI exposes as buttons

The Yad2 plugin includes four flows: **Load landing HTML**, **Fetch listings JSON (API)**, **Extract IDs**, **Fetch phone + details for each ID**.

## Debug mode

On by default. Mirrored in the URL as `?debug=1|0` and `?theme=light|dark|blue`. Toggle from the header.

When debug is on, the **Logs** panel captures every `console.*` call on the client and every server-fn outcome (with status codes + payload sizes). Use the **Copy all** button to grab the full transcript.

## Env vars

| Name | Default | Purpose |
| --- | --- | --- |
| `PUPPETEER_URL` | `http://localhost:7070` | Where the Lovable server fn calls Puppeteer |
| `PORT` (server script) | `7070` | Port the Puppeteer script binds to |
