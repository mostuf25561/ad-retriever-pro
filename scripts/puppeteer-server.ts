/// <reference types="node" />
/**
 * Local Puppeteer scraping server.
 *
 * Run with:   bun run scrape:server
 * Listens on: http://localhost:7070
 *
 * POST /scrape   body: { "url": "https://example.com", "fullPage"?: boolean, "waitMs"?: number }
 *   -> { html: string, screenshot: string (data:image/png;base64,...), finalUrl: string, title: string, items: string[] }
 *
 * POST /login    body: { "loginUrl"?: string, "login_url"?: string, "user"?: string, "password"?: string, "selectors": { "profileButton"?: string, "email": string, "password": string, "submit": string, "success"?: string }, "waitMs"?: number }
 *   -> { html: string, screenshot: string, title: string, finalUrl: string, success: boolean, loggedIn: boolean }
 *
 * GET  /health       -> { ok: true }
 * GET  /openapi.json -> OpenAPI 3.1 spec for the server
 * GET  /api-docs     -> Swagger UI for the server
 *
 * The Lovable app's server fn calls this via the PUPPETEER_URL env var
 * (default http://localhost:7070). Keep this process running while you scrape.
 */
import 'dotenv/config';
import express from "express";
import swaggerUi from "swagger-ui-express";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer, { type Browser } from "puppeteer";

const PORT = Number(process.env.PORT ?? 7070);

let browserPromise: Promise<Browser> | null = null;
function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--window-size=1280,800",
      ],
    });
  }
  return browserPromise;
}

const ARTIFACTS_BASE_DIR = path.resolve(fileURLToPath(new URL("../puppeteer-artifacts", import.meta.url)));

function randomDelay(min: number, max: number) {
  return Math.floor(min + Math.random() * (max - min));
}

async function applyStealth(page: puppeteer.Page) {
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    (window as any).chrome = {
      runtime: {},
      // Some sites check for specific properties
      loadTimes: () => undefined,
      webstore: {},
    };
    const originalQuery = window.navigator.permissions?.query?.bind(window.navigator.permissions);
    if (originalQuery) {
      window.navigator.permissions.query = (parameters: any) =>
        parameters.name === "notifications"
          ? Promise.resolve({ state: "denied" })
          : originalQuery(parameters);
    }
  });
}

async function humanType(page: puppeteer.Page, selector: string, text: string) {
  const element = await page.waitForSelector(selector, { timeout: 15_000 });
  if (!element) throw new Error(`Unable to type into selector ${selector}`);
  await element.focus();
  for (const char of text) {
    await page.keyboard.type(char, { delay: randomDelay(80, 140) });
  }
  await page.waitForTimeout(randomDelay(100, 250));
}

async function humanClick(page: puppeteer.Page, selector: string) {
  const element = await page.waitForSelector(selector, { timeout: 15_000 });
  if (!element) throw new Error(`Unable to click selector ${selector}`);
  const box = await element.boundingBox();
  if (!box) throw new Error(`Could not calculate bounding box for ${selector}`);
  const x = box.x + box.width / 2 + randomDelay(-4, 4);
  const y = box.y + box.height / 2 + randomDelay(-4, 4);
  await page.mouse.move(x, y, { steps: 10 });
  await page.waitForTimeout(randomDelay(150, 300));
  await page.mouse.click(x, y, { delay: randomDelay(80, 120) });
}

async function saveLoginArtifacts(runId: string, payload: {
  html?: string;
  screenshot?: string;
  logs: string[];
  metadata: Record<string, unknown>;
}) {
  await fs.mkdir(ARTIFACTS_BASE_DIR, { recursive: true });
  const runDir = path.join(ARTIFACTS_BASE_DIR, runId);
  await fs.mkdir(runDir, { recursive: true });

  const artifactPaths: string[] = [];
  const responseFile = path.join(runDir, "login-response.json");
  await fs.writeFile(responseFile, JSON.stringify({ metadata: payload.metadata, html: payload.html ? "[saved to login-page.html]" : undefined, screenshot: payload.screenshot ? "[saved to login-screenshot.png]" : undefined, logs: payload.logs }, null, 2), "utf8");
  artifactPaths.push(responseFile);

  if (payload.html) {
    const htmlFile = path.join(runDir, "login-page.html");
    await fs.writeFile(htmlFile, payload.html, "utf8");
    artifactPaths.push(htmlFile);
  }
  if (payload.screenshot) {
    const screenshotFile = path.join(runDir, "login-screenshot.png");
    const base64 = payload.screenshot.replace(/^data:image\/png;base64,/, "");
    await fs.writeFile(screenshotFile, base64, "base64");
    artifactPaths.push(screenshotFile);
  }
  if (payload.logs.length > 0) {
    const logsFile = path.join(runDir, "login-logs.txt");
    await fs.writeFile(logsFile, payload.logs.join("\n"), "utf8");
    artifactPaths.push(logsFile);
  }

  return artifactPaths;
}

