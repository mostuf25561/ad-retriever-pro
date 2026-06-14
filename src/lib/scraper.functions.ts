import { createServerFn } from "@tanstack/react-start";
import { runSearch, revealPhone, type Listing, type PhoneResult } from "./scraper.server";

export type SearchResponse = { listings: Listing[]; phoneConcurrency: number };
export type PhoneResponse = PhoneResult;

export const searchListings = createServerFn({ method: "POST" })
  .inputValidator((input: { query: string }) => {
    if (!input || typeof input.query !== "string" || !input.query.trim()) {
      throw new Error("query is required");
    }
    if (input.query.length > 200) throw new Error("query too long");
    return { query: input.query.trim() };
  })
  .handler(async ({ data }): Promise<SearchResponse> => {
    return runSearch(data.query);
  });

export const getPhone = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string; adId: string | null }) => {
    if (!input || typeof input.id !== "string" || !input.id) {
      throw new Error("id is required");
    }
    return { id: input.id, adId: input.adId ?? null };
  })
  .handler(async ({ data }): Promise<PhoneResponse> => {
    return revealPhone(data.id, data.adId);
  });
