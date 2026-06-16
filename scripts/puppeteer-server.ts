/**
 * Local Puppeteer scraping server.
 *
 * Run with:   bun run scrape:server
 * Listens on: http://localhost:7070
 *
 * POST /scrape   body: { "url": "https://example.com", "fullPage"?: boolean, "waitMs"?: number }
 *   -> { html: string, screenshot: string (data:image/png;base64,...), finalUrl: string, title: string }
 *
 * GET  /health   -> { ok: true }
 *
 * The Lovable app's server fn calls this via the PUPPETEER_URL env var
 * (default http://localhost:7070). Keep this process running while you scrape.
 */
import http from "node:http";
import puppeteer, { type Browser } from "puppeteer";

const PORT = Number(process.env.PORT ?? 7070);

let browserPromise: Promise<Browser> | null = null;
function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  return browserPromise;
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": buf.byteLength.toString(),
    "Access-Control-Allow-Origin": "*",
  });
  res.end(buf);
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function handleScrape(payload: { url: string; fullPage?: boolean; waitMs?: number }) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/127.0 Safari/537.36",
    );
    await page.goto(payload.url, { waitUntil: "networkidle2", timeout: 45_000 });
    if (payload.waitMs && payload.waitMs > 0) {
      await new Promise((r) => setTimeout(r, Math.min(payload.waitMs, 15_000)));
    }
    const [html, screenshot, title, finalUrl] = await Promise.all([
      page.content(),
      page.screenshot({
        type: "png",
        fullPage: payload.fullPage === true,
        encoding: "base64",
      }),
      page.title().catch(() => ""),
      Promise.resolve(page.url()),
    ]);
    return {
      html,
      screenshot: `data:image/png;base64,${screenshot}`,
      title,
      finalUrl,
    };
  } finally {
    await page.close().catch(() => {});
  }
}

const server = http.createServer(async (req, res) => {
  // CORS preflight — the Lovable app may call this from the browser too.
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && req.url === "/scrape") {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}") as { url?: string; fullPage?: boolean; waitMs?: number };
      if (!body.url || typeof body.url !== "string") {
        json(res, 400, { error: "url is required" });
        return;
      }
      try {
        new URL(body.url);
      } catch {
        json(res, 400, { error: "url is not a valid URL" });
        return;
      }
      const result = await handleScrape({ url: body.url, fullPage: body.fullPage, waitMs: body.waitMs });
      json(res, 200, result);
    } catch (e) {
      console.error("[scrape] error:", e);
      json(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  json(res, 404, { error: "not found" });
});

server.listen(PORT, () => {
  console.log(`Puppeteer server listening on http://localhost:${PORT}`);
  console.log(`  POST /scrape  { url, fullPage?, waitMs? }`);
  console.log(`  GET  /health`);
});

async function shutdown() {
  console.log("\nShutting down…");
  try {
    if (browserPromise) (await browserPromise).close();
  } catch {}
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
