import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { searchListings, getPhone } from "@/lib/scraper.functions";
import type { Listing, PhoneResult } from "@/lib/scraper.server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Marketplace Seller Lookup" },
      { name: "description", content: "Search a marketplace and reveal seller phone numbers." },
    ],
  }),
  component: Index,
});

type PhoneState = { status: "pending" | PhoneResult["status"]; phone?: string | null };

function Index() {
  const search = useServerFn(searchListings);
  const phone = useServerFn(getPhone);

  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<"idle" | "searching" | "revealing" | "done">("idle");
  const [listings, setListings] = useState<Listing[]>([]);
  const [phones, setPhones] = useState<Record<string, PhoneState>>({});
  const [revealed, setRevealed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setError(null);
    setPhase("searching");
    setListings([]);
    setPhones({});
    setRevealed(0);

    let res: { listings: Listing[]; phoneConcurrency: number };
    try {
      res = await search({ data: { query } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setPhase("idle");
      return;
    }

    setListings(res.listings);
    const initial: Record<string, PhoneState> = {};
    for (const l of res.listings) initial[l.id] = { status: "pending" };
    setPhones(initial);

    if (res.listings.length === 0) {
      setPhase("done");
      return;
    }

    setPhase("revealing");
    const queue = [...res.listings];
    const workers = Array.from({ length: Math.min(res.phoneConcurrency, queue.length) }, async () => {
      while (queue.length) {
        const item = queue.shift();
        if (!item) break;
        try {
          const r = await phone({ data: { id: item.id, adId: item.adId } });
          setPhones((p) => ({ ...p, [item.id]: { status: r.status, phone: r.phone } }));
        } catch {
          setPhones((p) => ({ ...p, [item.id]: { status: "unavailable" } }));
        }
        setRevealed((n) => n + 1);
      }
    });
    await Promise.all(workers);
    setPhase("done");
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-semibold tracking-tight">Marketplace Seller Lookup</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter a search query. We collect listings, then try to reveal each seller's phone.
        </p>

        <form onSubmit={onSubmit} className="mt-6 flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. PS4 PRO"
            disabled={phase === "searching" || phase === "revealing"}
          />
          <Button type="submit" disabled={phase === "searching" || phase === "revealing"}>
            {phase === "searching" ? "Searching…" : "Search"}
          </Button>
        </form>

        {error && (
          <p className="mt-4 text-sm text-destructive">{error}</p>
        )}

        {phase === "revealing" && (
          <p className="mt-4 text-sm text-muted-foreground">
            Revealing phones ({revealed}/{listings.length})…
          </p>
        )}
        {phase === "done" && listings.length > 0 && (
          <p className="mt-4 text-sm text-muted-foreground">
            Done — {listings.length} listings, {revealed} phone attempts.
          </p>
        )}
        {phase === "done" && listings.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">No listings found.</p>
        )}

        {listings.length > 0 && (
          <div className="mt-6 rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16"></TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>Seller ID</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Ad</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listings.map((l) => {
                  const p = phones[l.id];
                  return (
                    <TableRow key={l.id}>
                      <TableCell>
                        {l.image ? (
                          <img
                            src={l.image}
                            alt=""
                            className="h-10 w-10 rounded object-cover"
                            loading="lazy"
                          />
                        ) : null}
                      </TableCell>
                      <TableCell dir="auto" className="max-w-[260px] truncate" title={l.title}>
                        {l.title}
                      </TableCell>
                      <TableCell>{l.price != null ? `₪${l.price.toLocaleString()}` : "—"}</TableCell>
                      <TableCell dir="auto">{l.city ?? "—"}</TableCell>
                      <TableCell dir="auto">{l.condition ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{l.id}</TableCell>
                      <TableCell>
                        <PhoneCell state={p} />
                      </TableCell>
                      <TableCell>
                        <a
                          href={`/market/item/${l.id}`}
                          onClick={(e) => {
                            e.preventDefault();
                            window.open(buildAdUrl(l.id), "_blank", "noopener,noreferrer");
                          }}
                          className="text-sm underline text-primary"
                        >
                          Open
                        </a>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

function buildAdUrl(id: string): string {
  // Derive the ad URL from the env-provided origin at runtime via the search response would be ideal,
  // but for a simple link we just reuse the same path shape against the configured origin known to the server.
  // Since the client doesn't have direct env access, we proxy through a relative redirect handled by the browser.
  return `/api/open/${encodeURIComponent(id)}`;
}

function PhoneCell({ state }: { state?: PhoneState }) {
  if (!state || state.status === "pending") {
    return <Badge variant="secondary">Pending…</Badge>;
  }
  if (state.status === "revealed" && state.phone) {
    return <span className="font-mono text-sm">{state.phone}</span>;
  }
  if (state.status === "rate_limited") {
    return <Badge variant="destructive">Rate-limited</Badge>;
  }
  return <Badge variant="outline">Unavailable</Badge>;
}
