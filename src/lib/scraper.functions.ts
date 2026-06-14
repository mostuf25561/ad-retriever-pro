import { createServerFn } from "@tanstack/react-start";
import { runSearch, revealPhone, type Listing, type PhoneResult } from "./scraper.server";

export type SearchResponse =
  | { ok: true; listings: Listing[]; phoneConcurrency: number }
  | { ok: false; error: { code: string; message: string; missing?: string[] } };

export type PhoneResponse =
  | (PhoneResult & { ok: true })
  | { ok: false; error: { code: string; message: string } };

function describeError(e: unknown): { code: string; message: string; missing?: string[] } {
  if (e && typeof e === "object") {
    const rec = e as { code?: unknown; message?: unknown; missing?: unknown };
    const code = typeof rec.code === "string" ? rec.code : "INTERNAL_ERROR";
    const message = typeof rec.message === "string" ? rec.message : "Unexpected server error";
    const missing = Array.isArray(rec.missing) ? (rec.missing.filter((x) => typeof x === "string") as string[]) : undefined;
    return missing ? { code, message, missing } : { code, message };
  }
  return { code: "INTERNAL_ERROR", message: String(e) };
}

export const searchListings = createServerFn({ method: "POST" })
  .inputValidator((input: { query: string }) => {
    if (!input || typeof input.query !== "string" || !input.query.trim()) {
      throw new Error("query is required");
    }
    if (input.query.length > 200) throw new Error("query too long");
    return { query: input.query.trim() };
  })
  .handler(async ({ data }): Promise<SearchResponse> => {
    try {
      const r = await runSearch(data.query);
      return { ok: true, ...r };
    } catch (e) {
      console.error("searchListings failed:", e);
      return { ok: false, error: describeError(e) };
    }
  });

export const getPhone = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string; adId: string | null }) => {
    if (!input || typeof input.id !== "string" || !input.id) {
      throw new Error("id is required");
    }
    return { id: input.id, adId: input.adId ?? null };
  })
  .handler(async ({ data }): Promise<PhoneResponse> => {
    try {
      const r = await revealPhone(data.id, data.adId);
      return { ok: true, ...r };
    } catch (e) {
      console.error("getPhone failed:", e);
      return { ok: false, error: describeError(e) };
    }
  });
