
## Goal

User enters a search query (e.g. `PS4 PRO`). The app scrapes the target marketplace's search results, then attempts to anonymously reveal each seller's phone, and shows everything in a table. The crawler is **purpose-built** for this specific site's Next.js data shape and contactInfo endpoints — but no literal site name or URL is committed to the repo. All site-identifying strings live in `.env`.

## `.env` values you need to set

```
# Site origin, no trailing slash
SCRAPER_BASE_URL=https://www.yad2.co.il

# Gateway origin for the contactInfo API
SCRAPER_GW_BASE_URL=https://gw.yad2.co.il

# Browser-like headers
SCRAPER_USER_AGENT=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36
SCRAPER_ACCEPT_LANGUAGE=he-IL,he;q=0.9,en;q=0.8

# Limits
SCRAPER_MAX_RESULTS=26
SCRAPER_PHONE_CONCURRENCY=4
```

Paths (`/market/search`, `/market/_next/data/<buildId>/search.json`, `/market/item/<id>`, `/feed-search-legacy/item/<id>/contactInfo`, etc.) are **constructed in code** by joining these env-provided origins with the route segments the site uses — so the code knows the site's URL shape, but the committed source contains no domain string.

## UX

Single page at `/`:
- Query input + Search button
- Results table: Image, Title (RTL), Price ₪, City, Condition, Seller ID, Phone status, "Open ad" link
- Two phases: "Fetching listings…" → "Revealing phones (x/N)…"
- Per-row phone state: `pending` → number / `Unavailable` / `Rate-limited`

Ephemeral, no DB, no auth.

## Server architecture

```
src/lib/scraper-config.server.ts   reads + validates SCRAPER_* env vars (throws inside handler if missing)
src/lib/scraper.server.ts          purpose-built logic: buildId resolver (in-memory cached ~10 min),
                                   search fetcher, Next.js pageProps walker that pulls the listings
                                   array, normalizer, phone-endpoint chain
src/lib/scraper.functions.ts       two createServerFn endpoints
```

### `runSearch({ query })`
1. URL-encode query with `+` for spaces. Fetch `${BASE_URL}/market/search?q=...` with browser headers.
2. Extract `buildId` from the HTML via regex on `"buildId":"..."`. Cache it; on 404 from the data endpoint, refetch + retry once.
3. Fetch `${BASE_URL}/market/_next/data/${buildId}/search.json?q=...` with `x-nextjs-data: 1`, Referer = the search HTML URL.
4. Walk `pageProps` (covers commercial/private/markets feeds — deep scan for objects with `id` + `title` + `price` + `address`) and normalize to `{ id, adId, title, price, city, area, condition, image, urlIdentifier }`.
5. Return up to `SCRAPER_MAX_RESULTS` items.

### `revealPhone({ id, adId })`
Try in order, return on first success:
1. `GET ${GW_BASE_URL}/feed-search-legacy/item/${id}/contactInfo`
2. `GET ${GW_BASE_URL}/market-search/contactInfo?adId=${adId}`
3. Fallback: `GET ${BASE_URL}/market/_next/data/${buildId}/market/item/${id}.json`, deep-scan JSON for a phone-shaped string.

All with browser headers + `Origin: ${BASE_URL}` + `Referer: ${BASE_URL}/market/item/${id}`. Returns `{ phone, status }` where status ∈ `revealed | unavailable | rate_limited`.

Pure server `fetch` — no headless browser, no Firecrawl.

## Client

`src/routes/index.tsx` (replace placeholder):
- `useServerFn(runSearch)` on submit → render rows with phone=`pending`.
- Concurrency-limited loop (size `SCRAPER_PHONE_CONCURRENCY`, sent back with the listings response) calls `useServerFn(revealPhone)` per row.
- shadcn `Table`, `Input`, `Button`, `Badge`. `dir="auto"` on RTL cells.
- Route `head()` with a generic title/description.

## Caveats (flagged after build)

- The site actively blocks scrapers and rate-limits anonymous reveal — expect many `Unavailable` rows. If success is too low, next iteration can add a logged-in session cookie supplied via a secret, or a headless-browser reveal path.
- Scraping may breach the target site's ToS — your responsibility.
