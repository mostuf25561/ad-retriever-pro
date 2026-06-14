// Server-only config: reads SCRAPER_* env vars. Call only inside server fn handlers.
export type ScraperConfig = {
  baseUrl: string;
  gwBaseUrl: string;
  userAgent: string;
  acceptLanguage: string;
  maxResults: number;
  phoneConcurrency: number;
  loginEmail: string | null;
  loginPassword: string | null;
};

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

function num(name: string, def: number): number {
  const v = process.env[name];
  if (!v) return def;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : def;
}

export function getScraperConfig(): ScraperConfig {
  const email = process.env.SCRAPER_LOGIN_EMAIL?.trim() || null;
  const password = process.env.SCRAPER_LOGIN_PASSWORD ?? null;
  return {
    baseUrl: req("SCRAPER_BASE_URL").replace(/\/$/, ""),
    gwBaseUrl: req("SCRAPER_GW_BASE_URL").replace(/\/$/, ""),
    userAgent: req("SCRAPER_USER_AGENT"),
    acceptLanguage: req("SCRAPER_ACCEPT_LANGUAGE"),
    maxResults: num("SCRAPER_MAX_RESULTS", 26),
    phoneConcurrency: num("SCRAPER_PHONE_CONCURRENCY", 4),
    loginEmail: email,
    loginPassword: password && password.length > 0 ? password : null,
  };
}
