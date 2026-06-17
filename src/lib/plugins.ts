const YAD2_BASE_URL = "https://www.yad2.co.il/market/search";

export type PluginFlow = {
  id: string;
  name: string;
  description: string;
  dependsOn: string[];
  action: "loadLandingHtml" | "extractIds";
};

export type ScraperPlugin = {
  id: string;
  name: string;
  description: string;
  defaultQuery?: string;
  supportsQuery: boolean;
  supportsRawHtml: boolean;
  buildSearchUrl?: (query: string) => string;
  extractIds?: (html: string) => string[];
  flows: PluginFlow[];
};

export const plugins: ScraperPlugin[] = [
  {
    id: "yad2",
    name: "Yad2",
    description: "Yad2 marketplace search plugin.",
    defaultQuery: "xbox",
    supportsQuery: true,
    supportsRawHtml: true,
    buildSearchUrl: (query: string) => {
      const encoded = encodeURIComponent(query.trim()).replace(/%20/g, "+");
      return `${YAD2_BASE_URL}?q=${encoded}`;
    },
    extractIds: (html: string) => {
      const ids: string[] = [];
      const regex = /\/market\/item\/(\d+)\??/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(html)) !== null) {
        ids.push(match[1]);
      }

      try {
        const json = JSON.parse(html);
        const jsonText = JSON.stringify(json);
        let jsonMatch: RegExpExecArray | null;
        while ((jsonMatch = regex.exec(jsonText)) !== null) {
          ids.push(jsonMatch[1]);
        }
      } catch {
        // not JSON, ignore
      }

      return Array.from(new Set(ids));
    },
    flows: [
      {
        id: "landingHtmlLoaded",
        name: "Load landing HTML",
        description: "Fetch landing HTML via scraper server.",
        dependsOn: [],
        action: "loadLandingHtml",
      },
      {
        id: "extractAllIds",
        name: "Extract all ids from main html",
        description: "Harvest item IDs from the loaded HTML.",
        dependsOn: ["landingHtmlLoaded"],
        action: "extractIds",
      },
    ],
  },
];

export const DEFAULT_PLUGIN_ID = plugins[0].id;
