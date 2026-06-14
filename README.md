# Marketplace Seller Lookup

A small TanStack Start app that searches a marketplace's listings for a query, then attempts to reveal each seller's phone number in parallel.

The crawler is purpose-built for one specific Next.js-based marketplace, but no site identifier (domain, brand name) is committed to this repo — everything site-specific lives in environment variables.

## Strategy

1. **Search.** The server fetches the marketplace's HTML search page, extracts the `buildId` from the embedded Next.js manifest (cached ~10 min), then calls the underlying `_next/data/<buildId>/search.json` endpoint to get structured listings without HTML parsing.
2. **Reveal.** For each listing, the server tries the marketplace's gateway `contactInfo` endpoints in order, falling back to the item's next-data JSON. A simple regex/key scan extracts a phone-shaped string from whatever JSON comes back.
3. **Optional login.** If `SCRAPER_LOGIN_EMAIL` + `SCRAPER_LOGIN_PASSWORD` are set, the server POSTs once to `${SCRAPER_GW_BASE_URL}/auth/login`, captures the response cookies and any bearer token, caches them for ~30 min, and attaches them to every reveal request. Authenticated reveals succeed dramatically more often than anonymous ones; on a 401 the session is dropped and re-acquired.
4. **Concurrency.** Reveals run through a worker pool sized by `SCRAPER_PHONE_CONCURRENCY` so a single search doesn't burst-hit the marketplace.
5. **Caching.** `buildId` and the login session are kept in-memory on the server, scoped to the worker process — no DB.

## Configuration

All site-identifying values live in a local `.env` file (gitignored). Copy `.env.example` to `.env` and fill in real values:

```
SCRAPER_BASE_URL=https://www.<site>            # site origin, no trailing slash
SCRAPER_GW_BASE_URL=https://gw.<site>          # gateway origin used for contactInfo
SCRAPER_USER_AGENT=Mozilla/5.0 ...             # browser-like UA
SCRAPER_ACCEPT_LANGUAGE=he-IL,he;q=0.9,en;q=0.8
SCRAPER_MAX_RESULTS=26
SCRAPER_PHONE_CONCURRENCY=4

# Optional — enables authenticated phone reveals
SCRAPER_LOGIN_EMAIL=
SCRAPER_LOGIN_PASSWORD=
```

The `.env` file is auto-loaded by the server on first config read via Node's `process.loadEnvFile()`, so no `dotenv` package is needed in dev. In production, set these as real environment variables on your host.

## Error handling

Server functions never throw raw 500s to the browser. Both `searchListings` and `getPhone` return a discriminated union: `{ ok: true, ... }` on success or `{ ok: false, error: { code, message, missing? } }` on failure. The UI renders:

- Search errors as an inline message under the form (including `missing` env-var names when the server is unconfigured).
- Per-row reveal errors as a hover-tooltip "Error" badge in the Phone column.

This way both transport-level (network/RPC) and application-level (config, rate-limit, parser) failures surface to the user instead of vanishing into a blank screen.

## Project layout

```
src/lib/scraper-config.server.ts   env reader; loads .env if present; throws ScraperConfigError with `missing` list
src/lib/scraper.server.ts          buildId resolver, search fetcher, login/session, reveal chain
src/lib/scraper.functions.ts       createServerFn endpoints with structured error envelopes
src/routes/index.tsx               search form + results table + per-row reveal worker pool
src/routes/api/open.$id.ts         302 redirect that constructs the item URL from server-side env
```

## Caveats

- The target site actively blocks scrapers and rate-limits anonymous reveals — expect many "Unavailable" rows without login.
- Scraping may breach the target site's Terms of Service. That's your responsibility.
