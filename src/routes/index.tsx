import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { scrapePage, type ScrapeResponse } from "@/lib/puppeteer.functions";
import { plugins, DEFAULT_PLUGIN_ID, type PluginFlow } from "@/lib/plugins";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
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
  const [selectedPluginId, setSelectedPluginId] = useState(DEFAULT_PLUGIN_ID);
  const selectedPlugin = plugins.find((plugin) => plugin.id === selectedPluginId) ?? plugins[0];

  const [query, setQuery] = useState(selectedPlugin.defaultQuery ?? "");
  const [url, setUrl] = useState(() => selectedPlugin.buildSearchUrl?.(selectedPlugin.defaultQuery ?? "") ?? "");
  const [fullPage, setFullPage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScrapeResponse | null>(null);
  const [script, setScript] = useState("items.map(id => id)");
  const [scriptResult, setScriptResult] = useState<string | null>(null);

  const [rawHtml, setRawHtml] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [extractedIds, setExtractedIds] = useState<string[]>([]);
  const [completedFlows, setCompletedFlows] = useState<string[]>([]);

  useEffect(() => {
    const defaultQuery = selectedPlugin.defaultQuery ?? "";
    setQuery(defaultQuery);
    setExtractedIds([]);
    setCompletedFlows([]);
    if (selectedPlugin.buildSearchUrl) {
      setUrl(selectedPlugin.buildSearchUrl(defaultQuery));
    }
  }, [selectedPluginId, selectedPlugin]);

  function getFlowIdByAction(action: PluginFlow["action"]) {
    return selectedPlugin.flows.find((flow) => flow.action === action)?.id;
  }

  async function fetchLandingHtml() {
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
    if (res.ok) {
      const flowId = getFlowIdByAction("loadLandingHtml");
      if (flowId) {
        setCompletedFlows((prev) => (prev.includes(flowId) ? prev : [...prev, flowId]));
      }
      setExtractedIds([]);
    }
    setLoading(false);
  }

  async function handleHtmlUpload(file: File) {
    const text = await file.text();
    setUploadedFileName(file.name);
    setRawHtml(text);
  }

  function loadRawHtml() {
    if (!rawHtml.trim()) return;
    setResult({
      ok: true,
      html: rawHtml,
      screenshot: "",
      title: "Raw HTML",
      finalUrl: "(raw html)",
      items: [],
    });
    const flowId = getFlowIdByAction("loadLandingHtml");
    if (flowId) {
      setCompletedFlows((prev) => (prev.includes(flowId) ? prev : [...prev, flowId]));
    }
    setExtractedIds([]);
  }

  function harvestIds() {
    if (!result?.ok || !selectedPlugin.extractIds) return;
    const ids = selectedPlugin.extractIds(result.html);
    setExtractedIds(ids);
    const flowId = getFlowIdByAction("extractIds");
    if (flowId) {
      setCompletedFlows((prev) => (prev.includes(flowId) ? prev : [...prev, flowId]));
    }
  }

  function isFlowEnabled(flowDef: PluginFlow) {
    return flowDef.dependsOn.every((dep) => completedFlows.includes(dep));
  }

  function isFlowComplete(flowDef: PluginFlow) {
    return completedFlows.includes(flowDef.id);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await fetchLandingHtml();
  }

  async function runFlow(flowId: string) {
    const flowDef = selectedPlugin.flows.find((flow) => flow.id === flowId);
    if (!flowDef) return;

    if (flowDef.action === "loadLandingHtml") {
      await fetchLandingHtml();
      return;
    }
    if (flowDef.action === "extractIds") {
      harvestIds();
      return;
    }
  }

  async function runScript() {
    if (!result?.ok) return;
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function("items", `return ${script}`);
      const output = fn(result.items ?? []);
      setScriptResult(JSON.stringify(output, null, 2));
    } catch (err) {
      setScriptResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-semibold tracking-tight">Puppeteer Scraper</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Fetches a URL through a local headless Chromium. Run <code className="rounded bg-muted px-1">bun run scrape:server</code> first.
        </p>

        <div className="mt-6 rounded-md border bg-muted/30 p-4">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-semibold">Plugin Flows</h2>
              <p className="text-sm text-muted-foreground">Select a plugin and run its flows in order.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm text-muted-foreground">Plugin:</label>
              <select
                value={selectedPluginId}
                onChange={(e) => setSelectedPluginId(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              >
                {plugins.map((plugin) => (
                  <option key={plugin.id} value={plugin.id}>{plugin.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-3">
            {selectedPlugin.flows.map((flowDef) => (
              <div key={flowDef.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background p-4">
                <div className="min-w-0">
                  <div className="font-medium">{flowDef.name}</div>
                  <p className="text-sm text-muted-foreground">{flowDef.description}</p>
                  {flowDef.dependsOn.length > 0 ? (
                    <div className="mt-2 text-xs text-muted-foreground">
                      Depends on: {flowDef.dependsOn.join(", ")}
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-md px-2 py-1 text-xs ${isFlowComplete(flowDef) ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                    {isFlowComplete(flowDef) ? "Done" : isFlowEnabled(flowDef) ? "Ready" : "Locked"}
                  </span>
                  <Button type="button" onClick={() => runFlow(flowDef.id)} disabled={!isFlowEnabled(flowDef) || loading}>
                    Run
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <form onSubmit={onSubmit} className="mt-4 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (selectedPlugin.buildSearchUrl) {
                setUrl(selectedPlugin.buildSearchUrl(e.target.value));
              }
            }}
            placeholder={selectedPlugin.supportsQuery ? "Search query" : "Search query (not supported)"}
            className="min-w-[280px] flex-1"
            disabled={loading || !selectedPlugin.supportsQuery}
          />
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={selectedPlugin.buildSearchUrl ? selectedPlugin.buildSearchUrl(selectedPlugin.defaultQuery ?? "") : "Enter a URL"}
            className="min-w-[280px] flex-1"
            disabled={loading}
          />
          <Button type="submit" disabled={loading || !url.trim()}>
            {loading ? "Fetching…" : "Fetch"}
          </Button>
        </form>

        <div className="mt-6 rounded-md border bg-muted/30 p-4">
          <Accordion type="single" collapsible defaultValue="">
            <AccordionItem value="rawInput">
              <AccordionTrigger>Paste / upload HTML or JSON</AccordionTrigger>
              <AccordionContent>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">Paste / upload HTML or JSON</div>
                    <p className="text-sm text-muted-foreground">Load input directly instead of fetching through the scraper server.</p>
                  </div>
                  <Button type="button" onClick={loadRawHtml} disabled={loading || !rawHtml.trim() || !selectedPlugin.supportsRawHtml}>
                    Load input
                  </Button>
                </div>
                <textarea
                  value={rawHtml}
                  onChange={(e) => setRawHtml(e.target.value)}
                  className="min-h-[12rem] w-full rounded-md border bg-background p-3 text-xs font-mono text-foreground"
                  spellCheck={false}
                  disabled={loading}
                  placeholder="Paste HTML or JSON here"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <label className="inline-flex cursor-pointer items-center rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm transition hover:bg-muted">
                    <span>Upload file</span>
                    <input
                      type="file"
                      accept="text/html,application/json,.html,.json"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleHtmlUpload(file);
                        }
                      }}
                      disabled={loading}
                    />
                  </label>
                  {uploadedFileName ? (
                    <span className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{uploadedFileName}</span>
                  ) : null}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

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
            <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
              <div>
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
              <div className="space-y-4">
                <div className="rounded-md border bg-muted/30 p-4">
                  <div className="mb-2 text-sm font-medium">Extracted IDs</div>
                  <div className="flex flex-wrap gap-2 mb-3 text-sm text-muted-foreground">
                    <span>Source:</span>
                    <span className="rounded-md bg-background px-2 py-1">{result?.title === "Raw HTML" ? "Raw HTML" : "Fetched HTML"}</span>
                    <Button type="button" size="sm" variant="secondary" onClick={harvestIds} disabled={!result?.ok || loading}>
                      Harvest IDs
                    </Button>
                  </div>
                  <div className="text-sm text-foreground">
                    {extractedIds.length > 0 ? (
                      <pre className="max-h-[24rem] overflow-auto whitespace-pre-wrap text-xs leading-relaxed">{extractedIds.join("\n")}</pre>
                    ) : (
                      <p className="text-sm text-muted-foreground">No IDs extracted yet. Click "Harvest IDs" to parse the page HTML.</p>
                    )}
                  </div>
                </div>
                <div className="rounded-md border bg-muted/30 p-4">
                  <div className="mb-2 text-sm font-medium">Run script over extracted IDs</div>
                  <textarea
                    value={script}
                    onChange={(e) => setScript(e.target.value)}
                    className="min-h-[10rem] w-full rounded-md border bg-background p-3 text-xs font-mono text-foreground"
                    spellCheck={false}
                  />
                  <div className="mt-2 flex gap-2">
                    <Button type="button" onClick={runScript} disabled={!result?.ok || loading}>
                      Run script
                    </Button>
                            <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setScript("items");
                        setScriptResult(null);
                      }}
                    >
                      Reset script
                    </Button>
                  </div>
                  {scriptResult && (
                    <pre className="mt-3 max-h-[18rem] overflow-auto rounded-md border bg-background p-3 text-xs leading-relaxed">
                      {scriptResult}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
