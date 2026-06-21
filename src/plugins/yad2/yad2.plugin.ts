/**
 * Yad2 marketplace plugin.
 *
 * Endpoints documented in plugins/yad2/README.md:
 *   - Listings JSON:  https://gw.yad2.co.il/recommerce-feed/search?q=...&pageNumber=N
 *   - Item phone:     https://gw.yad2.co.il/recommerce-feed/recommerce-item/<id>/customer
 *   - Item detail:    https://www.yad2.co.il/market/item/<id>
 *   - Landing search: https://www.yad2.co.il/market/search?q=...
 */
import type { ScraperPlugin } from "../types";

const LANDING_BASE = "https://www.yad2.co.il/market/search";
const ITEM_BASE = "https://www.yad2.co.il/market/item";
const GW_LISTINGS = "https://gw.yad2.co.il/recommerce-feed/search";
const GW_PHONE = "https://gw.yad2.co.il/recommerce-feed/recommerce-item";

function encodeQuery(q: string): string {
  return encodeURIComponent(q.trim()).replace(/%20/g, "+");
}

function extractTextByTestId(html: string, testId: string): string | null {
  const re = new RegExp(
    `data-testid=["']${testId}["'][^>]*>([\\s\\S]*?)<\\/[a-zA-Z]+>`,
    "i",
  );
  const m = re.exec(html);
  if (!m) return null;
  return m[1].replace(/<[^>]+>/g, "").trim() || null;
}

export const yad2Plugin: ScraperPlugin = {
  id: "yad2",
  name: "Yad2",
  description: "Yad2 marketplace — landing + JSON API + per-item details.",
  defaultQuery: "ps4 pro",
  supportsQuery: true,
  supportsRawHtml: true,
  supportsLogin: true,
  buildSearchUrl: (q) => `${LANDING_BASE}?q=${encodeQuery(q)}`,
  buildListingsApiUrl: (q, page = 1) =>
    `${GW_LISTINGS}?itemsPerPage=100&q=${encodeQuery(q)}&pageNumber=${page}`,
  buildItemDetailUrl: (id) => `${ITEM_BASE}/${id}`,
  buildPhoneApiUrl: (id) => `${GW_PHONE}/${id}/customer`,
  buildLoginUrl: () => "https://www.yad2.co.il/market/login",
  loginSelectors: {
    email: "[data-testid='text-field-email']",
    password: "[data-testid='text-field-password']",
    submit: "[type='submit']",
    success: "[data-testid='success-indicator']",
  },
  extractIds: (text) => {
    const ids = new Set<string>();
    const re = /\/market\/item\/(\d+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) ids.add(m[1]);

    // Also handle the listings JSON shape.
    try {
      const parsed = JSON.parse(text) as unknown;
      const walk = (v: unknown) => {
        if (!v) return;
        if (Array.isArray(v)) {
          for (const x of v) walk(x);
          return;
        }
        if (typeof v === "object") {
          const obj = v as Record<string, unknown>;
          if (typeof obj.id === "number" || typeof obj.id === "string") {
            const s = String(obj.id);
            if (/^\d{6,}$/.test(s)) ids.add(s);
          }
          for (const k of Object.keys(obj)) walk(obj[k]);
        }
      };
      walk(parsed);
    } catch {
      // not JSON, ignore
    }
    return Array.from(ids);
  },
  parseItemDetail: (html) => ({
    title: extractTextByTestId(html, "product-title"),
    description: extractTextByTestId(html, "item-description-text"),
    city: extractTextByTestId(html, "product-detail"),
  }),
  flows: [
    {
      id: "landingHtmlLoaded",
      name: "Load landing HTML",
      description: "Fetch the landing search HTML through the puppeteer server.",
      dependsOn: [],
      action: "loadLandingHtml",
    },
    {
      id: "login",
      name: "Login to Yad2",
      description: "Authenticate with Yad2 before fetching search results.",
      dependsOn: [],
      action: "login",
    },
    {
      id: "fetchListingsJson",
      name: "Fetch listings JSON (API)",
      description: "Call gw.yad2.co.il recommerce-feed/search and return JSON.",
      dependsOn: [],
      action: "fetchListingsJson",
    },
    {
      id: "extractAllIds",
      name: "Extract all IDs from loaded content",
      description: "Harvest item IDs from the currently loaded HTML or JSON.",
      dependsOn: [],
      action: "extractIds",
    },
    {
      id: "fetchDetailsForIds",
      name: "Fetch phone + details for each ID",
      description: "For every extracted ID, fetch the phone API and the item page.",
      dependsOn: [],
      action: "fetchDetailsForIds",
    },
  ],
};
