import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { scrapePage, type ScrapeResponse } from "@/lib/puppeteer.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Puppeteer Scraper" },
      { name: "description", content: "Fetch a page with headless Chromium and view its screenshot + HTML." },
    ],
  }),
  component: Index,
});

function Index() {
  const scrape = useServerFn(scrapePage);
  const [url, setUrl] = useState("https://example.com");
  const [fullPage, setFullPage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScrapeResponse | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setResult(null);
    const res = await scrape({ data: { url, fullPage } }).catch(
      (err: unknown): ScrapeResponse => ({
        ok: false,
        error: { code: "CLIENT_ERROR", message: err instanceof Error ? err.message : "Request failed" },
      }),
    );
    setResult(res);
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-semibold tracking-tight">Puppeteer Scraper</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Fetches a URL through a local headless Chromium. Run <code className="rounded bg-muted px-1">bun run scrape:server</code> first.
        </p>

        <form onSubmit={onSubmit} className="mt-6 flex flex-wrap gap-2">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            className="min-w-[280px] flex-1"
            disabled={loading}
          />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={fullPage}
              onChange={(e) => setFullPage(e.target.checked)}
              disabled={loading}
            />
            Full page
          </label>
          <Button type="submit" disabled={loading}>
            {loading ? "Fetching…" : "Fetch"}
          </Button>
        </form>

        {result && !result.ok && (
          <div className="mt-6 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
            <p className="font-medium text-destructive">{result.error.code}</p>
            <p className="mt-1 text-destructive/90">{result.error.message}</p>
          </div>
        )}

        {result && result.ok && (
          <div className="mt-6 space-y-2">
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{result.title || "(no title)"}</span>{" "}
              — <a className="underline" href={result.finalUrl} target="_blank" rel="noreferrer">{result.finalUrl}</a>
            </div>
            <Tabs defaultValue="screenshot">
              <TabsList>
                <TabsTrigger value="screenshot">Screenshot</TabsTrigger>
                <TabsTrigger value="html">HTML</TabsTrigger>
                <TabsTrigger value="rendered">Rendered</TabsTrigger>
              </TabsList>
              <TabsContent value="screenshot" className="mt-4">
                <div className="overflow-auto rounded-md border bg-muted/30 p-2 max-h-[70vh]">
                  <img src={result.screenshot} alt="Page screenshot" className="block max-w-full" />
                </div>
              </TabsContent>
              <TabsContent value="html" className="mt-4">
                <div className="mb-2 flex justify-end">
                  <Button
                    size="sm"
                    variant="secondary"
                    type="button"
                    onClick={() => navigator.clipboard.writeText(result.html)}
                  >
                    Copy HTML
                  </Button>
                </div>
                <pre className="max-h-[70vh] overflow-auto rounded-md border bg-muted/30 p-3 text-xs leading-relaxed">
                  {result.html}
                </pre>
              </TabsContent>
              <TabsContent value="rendered" className="mt-4">
                <iframe
                  title="Rendered HTML"
                  srcDoc={result.html}
                  sandbox=""
                  className="h-[70vh] w-full rounded-md border bg-white"
                />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
}
