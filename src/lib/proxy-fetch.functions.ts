/**
 * Generic server-side HTTP GET used by plugins (e.g. Yad2 gw.* APIs).
 *
 * Runs on the server so we bypass browser CORS and can forward realistic
 * browser headers without exposing them to the client.
 */
import { createServerFn } from "@tanstack/react-start";

export type ProxyFetchResponse =
  | { ok: true; status: number; body: string; contentType: string; finalUrl: string }
  | { ok: false; error: { code: string; message: string } };

const DEFAULT_HEADERS: Record<string, string> = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/127.0 Safari/537.36",
  "accept-language": "he-IL,he;q=0.9,en;q=0.8",
  accept: "application/json,text/html,*/*",
};

export const proxyFetch = createServerFn({ method: "POST" })
  .inputValidator((input: { url: string; referer?: string }) => {
    if (!input || typeof input.url !== "string" || !input.url.trim()) {
      throw new Error("url is required");
    }
    try {
      new URL(input.url);
    } catch {
      throw new Error("url is not a valid URL");
    }
    return { url: input.url.trim(), referer: input.referer };
  })
  .handler(async ({ data }): Promise<ProxyFetchResponse> => {
    try {
      const headers: Record<string, string> = { ...DEFAULT_HEADERS };
      if (data.referer) headers["referer"] = data.referer;
      const res = await fetch(data.url, { headers, redirect: "follow" });
      const body = await res.text();
      return {
        ok: true,
        status: res.status,
        body,
        contentType: res.headers.get("content-type") ?? "",
        finalUrl: res.url || data.url,
      };
    } catch (e) {
      return {
        ok: false,
        error: {
          code: "PROXY_FETCH_FAILED",
          message: e instanceof Error ? e.message : String(e),
        },
      };
    }
  });
