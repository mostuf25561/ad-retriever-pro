/**
 * Tiny in-memory log bus used by the debug logs panel.
 *
 * - Patches console.{log,info,warn,error,debug} on first use so client-side
 *   logs are captured automatically.
 * - Server functions push entries via `pushLog({ source: "server", ... })`.
 */
export type LogLevel = "log" | "info" | "warn" | "error" | "debug";
export type LogSource = "client" | "server";

export type LogEntry = {
  id: number;
  ts: number;
  source: LogSource;
  level: LogLevel;
  message: string;
};

type Listener = (entries: LogEntry[]) => void;

const entries: LogEntry[] = [];
const listeners = new Set<Listener>();
let nextId = 1;
let patched = false;

const MAX_ENTRIES = 500;

function emit() {
  for (const l of listeners) l(entries.slice());
}

export function pushLog(entry: Omit<LogEntry, "id" | "ts">) {
  entries.push({ ...entry, id: nextId++, ts: Date.now() });
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  emit();
}

export function getLogs(): LogEntry[] {
  return entries.slice();
}

export function clearLogs() {
  entries.length = 0;
  emit();
}

export function subscribeLogs(l: Listener): () => void {
  listeners.add(l);
  l(entries.slice());
  return () => listeners.delete(l);
}

function fmt(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
}

export function installConsolePatch() {
  if (patched || typeof window === "undefined") return;
  patched = true;
  const levels: LogLevel[] = ["log", "info", "warn", "error", "debug"];
  for (const level of levels) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      try {
        pushLog({ source: "client", level, message: fmt(args) });
      } catch {}
      original(...args);
    };
  }
}
