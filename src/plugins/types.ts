/**
 * Plugin contract. Each plugin defines a set of flows that the UI lists and
 * runs in dependency order. Flows are pure descriptors — the actual work is
 * dispatched by `runFlow` in `src/routes/index.tsx`.
 */
export type FlowAction =
  | "loadLandingHtml"
  | "extractIds"
  | "fetchListingsJson"
  | "fetchDetailsForIds";

export type PluginFlow = {
  id: string;
  name: string;
  description: string;
  dependsOn: string[];
  action: FlowAction;
};

export type ScraperPlugin = {
  id: string;
  name: string;
  description: string;
  defaultQuery?: string;
  supportsQuery: boolean;
  supportsRawHtml: boolean;
  /** Build a URL suitable for puppeteer to load (HTML landing page). */
  buildSearchUrl?: (query: string) => string;
  /** Build a URL that returns JSON listings (raw API). */
  buildListingsApiUrl?: (query: string, page?: number) => string;
  /** Build a URL that returns the per-item detail page (HTML). */
  buildItemDetailUrl?: (id: string) => string;
  /** Build a URL that returns the per-item phone JSON. */
  buildPhoneApiUrl?: (id: string) => string;
  /** Extract IDs from either HTML or a JSON string. */
  extractIds?: (text: string) => string[];
  /** Parse the per-item detail HTML into structured fields. */
  parseItemDetail?: (html: string) => Record<string, string | null>;
  flows: PluginFlow[];
};
