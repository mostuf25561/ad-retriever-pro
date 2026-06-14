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

export class ScraperConfigError extends Error {
  code = "CONFIG_MISSING";
  missing: string[];
  constructor(missing: string[]) {
    super(
      `Scraper is not configured. Missing env vars: ${missing.join(", ")}. ` +
        `Add them to a local .env file (see .env.example) or configure them in your deploy environment.`,
    );
    this.missing = missing;
  }
}

// Lazily load .env once per process for Node-based runtimes (dev preview, SSR on Node).
// No-op on Cloudflare workerd, which has no fs and where env is injected at request time.
let envLoaded = false;
function tryLoadEnvFile(): void {
  if (envLoaded) return;
  envLoaded = true;
  try {
    const p = process as unknown as { loadEnvFile?: (path?: string) => void };
    if (typeof p.loadEnvFile === "function") {
      p.loadEnvFile(".env");
    }
  } catch {
    // .env missing or runtime doesn't support fs — ignore.
  }
}

function num(name: string, def: number): number {
  const v = process.env[name];
  if (!v) return def;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : def;
}

export function getScraperConfig(): ScraperConfig {
  tryLoadEnvFile();
  const required = ["SCRAPER_BASE_URL", "SCRAPER_GW_BASE_URL", "SCRAPER_USER_AGENT", "SCRAPER_ACCEPT_LANGUAGE"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) throw new ScraperConfigError(missing);

  const email = process.env.SCRAPER_LOGIN_EMAIL?.trim() || null;
  const password = process.env.SCRAPER_LOGIN_PASSWORD ?? null;
  return {
    baseUrl: process.env.SCRAPER_BASE_URL!.replace(/\/$/, ""),
    gwBaseUrl: process.env.SCRAPER_GW_BASE_URL!.replace(/\/$/, ""),
    userAgent: process.env.SCRAPER_USER_AGENT!,
    acceptLanguage: process.env.SCRAPER_ACCEPT_LANGUAGE!,
    maxResults: num("SCRAPER_MAX_RESULTS", 26),
    phoneConcurrency: num("SCRAPER_PHONE_CONCURRENCY", 4),
    loginEmail: email,
    loginPassword: password && password.length > 0 ? password : null,
  };
}