async function handleScrape(payload: { url: string; fullPage?: boolean; waitMs?: number }) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await applyStealth(page);
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/127.0 Safari/537.36",
    );
    await page.setExtraHTTPHeaders({
      "accept-language": "en-US,en;q=0.9",
    });
    await page.goto(payload.url, { waitUntil: "networkidle2", timeout: 45_000 });
    await page.waitForTimeout(randomDelay(600, 1200));
    const waitMs = payload.waitMs ?? 0;
    if (waitMs > 0) {
      await page.waitForTimeout(Math.min(waitMs, 15_000));
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
    const itemIds: string[] = [];
    const regex = /\/market\/item\/(\d+)\??.*?/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
      itemIds.push(match[1]);
    }
    return {
      html,
      screenshot: `data:image/png;base64,${screenshot}`,
      title,
      finalUrl,
      items: itemIds,
    };
  } finally {
    await page.close().catch(() => {});
  }
}

class LoginError extends Error {
  html?: string;
  screenshot?: string;
  logs: string[];
  artifactPaths?: string[];
  constructor(message: string, details: { html?: string; screenshot?: string; logs?: string[]; artifactPaths?: string[] }) {
    super(message);
    this.html = details.html;
    this.screenshot = details.screenshot;
    this.logs = details.logs ?? [];
    this.artifactPaths = details.artifactPaths;
  }
}

