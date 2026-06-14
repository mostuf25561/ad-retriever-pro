import { createFileRoute } from "@tanstack/react-router";
import { getScraperConfig } from "@/lib/scraper-config.server";

export const Route = createFileRoute("/api/open/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const cfg = getScraperConfig();
        const id = encodeURIComponent(params.id);
        return new Response(null, {
          status: 302,
          headers: { Location: `${cfg.baseUrl}/market/item/${id}` },
        });
      },
    },
  },
});
