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

export type LoginResponse =
  | {
      ok: true;
      html: string;
      screenshot: string;
      title: string;
      finalUrl: string;
      success: boolean;
      loggedIn: boolean;
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

export const loginPage = createServerFn({ method: "POST" })
  .inputValidator((input: {
    loginUrl?: string;
    user?: string;
    password?: string;
    selectors?: {
      profileButton?: string;
      email?: string;
      password?: string;
      submit?: string;
      success?: string;
    };
    waitMs?: number;
  }) => {
    const selectors = input?.selectors;
    if (!selectors || typeof selectors !== "object") {
      throw new Error("selectors are required");
    }
    if (typeof selectors.email !== "string" || !selectors.email.trim()) {
      throw new Error("selectors.email is required");
    }
    if (typeof selectors.password !== "string" || !selectors.password.trim()) {
      throw new Error("selectors.password is required");
    }
    if (typeof selectors.submit !== "string" || !selectors.submit.trim()) {
      throw new Error("selectors.submit is required");
    }
    return {
      loginUrl: typeof input.loginUrl === "string" && input.loginUrl.trim() ? input.loginUrl.trim() : undefined,
      user: typeof input.user === "string" && input.user.trim() ? input.user.trim() : undefined,
      password: typeof input.password === "string" && input.password.trim() ? input.password.trim() : undefined,
      selectors: {
        profileButton: typeof selectors.profileButton === "string" && selectors.profileButton.trim() ? selectors.profileButton.trim() : undefined,
        email: selectors.email.trim(),
        password: selectors.password.trim(),
        submit: selectors.submit.trim(),
        success: typeof selectors.success === "string" && selectors.success.trim() ? selectors.success.trim() : undefined,
      },
      waitMs: typeof input.waitMs === "number" && input.waitMs > 0 ? input.waitMs : 0,
    };
  })
  .handler(async ({ data }): Promise<LoginResponse> => {
    const base = (process.env.PUPPETEER_URL ?? "http://localhost:7070").replace(/\/$/, "");
    try {
      const res = await fetch(`${base}/login`, {
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
        success: boolean;
        loggedIn: boolean;
      };
      return {
        ok: true,
        html: json.html,
        screenshot: json.screenshot,
        title: json.title,
        finalUrl: json.finalUrl,
        success: json.success,
        loggedIn: json.loggedIn,
      };
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