async function handleLogin(payload: {
  loginUrl?: string;
  login_url?: string;
  user?: string;
  password?: string;
  selectors: {
    profileButton?: string;
    email: string;
    password: string;
    submit: string;
    success?: string;
  };
  waitMs?: number;
}) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  const pageLogs: string[] = [];

  const captureState = async () => {
    try {
      const [html, screenshot] = await Promise.all([
        page.content().catch(() => ""),
        page.screenshot({ type: "png", fullPage: false, encoding: "base64" }).catch(() => ""),
      ]);
      return {
        html,
        screenshot: screenshot ? `data:image/png;base64,${screenshot}` : undefined,
        logs: pageLogs,
      };
    } catch {
      return { html: "", screenshot: undefined, logs: pageLogs };
    }
  };

  page.on("console", (msg) => {
    pageLogs.push(`[console.${msg.type()}] ${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    pageLogs.push(`[pageerror] ${err.message}`);
  });

  try {
    const loginUrl = payload.loginUrl ?? payload.login_url ?? process.env.LOGIN_URL;
    const user = payload.user ?? process.env.USER;
    const password = payload.password ?? process.env.PASSWORD;

    if (!loginUrl || typeof loginUrl !== "string") {
      throw new Error("loginUrl is required");
    }
    if (!user || typeof user !== "string") {
      throw new Error("user is required");
    }
    if (!password || typeof password !== "string") {
      throw new Error("password is required");
    }

    await applyStealth(page);
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/127.0 Safari/537.36",
    );
    await page.setExtraHTTPHeaders({
      "accept-language": "en-US,en;q=0.9",
    });

    await page.goto(loginUrl, { waitUntil: "networkidle2", timeout: 45_000 });
    await page.waitForTimeout(randomDelay(700, 1300));

    const selectors = payload.selectors;
    if (selectors.profileButton) {
      await humanClick(page, selectors.profileButton);
      await page.waitForTimeout(randomDelay(400, 700));
    }

    await humanType(page, selectors.email, user);
    await humanType(page, selectors.password, password);
    await humanClick(page, selectors.submit);

    const waitMs = payload.waitMs ?? 0;
    if (waitMs > 0) {
      await new Promise((r) => setTimeout(r, Math.min(waitMs, 15_000)));
    }

    let loggedIn = false;
    if (selectors.success) {
      try {
        await page.waitForSelector(selectors.success, { timeout: 15_000 });
        loggedIn = true;
      } catch {
        loggedIn = false;
      }
    } else {
      await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30_000 }).catch(() => {});
      loggedIn = true;
    }

    const [html, screenshot, title, finalUrl] = await Promise.all([
      page.content(),
      page.screenshot({ type: "png", fullPage: false, encoding: "base64" }),
      page.title().catch(() => ""),
      Promise.resolve(page.url()),
    ]);

    const artifactPaths = await saveLoginArtifacts(String(Date.now()), {
      html,
      screenshot: `data:image/png;base64,${screenshot}`,
      logs: pageLogs,
      metadata: { success: true, loggedIn, finalUrl, title },
    });

    return {
      html,
      screenshot: `data:image/png;base64,${screenshot}`,
      title,
      finalUrl,
      success: true,
      loggedIn,
      artifactPaths,
    };
  } catch (error) {
    const state = await captureState();
    const artifactPaths = await saveLoginArtifacts(String(Date.now()), {
      html: state.html,
      screenshot: state.screenshot,
      logs: state.logs,
      metadata: { success: false, message: error instanceof Error ? error.message : String(error) },
    });
    throw new LoginError(error instanceof Error ? error.message : String(error), {
      ...state,
      artifactPaths,
    });
  } finally {
    await page.close().catch(() => {});
  }
}

const openapiSpec = JSON.parse(await fs.readFile(new URL("../openapi.json", import.meta.url), "utf8"));
const app = express();

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json());
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openapiSpec));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/openapi.json", (_req, res) => {
  res.json(openapiSpec);
});

app.post("/scrape", async (req, res) => {
  try {
    const body = req.body as { url?: string; fullPage?: boolean; waitMs?: number };
    if (!body.url || typeof body.url !== "string") {
      return res.status(400).json({ error: "url is required" });
    }
    try {
      new URL(body.url);
    } catch {
      return res.status(400).json({ error: "url is not a valid URL" });
    }
    const result = await handleScrape({ url: body.url, fullPage: body.fullPage, waitMs: body.waitMs });
    res.json(result);
  } catch (e) {
    console.error("[scrape] error:", e);
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.post("/login", async (req, res) => {
  try {
    const body = req.body as {
      loginUrl?: string;
      login_url?: string;
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
    };

    const selectors = body.selectors ?? {};
    const profileButton = typeof selectors.profileButton === "string" ? selectors.profileButton : undefined;
    const emailSelector = typeof selectors.email === "string" ? selectors.email : "";
    const passwordSelector = typeof selectors.password === "string" ? selectors.password : "";
    const submitSelector = typeof selectors.submit === "string" ? selectors.submit : "";
    const successSelector = typeof selectors.success === "string" ? selectors.success : undefined;

    if (!emailSelector || !passwordSelector || !submitSelector) {
      return res.status(400).json({ error: "selectors.email, selectors.password, and selectors.submit are required" });
    }

    try {
      const result = await handleLogin({
        loginUrl: body.loginUrl,
        login_url: body.login_url,
        user: body.user,
        password: body.password,
        selectors: {
          profileButton,
          email: emailSelector,
          password: passwordSelector,
          submit: submitSelector,
          success: successSelector,
        },
        waitMs: body.waitMs,
      });
      res.json(result);
    } catch (e) {
      if (e instanceof LoginError) {
        res.status(500).json({
          error: e.message,
          html: e.html,
          screenshot: e.screenshot,
          logs: e.logs,
          artifactPaths: e.artifactPaths,
        });
      } else {
        throw e;
      }
    }
  } catch (e) {
    console.error("[login] error:", e);
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: "not found" });
});

app.listen(PORT, () => {
  console.log(`Puppeteer server listening on http://localhost:${PORT}`);
  console.log(`  POST /scrape     { url, fullPage?, waitMs? }`);
  console.log(`  POST /login      { loginUrl?, login_url?, user?, password?, selectors: { email, password, submit, success? }, waitMs? }`);
  console.log(`  GET  /health`);
  console.log(`  GET  /openapi.json`);
  console.log(`  GET  /api-docs`);
})
