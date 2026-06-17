import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { scrapePage, type ScrapeResponse } from "@/lib/puppeteer.functions";
import { proxyFetch } from "@/lib/proxy-fetch.functions";
import { plugins, DEFAULT_PLUGIN_ID, type PluginFlow } from "@/plugins";
import {
  applyTheme,
  defaultConfig,
  readConfigFromUrl,
  writeConfigToUrl,
  type AppConfig,
} from "@/lib/config";
import {
  clearLogs,
  installConsolePatch,
  pushLog,
  subscribeLogs,
  type LogEntry,
} from "@/lib/logger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Plugin Scraper" },
      {
        name: "description",
        content:
          "Pluggable scraper: pick a plugin, enter a query, run flows. Yad2 plugin included.",
      },
    ],
  }),
  component: Index,
});

type DetailRow = {
  id: string;
  phone: string | null;
  phoneStatus: "ok" | "fail";
  detail: Record<string, string | null> | null;
  detailStatus: "ok" | "fail";
};

function Index() {
  const scrape = useServerFn(scrapePage);
  const proxy = useServerFn(proxyFetch);

  // ---- config (debug + theme) synced to URL ----
  const [config, setConfig] = useState<AppConfig>(defaultConfig);
  useEffect(() => {
    installConsolePatch();
    const fromUrl = readConfigFromUrl(window.location.search);
    const merged: AppConfig = { ...defaultConfig, ...fromUrl };
    setConfig(merged);
    applyTheme(merged.theme);
    writeConfigToUrl(merged);
  }, []);
  function updateConfig(partial: Partial<AppConfig>) {
    setConfig((prev) => {
      const next = { ...prev, ...partial };
      applyTheme(next.theme);
      writeConfigToUrl(next);
      return next;
    });
  }

  // ---- logs ----
  const [logs, setLogs] = useState<LogEntry[]>([]);
  useEffect(() => subscribeLogs(setLogs), []);

  // ---- plugin + query ----
  const [selectedPluginId, setSelectedPluginId] = useState(DEFAULT_PLUGIN_ID);
  const selectedPlugin = useMemo(
    () => plugins.find((p) => p.id === selectedPluginId) ?? plugins[0],
    [selectedPluginId],
  );

  const [query, setQuery] = useState(selectedPlugin.defaultQuery ?? "");
  const [url, setUrl] = useState(
    () => selectedPlugin.buildSearchUrl?.(selectedPlugin.defaultQuery ?? "") ?? "",
  );
  const [fullPage, setFullPage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScrapeResponse | null>(null);
  const [rawHtml, setRawHtml] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [extractedIds, setExtractedIds] = useState<string[]>([]);
  const [completedFlows, setCompletedFlows] = useState<string[]>([]);
  const [details, setDetails] = useState<DetailRow[]>([]);
  const [maxDetails, setMaxDetails] = useState(5);

  useEffect(() => {
    const defaultQuery = selectedPlugin.defaultQuery ?? "";
    setQuery(defaultQuery);
    setExtractedIds([]);
    setCompletedFlows([]);
    setDetails([]);
    if (selectedPlugin.buildSearchUrl) {
      setUrl(selectedPlugin.buildSearchUrl(defaultQuery));
    }
  }, [selectedPluginId, selectedPlugin]);

  function markComplete(action: PluginFlow["action"]) {
    const flowId = selectedPlugin.flows.find((f) => f.action === action)?.id;
    if (flowId) {
      setCompletedFlows((prev) => (prev.includes(flowId) ? prev : [...prev, flowId]));
    }
  }

  async function fetchLandingHtml() {
    if (!url.trim()) return;
    setLoading(true);
    setResult(null);
    pushLog({ source: "client", level: "info", message: `scrapePage ${url}` });
    const res = await scrape({ data: { url, fullPage } }).catch(
      (err: unknown): ScrapeResponse => ({
        ok: false,
        error: {
          code: "CLIENT_ERROR",
          message: err instanceof Error ? err.message : "Request failed",
        },
      }),
    );
    setResult(res);
    if (res.ok) {
      markComplete("loadLandingHtml");
      setExtractedIds([]);
      pushLog({
        source: "server",
        level: "info",
        message: `scrapePage ok: ${res.finalUrl} (html=${res.html.length}b)`,
      });
    } else {
      pushLog({
        source: "server",
        level: "error",
        message: `scrapePage failed: ${res.error.code} ${res.error.message}`,
      });
    }
    setLoading(false);
  }

  async function fetchListingsJson() {
    if (!selectedPlugin.buildListingsApiUrl) return;
    const apiUrl = selectedPlugin.buildListingsApiUrl(query);
    setLoading(true);
    pushLog({ source: "client", level: "info", message: `proxyFetch ${apiUrl}` });
    const res = await proxy({
      data: { url: apiUrl, referer: selectedPlugin.buildSearchUrl?.(query) },
    }).catch((err: unknown) => ({
      ok: false as const,
      error: {
        code: "CLIENT_ERROR",
        message: err instanceof Error ? err.message : "Request failed",
      },
    }));

    if (res.ok) {
      pushLog({
        source: "server",
        level: "info",
        message: `proxyFetch ${res.status} (${res.body.length}b)`,
      });
      setResult({
        ok: true,
        html: res.body,
        screenshot: "",
        title: `Listings JSON (HTTP ${res.status})`,
        finalUrl: res.finalUrl,
        items: [],
      });
      markComplete("fetchListingsJson");
      setExtractedIds([]);
    } else {
      setResult({ ok: false, error: res.error });
      pushLog({
        source: "server",
        level: "error",
        message: `proxyFetch failed: ${res.error.code} ${res.error.message}`,
      });
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
    markComplete("loadLandingHtml");
    setExtractedIds([]);
  }

  function harvestIds() {
    if (!result?.ok || !selectedPlugin.extractIds) return;
    const ids = selectedPlugin.extractIds(result.html);
    setExtractedIds(ids);
    markComplete("extractIds");
    pushLog({ source: "client", level: "info", message: `extracted ${ids.length} IDs` });
  }

  async function fetchDetailsForIds() {
    if (!extractedIds.length) return;
    const ids = extractedIds.slice(0, maxDetails);
    setLoading(true);
    const rows: DetailRow[] = [];
    for (const id of ids) {
      let phone: string | null = null;
      let phoneStatus: "ok" | "fail" = "fail";
      let detail: Record<string, string | null> | null = null;
      let detailStatus: "ok" | "fail" = "fail";

      if (selectedPlugin.buildPhoneApiUrl) {
        const phoneUrl = selectedPlugin.buildPhoneApiUrl(id);
        pushLog({ source: "client", level: "info", message: `phone ${phoneUrl}` });
        const phoneRes = await proxy({
          data: {
            url: phoneUrl,
            referer: selectedPlugin.buildItemDetailUrl?.(id),
          },
        }).catch(() => null);
        if (phoneRes?.ok && phoneRes.status === 200) {
          try {
            const j = JSON.parse(phoneRes.body) as { data?: { phone?: string } };
            phone = j.data?.phone ?? null;
            phoneStatus = phone ? "ok" : "fail";
          } catch {}
        }
        pushLog({
          source: "server",
          level: phoneStatus === "ok" ? "info" : "warn",
          message: `phone ${id}: ${phoneStatus}`,
        });
      }

      if (selectedPlugin.buildItemDetailUrl && selectedPlugin.parseItemDetail) {
        const detailUrl = selectedPlugin.buildItemDetailUrl(id);
        const detailRes = await proxy({ data: { url: detailUrl } }).catch(() => null);
        if (detailRes?.ok && detailRes.status === 200) {
          detail = selectedPlugin.parseItemDetail(detailRes.body);
          detailStatus = "ok";
        }
        pushLog({
          source: "server",
          level: detailStatus === "ok" ? "info" : "warn",
          message: `detail ${id}: ${detailStatus}`,
        });
      }

      rows.push({ id, phone, phoneStatus, detail, detailStatus });
      setDetails([...rows]);
    }
    markComplete("fetchDetailsForIds");
    setLoading(false);
  }

  function isFlowEnabled(f: PluginFlow) {
    if (f.action === "extractIds") return !!result?.ok;
    if (f.action === "fetchDetailsForIds") return extractedIds.length > 0;
    return f.dependsOn.every((dep) => completedFlows.includes(dep));
  }

  async function runFlow(flowId: string) {
    const f = selectedPlugin.flows.find((x) => x.id === flowId);
    if (!f) return;
    switch (f.action) {
      case "loadLandingHtml":
        return fetchLandingHtml();
      case "fetchListingsJson":
        return fetchListingsJson();
      case "extractIds":
        return harvestIds();
      case "fetchDetailsForIds":
        return fetchDetailsForIds();
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await fetchLandingHtml();
  }

  function copyAllLogs() {
    const txt = logs
      .map((l) => `[${new Date(l.ts).toISOString()}] ${l.source}/${l.level} ${l.message}`)
      .join("\n");
    navigator.clipboard.writeText(txt);
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10 text-foreground">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Plugin Scraper</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Pick a plugin, enter a query, run flows. Run{" "}
              <code className="rounded bg-muted px-1">bun run scrape:server</code> for
              landing-HTML flows.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              <span className="text-muted-foreground">Theme:</span>
              <select
                value={config.theme}
                onChange={(e) =>
                  updateConfig({ theme: e.target.value as AppConfig["theme"] })
                }
                className="rounded-md border border-input bg-background px-2 py-1"
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="blue">Blue</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.debug}
                onChange={(e) => updateConfig({ debug: e.target.checked })}
              />
              <span>Debug</span>
            </label>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-[200px_1fr_auto]">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Plugin</span>
            <select
              value={selectedPluginId}
              onChange={(e) => setSelectedPluginId(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2"
            >
              {plugins.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Query</span>
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (selectedPlugin.buildSearchUrl) {
                  setUrl(selectedPlugin.buildSearchUrl(e.target.value));
                }
              }}
              placeholder="search…"
              disabled={loading || !selectedPlugin.supportsQuery}
            />
          </label>
          <label className="flex items-end gap-2 text-sm">
            <input
              type="checkbox"
              checked={fullPage}
              onChange={(e) => setFullPage(e.target.checked)}
              className="mb-3"
            />
            <span className="mb-3">Full page</span>
          </label>
        </div>

        <form onSubmit={onSubmit} className="mt-3 flex gap-2">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="URL (autofilled from query)"
            disabled={loading}
          />
          <Button type="submit" disabled={loading || !url.trim()}>
            {loading ? "Working…" : "Fetch HTML"}
          </Button>
        </form>

        <div className="mt-6 rounded-md border bg-muted/30 p-4">
          <h2 className="text-base font-semibold">Flows — {selectedPlugin.name}</h2>
          <p className="text-sm text-muted-foreground">
            {selectedPlugin.description}
          </p>
          <div className="mt-3 space-y-3">
            {selectedPlugin.flows.map((f) => {
              const enabled = isFlowEnabled(f);
              const done = completedFlows.includes(f.id);
              return (
                <div
                  key={f.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background p-4"
                >
                  <div className="min-w-0">
                    <div className="font-medium">{f.name}</div>
                    <p className="text-sm text-muted-foreground">{f.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {f.action === "fetchDetailsForIds" && (
                      <label className="flex items-center gap-1 text-xs text-muted-foreground">
                        max
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={maxDetails}
                          onChange={(e) =>
                            setMaxDetails(Math.max(1, Number(e.target.value) || 1))
                          }
                          className="w-16 rounded-md border border-input bg-background px-2 py-1 text-sm"
                        />
                      </label>
                    )}
                    <span
                      className={`rounded-md px-2 py-1 text-xs ${
                        done
                          ? "bg-emerald-100 text-emerald-700"
                          : enabled
                            ? "bg-muted text-muted-foreground"
                            : "bg-muted text-muted-foreground opacity-60"
                      }`}
                    >
                      {done ? "Done" : enabled ? "Ready" : "Locked"}
                    </span>
                    <Button
                      type="button"
                      onClick={() => runFlow(f.id)}
                      disabled={!enabled || loading}
                    >
                      Run
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-6 rounded-md border bg-muted/30 p-4">
          <Accordion type="single" collapsible>
            <AccordionItem value="rawInput">
              <AccordionTrigger>Paste / upload HTML or JSON</AccordionTrigger>
              <AccordionContent>
                <textarea
                  value={rawHtml}
                  onChange={(e) => setRawHtml(e.target.value)}
                  className="min-h-[12rem] w-full rounded-md border bg-background p-3 text-xs font-mono"
                  spellCheck={false}
                  disabled={loading}
                  placeholder="Paste HTML or JSON here"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={loadRawHtml}
                    disabled={loading || !rawHtml.trim() || !selectedPlugin.supportsRawHtml}
                  >
                    Load input
                  </Button>
                  <label className="inline-flex cursor-pointer items-center rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition hover:bg-muted">
                    <span>Upload file</span>
                    <input
                      type="file"
                      accept="text/html,application/json,.html,.json"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleHtmlUpload(file);
                      }}
                      disabled={loading}
                    />
                  </label>
                  {uploadedFileName && (
                    <span className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                      {uploadedFileName}
                    </span>
                  )}
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
              <span className="font-medium text-foreground">
                {result.title || "(no title)"}
              </span>{" "}
              —{" "}
              <a
                className="underline"
                href={result.finalUrl}
                target="_blank"
                rel="noreferrer"
              >
                {result.finalUrl}
              </a>
            </div>
            <Tabs defaultValue={result.screenshot ? "screenshot" : "html"}>
              <TabsList>
                {result.screenshot && (
                  <TabsTrigger value="screenshot">Screenshot</TabsTrigger>
                )}
                <TabsTrigger value="html">HTML / JSON</TabsTrigger>
                {result.screenshot && (
                  <TabsTrigger value="rendered">Rendered</TabsTrigger>
                )}
              </TabsList>
              {result.screenshot && (
                <TabsContent value="screenshot" className="mt-4">
                  <div className="max-h-[70vh] overflow-auto rounded-md border bg-muted/30 p-2">
                    <img
                      src={result.screenshot}
                      alt="Page screenshot"
                      className="block max-w-full"
                    />
                  </div>
                </TabsContent>
              )}
              <TabsContent value="html" className="mt-4">
                <div className="mb-2 flex justify-end">
                  <Button
                    size="sm"
                    variant="secondary"
                    type="button"
                    onClick={() => navigator.clipboard.writeText(result.html)}
                  >
                    Copy
                  </Button>
                </div>
                <pre className="max-h-[70vh] overflow-auto rounded-md border bg-muted/30 p-3 text-xs leading-relaxed">
                  {result.html}
                </pre>
              </TabsContent>
              {result.screenshot && (
                <TabsContent value="rendered" className="mt-4">
                  <iframe
                    title="Rendered HTML"
                    srcDoc={result.html}
                    sandbox=""
                    className="h-[70vh] w-full rounded-md border bg-white"
                  />
                </TabsContent>
              )}
            </Tabs>

            {extractedIds.length > 0 && (
              <div className="mt-4 rounded-md border bg-muted/30 p-4">
                <div className="mb-2 text-sm font-medium">
                  Extracted IDs ({extractedIds.length})
                </div>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs">
                  {extractedIds.join("\n")}
                </pre>
              </div>
            )}

            {details.length > 0 && (
              <div className="mt-4 rounded-md border bg-muted/30 p-4">
                <div className="mb-2 text-sm font-medium">
                  Details ({details.length})
                </div>
                <div className="overflow-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b">
                        <th className="py-2 pr-3">ID</th>
                        <th className="py-2 pr-3">Phone</th>
                        <th className="py-2 pr-3">Title</th>
                        <th className="py-2 pr-3">City</th>
                        <th className="py-2 pr-3">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {details.map((r) => (
                        <tr key={r.id} className="border-b align-top">
                          <td className="py-2 pr-3 font-mono">{r.id}</td>
                          <td className="py-2 pr-3">
                            {r.phone ?? (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-2 pr-3" dir="auto">
                            {r.detail?.title ?? ""}
                          </td>
                          <td className="py-2 pr-3" dir="auto">
                            {r.detail?.city ?? ""}
                          </td>
                          <td className="py-2 pr-3" dir="auto">
                            {(r.detail?.description ?? "").slice(0, 120)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {config.debug && (
          <div className="mt-8 rounded-md border bg-muted/30 p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold">Logs ({logs.length})</h2>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={copyAllLogs}>
                  Copy all
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={clearLogs}>
                  Clear
                </Button>
              </div>
            </div>
            <div className="max-h-72 overflow-auto rounded-md border bg-background p-2 font-mono text-xs">
              {logs.length === 0 ? (
                <p className="text-muted-foreground">No logs yet.</p>
              ) : (
                logs.map((l) => (
                  <div
                    key={l.id}
                    className={
                      l.level === "error"
                        ? "text-destructive"
                        : l.level === "warn"
                          ? "text-amber-600"
                          : "text-foreground"
                    }
                  >
                    <span className="text-muted-foreground">
                      {new Date(l.ts).toLocaleTimeString()} [{l.source}/{l.level}]
                    </span>{" "}
                    {l.message}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
