import { getScraperConfig, type ScraperConfig } from "./scraper-config.server";

export type Listing = {
  id: string;
  adId: string | null;
  title: string;
  price: number | null;
  city: string | null;
  area: string | null;
  condition: string | null;
  image: string | null;
  urlIdentifier: string | null;
};

export type PhoneStatus = "revealed" | "unavailable" | "rate_limited";
export type PhoneResult = { phone: string | null; status: PhoneStatus };

// --- buildId cache ---------------------------------------------------------
let cachedBuildId: { id: string; at: number } | null = null;
const BUILD_ID_TTL_MS = 10 * 60 * 1000;

// --- session cache ---------------------------------------------------------
type Session = { cookie: string | null; bearer: string | null; at: number };
let cachedSession: Session | null = null;
let sessionInflight: Promise<Session> | null = null;
const SESSION_TTL_MS = 30 * 60 * 1000;

function parseSetCookies(setCookieHeader: string | null): string | null {
  if (!setCookieHeader) return null;
  // Workers' fetch returns Set-Cookie joined by ", " — split safely on cookie boundaries.
  const parts = setCookieHeader.split(/,(?=\s*[A-Za-z0-9_\-]+=)/);
  const pairs: string[] = [];
  for (const p of parts) {
    const first = p.split(";")[0]?.trim();
    if (first && first.includes("=")) pairs.push(first);
  }
  return pairs.length ? pairs.join("; ") : null;
}

async function login(cfg: ScraperConfig): Promise<Session> {
  const empty: Session = { cookie: null, bearer: null, at: Date.now() };
  if (!cfg.loginEmail || !cfg.loginPassword) return empty;
  try {
    const res = await fetch(`${cfg.gwBaseUrl}/auth/login`, {
      method: "POST",
      headers: {
        "User-Agent": cfg.userAgent,
        "Accept-Language": cfg.acceptLanguage,
        Accept: "application/json",
        "Content-Type": "application/json",
        Origin: cfg.baseUrl,
        Referer: `${cfg.baseUrl}/`,
      },
      body: JSON.stringify({ email: cfg.loginEmail, password: cfg.loginPassword }),
    });
    if (!res.ok) {
      console.error(`Login failed: ${res.status}`);
      return empty;
    }
    const cookie = parseSetCookies(res.headers.get("set-cookie"));
    let bearer: string | null = null;
    try {
      const json = (await res.clone().json()) as unknown;
      bearer = findToken(json);
    } catch {
      // ignore non-json body
    }
    return { cookie, bearer, at: Date.now() };
  } catch (e) {
    console.error("Login error", e);
    return empty;
  }
}

function findToken(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  const rec = node as Record<string, unknown>;
  for (const [k, v] of Object.entries(rec)) {
    if (typeof v === "string" && /token|jwt|access/i.test(k) && v.length > 20) return v;
  }
  for (const v of Object.values(rec)) {
    if (v && typeof v === "object") {
      const f = findToken(v);
      if (f) return f;
    }
  }
  return null;
}

async function getSession(cfg: ScraperConfig): Promise<Session> {
  if (cachedSession && Date.now() - cachedSession.at < SESSION_TTL_MS) return cachedSession;
  if (sessionInflight) return sessionInflight;
  sessionInflight = login(cfg).then((s) => {
    cachedSession = s;
    sessionInflight = null;
    return s;
  });
  return sessionInflight;
}

function buildHeaders(cfg: ScraperConfig, extra: Record<string, string> = {}): HeadersInit {
  return {
    "User-Agent": cfg.userAgent,
    "Accept-Language": cfg.acceptLanguage,
    Accept: "application/json,text/html,*/*",
    ...extra,
  };
}

