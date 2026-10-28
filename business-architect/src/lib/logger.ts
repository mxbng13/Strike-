import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

/**
 * Structured JSON logger with correlation ids (AsyncLocalStorage).
 * Any key that looks like a secret is redacted before output.
 */
type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const correlation = new AsyncLocalStorage<{ correlationId: string }>();
const SECRET_KEY = /(api[_-]?key|secret|password|token|authorization|cookie|credential)/i;
const SECRET_VALUE = /\b(sk-ant-[A-Za-z0-9_-]{8,}|sk-[A-Za-z0-9]{20,}|tvly-[A-Za-z0-9]{10,})\b/g;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth]";
  if (typeof value === "string") return value.replace(SECRET_VALUE, "[REDACTED]");
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: redact(value.message) };
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = SECRET_KEY.test(k) ? "[REDACTED]" : redact(v, depth + 1);
    return out;
  }
  return value;
}

export function withCorrelation<T>(fn: () => T, correlationId: string = randomUUID()): T {
  return correlation.run({ correlationId }, fn);
}

export function currentCorrelationId(): string | undefined {
  return correlation.getStore()?.correlationId;
}

const minLevel: Level = process.env.NODE_ENV === "test" ? "warn" : ((process.env.LOG_LEVEL as Level) ?? "info");
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function emit(level: Level, msg: string, fields?: Fields): void {
  if (order[level] < order[minLevel]) return;
  const line = {
    ts: new Date().toISOString(),
    level,
    msg,
    correlationId: currentCorrelationId(),
    ...(fields ? (redact(fields) as Fields) : {}),
  };
  const out = JSON.stringify(line);
  if (level === "error" || level === "warn") console.error(out);
  else process.stdout.write(out + "\n");
}

export const logger = {
  debug: (msg: string, f?: Fields) => emit("debug", msg, f),
  info: (msg: string, f?: Fields) => emit("info", msg, f),
  warn: (msg: string, f?: Fields) => emit("warn", msg, f),
  error: (msg: string, f?: Fields) => emit("error", msg, f),
};
