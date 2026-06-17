import { createServerFn } from "@tanstack/react-start";

export type ScrapeResponse =
  | {
      ok: true;
      html: string;
      screenshot: string;
      title: string;
      finalUrl: string;
      items: string[];
    }
  | { ok: false; error: { code: string; message: string } };

export const scrapePage = createServerFn({ method: "POST" })
  .inputValidator((input: { url: string; fullPage?: boolean; waitMs?: number }) => {
    if (!input || typeof input.url !== "string" || !input.url.trim()) {
      throw new Error("url is required");
    }
    try {
      new URL(input.url);
    } catch {
      throw new Error("url is not a valid URL");
    }
    return {
      url: input.url.trim(),
      fullPage: input.fullPage === true,
      waitMs: typeof input.waitMs === "number" && input.waitMs > 0 ? input.waitMs : 0,
    };
  })
  .handler(async ({ data }): Promise<ScrapeResponse> => {
    const base = (process.env.PUPPETEER_URL ?? "http://localhost:7070").replace(/\/$/, "");
    try {
      const res = await fetch(`${base}/scrape`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const text = await res.text();
      if (!res.ok) {
        let msg = text;
        try {
          const j = JSON.parse(text) as { error?: string };
          if (j.error) msg = j.error;
        } catch {}
        return {
          ok: false,
          error: { code: `PUPPETEER_${res.status}`, message: msg || `HTTP ${res.status}` },
        };
      }
      const json = JSON.parse(text) as {
        html: string;
        screenshot: string;
        title: string;
        finalUrl: string;
        items?: string[];
      };
      return { ok: true, html: json.html, screenshot: json.screenshot, title: json.title, finalUrl: json.finalUrl, items: json.items ?? [] };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        error: {
          code: "PUPPETEER_UNREACHABLE",
          message:
            `Could not reach the local Puppeteer server at ${base}. ` +
            `Start it with \`bun run scrape:server\`. (${message})`,
        },
      };
    }
  });
