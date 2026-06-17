/**
 * Client-readable app configuration.
 *
 * Debug mode is on by default and is also mirrored in the URL (`?debug=1|0`).
 * The Index page wires this together: on mount it reads the URL and updates
 * the config; when the user toggles debug, the URL is updated too.
 */
export type AppConfig = {
  /** When true the app exposes detailed client + server logs in the UI. */
  debug: boolean;
  /** Theme name controlling the global color tokens. */
  theme: "light" | "dark" | "blue";
};

export const defaultConfig: AppConfig = {
  debug: true,
  theme: "light",
};

export function readConfigFromUrl(search: string): Partial<AppConfig> {
  const params = new URLSearchParams(search);
  const out: Partial<AppConfig> = {};
  const debug = params.get("debug");
  if (debug === "1" || debug === "true") out.debug = true;
  if (debug === "0" || debug === "false") out.debug = false;
  const theme = params.get("theme");
  if (theme === "light" || theme === "dark" || theme === "blue") out.theme = theme;
  return out;
}

export function writeConfigToUrl(cfg: AppConfig): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("debug", cfg.debug ? "1" : "0");
  url.searchParams.set("theme", cfg.theme);
  window.history.replaceState({}, "", url.toString());
}

export function applyTheme(theme: AppConfig["theme"]): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("dark", "theme-blue");
  if (theme === "dark") root.classList.add("dark");
  if (theme === "blue") root.classList.add("theme-blue");
}