async function buildAuthedHeaders(
  cfg: ScraperConfig,
  extra: Record<string, string> = {},
): Promise<Record<string, string>> {
  const session = await getSession(cfg);
  const h: Record<string, string> = {
    "User-Agent": cfg.userAgent,
    "Accept-Language": cfg.acceptLanguage,
    Accept: "application/json,text/html,*/*",
    ...extra,
  };
  if (session.cookie) h.Cookie = session.cookie;
  if (session.bearer) h.Authorization = `Bearer ${session.bearer}`;
  return h;
}

function encodeQuery(q: string): string {
  return encodeURIComponent(q.trim()).replace(/%20/g, "+");
}

async function resolveBuildId(cfg: ScraperConfig, query: string, force = false): Promise<string> {
  if (!force && cachedBuildId && Date.now() - cachedBuildId.at < BUILD_ID_TTL_MS) {
    return cachedBuildId.id;
  }
  const url = `${cfg.baseUrl}/market/search?q=${encodeQuery(query)}`;
  const res = await fetch(url, { headers: buildHeaders(cfg) });
  if (!res.ok) throw new Error(`Search page fetch failed: ${res.status}`);
  const html = await res.text();
  const m = html.match(/"buildId":"([^"]+)"/);
  if (!m) throw new Error("Could not extract buildId from search page");
  cachedBuildId = { id: m[1], at: Date.now() };
  return m[1];
}

// --- listing extraction ----------------------------------------------------
// Deep-walk pageProps for objects shaped like a marketplace item.
function isListing(o: unknown): o is Record<string, unknown> {
  if (!o || typeof o !== "object") return false;
  const x = o as Record<string, unknown>;
  return (
    (typeof x.id === "string" || typeof x.id === "number") &&
    typeof x.title === "string" &&
    "price" in x &&
    "address" in x &&
    typeof x.address === "object"
  );
}

function collectListings(node: unknown, out: Record<string, unknown>[], seen: Set<string>): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) collectListings(item, out, seen);
    return;
  }
  if (isListing(node)) {
    const id = String((node as Record<string, unknown>).id);
    if (!seen.has(id)) {
      seen.add(id);
      out.push(node as Record<string, unknown>);
    }
  }
  for (const v of Object.values(node as Record<string, unknown>)) {
    collectListings(v, out, seen);
  }
}

function normalize(raw: Record<string, unknown>): Listing {
  const addr = (raw.address ?? {}) as Record<string, unknown>;
  const city = (addr.city ?? {}) as Record<string, unknown>;
  const area = (addr.area ?? {}) as Record<string, unknown>;
  const condition = (raw.condition ?? {}) as Record<string, unknown>;
  const images = Array.isArray(raw.images) ? (raw.images as unknown[]) : [];
  return {
    id: String(raw.id),
    adId: typeof raw.adId === "string" ? raw.adId : null,
    title: String(raw.title ?? ""),
    price: typeof raw.price === "number" ? raw.price : null,
    city: typeof city.textHeb === "string" ? city.textHeb : null,
    area: typeof area.textHeb === "string" ? area.textHeb : null,
    condition: typeof condition.textHeb === "string" ? condition.textHeb : null,
    image: typeof images[0] === "string" ? (images[0] as string) : null,
    urlIdentifier: typeof raw.urlIdentifier === "string" ? raw.urlIdentifier : null,
  };
}

async function fetchSearchJson(cfg: ScraperConfig, buildId: string, query: string): Promise<unknown> {
  const url = `${cfg.baseUrl}/market/_next/data/${buildId}/search.json?q=${encodeQuery(query)}`;
  const referer = `${cfg.baseUrl}/market/search?q=${encodeQuery(query)}`;
  const res = await fetch(url, {
    headers: buildHeaders(cfg, { "x-nextjs-data": "1", Referer: referer }),
  });
  if (res.status === 404) {
    const err = new Error("buildId stale");
    (err as Error & { code?: string }).code = "STALE_BUILD_ID";
    throw err;
  }
  if (!res.ok) throw new Error(`Search data fetch failed: ${res.status}`);
  return res.json();
}

