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
| `src/routes/index.tsx` | UI: URL input + screenshot / HTML / rendered tabs |

## Env vars

| Name | Default | Purpose |
| --- | --- | --- |
| `PUPPETEER_URL` | `http://localhost:7070` | Where the Lovable server fn calls Puppeteer |
| `PORT` (server script) | `7070` | Port the Puppeteer script binds to |

## Troubleshooting

- **"Could not reach the local Puppeteer server"** — the script isn't running. Run `bun run scrape:server`.
- **First request is slow** — Chromium is launching. Subsequent requests reuse the same browser.
- **Site shows a captcha / challenge page** — Puppeteer hits a bot wall. Add `waitMs` from the UI to give JS more time, or use stealth plugins / a real residential proxy for hardened sites.