export async function runSearch(query: string): Promise<{
  listings: Listing[];
  phoneConcurrency: number;
}> {
  const cfg = getScraperConfig();
  let buildId = await resolveBuildId(cfg, query);
  let data: unknown;
  try {
    data = await fetchSearchJson(cfg, buildId, query);
  } catch (e) {
    if ((e as { code?: string }).code === "STALE_BUILD_ID") {
      buildId = await resolveBuildId(cfg, query, true);
      data = await fetchSearchJson(cfg, buildId, query);
    } else {
      throw e;
    }
  }
  const collected: Record<string, unknown>[] = [];
  collectListings(data, collected, new Set());
  const listings = collected.slice(0, cfg.maxResults).map(normalize);
  return { listings, phoneConcurrency: cfg.phoneConcurrency };
}

// --- phone reveal ----------------------------------------------------------
function deepFindPhone(node: unknown): string | null {
  if (node == null) return null;
  if (typeof node === "string") {
    const m = node.match(/(?:\+?972[-\s]?|0)5\d[-\s]?\d{3}[-\s]?\d{4}/);
    if (m) return m[0].replace(/[\s-]/g, "");
    return null;
  }
  if (typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const v of node) {
      const f = deepFindPhone(v);
      if (f) return f;
    }
    return null;
  }
  const rec = node as Record<string, unknown>;
  for (const [k, v] of Object.entries(rec)) {
    if (/phone|cell|mobile/i.test(k) && typeof v === "string" && /\d{7,}/.test(v)) {
      return v.replace(/[\s-]/g, "");
    }
    const f = deepFindPhone(v);
    if (f) return f;
  }
  return null;
}

async function tryEndpoint(cfg: ScraperConfig, url: string, itemId: string): Promise<PhoneResult | null> {
  try {
    const res = await fetch(url, {
      headers: buildHeaders(cfg, {
        Origin: cfg.baseUrl,
        Referer: `${cfg.baseUrl}/market/item/${itemId}`,
        "x-requested-with": "XMLHttpRequest",
      }),
    });
    if (res.status === 429 || res.status === 403) {
      return { phone: null, status: "rate_limited" };
    }
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("json")) return null;
    const json = (await res.json()) as unknown;
    const phone = deepFindPhone(json);
    if (phone) return { phone, status: "revealed" };
    return null;
  } catch {
    return null;
  }
}

export async function revealPhone(id: string, adId: string | null): Promise<PhoneResult> {
  const cfg = getScraperConfig();
  const candidates = [
    `${cfg.gwBaseUrl}/feed-search-legacy/item/${encodeURIComponent(id)}/contactInfo`,
    adId ? `${cfg.gwBaseUrl}/market-search/contactInfo?adId=${encodeURIComponent(adId)}` : null,
  ].filter((u): u is string => !!u);

  let rateLimited = false;
  for (const url of candidates) {
    const r = await tryEndpoint(cfg, url, id);
    if (r?.status === "revealed") return r;
    if (r?.status === "rate_limited") rateLimited = true;
  }

  // Fallback: item page next-data JSON
  try {
    const buildId = await resolveBuildId(cfg, "a");
    const url = `${cfg.baseUrl}/market/_next/data/${buildId}/market/item/${encodeURIComponent(id)}.json`;
    const res = await fetch(url, {
      headers: buildHeaders(cfg, {
        "x-nextjs-data": "1",
        Referer: `${cfg.baseUrl}/market/item/${id}`,
      }),
    });
    if (res.ok) {
      const json = (await res.json()) as unknown;
      const phone = deepFindPhone(json);
      if (phone) return { phone, status: "revealed" };
    } else if (res.status === 429 || res.status === 403) {
      rateLimited = true;
    }
  } catch {
    // ignore
  }

  return { phone: null, status: rateLimited ? "rate_limited" : "unavailable" };
}
