import { createHash } from "node:crypto";

/**
 * Estimates how much of the Gemini free-tier daily quota is left.
 *
 * The Gemini API does not report remaining quota, so we count successful calls per
 * model per day and correct the count whenever Google returns a daily-quota 429
 * (which carries the real limit and the time until reset). Counts are in memory, so
 * on serverless hosting they restart with each instance: treat them as estimates.
 *
 * Each API key has its own quota, so counts are kept per "scope": the shared demo
 * key, or a hash of a visitor's own key (the key itself is never kept).
 */

/** Free-tier requests per day per model (October 2026); corrected from 429s. */
const DEFAULT_DAILY_LIMIT = Number(process.env.GEMINI_DAILY_LIMIT ?? 20);

export const SHARED_SCOPE = "shared";

type ModelQuota = {
  day: string;
  used: number;
  limit: number;
  /** Set after a daily-quota 429: the model is skipped until this time. */
  exhaustedUntil?: number;
};

const quotas = new Map<string, ModelQuota>();

/** Scope for a request: the shared demo key, or a one-way hash of the visitor's key. */
export function quotaScope(userApiKey?: string): string {
  if (!userApiKey) return SHARED_SCOPE;
  return "user:" + createHash("sha256").update(userApiKey).digest("hex").slice(0, 16);
}

/** Free-tier daily quotas reset at midnight Pacific time. */
function pacificDay(now = Date.now()): string {
  return new Date(now).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

function nextPacificMidnight(now = Date.now()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const elapsed = (get("hour") * 3600 + get("minute") * 60 + get("second")) * 1000;
  return now - elapsed + 24 * 3600 * 1000;
}

function current(scope: string, model: string, now = Date.now()): ModelQuota {
  const key = `${scope}|${model}`;
  const day = pacificDay(now);
  let q = quotas.get(key);
  if (!q || q.day !== day) {
    q = { day, used: 0, limit: q?.limit ?? DEFAULT_DAILY_LIMIT };
    quotas.set(key, q);
    if (quotas.size > 5000) prune(day);
  }
  if (q.exhaustedUntil && now >= q.exhaustedUntil) {
    q.exhaustedUntil = undefined;
    q.used = 0;
  }
  return q;
}

/** Drops entries from previous days so visitor scopes can't grow memory forever. */
function prune(today: string) {
  for (const [key, q] of quotas) if (q.day !== today) quotas.delete(key);
}

export function isExhausted(scope: string, model: string): boolean {
  const q = current(scope, model);
  return Boolean(q.exhaustedUntil) || q.used >= q.limit;
}

export function recordSuccess(scope: string, model: string): void {
  current(scope, model).used++;
}

/**
 * Updates the estimate from a 429. Returns true if it was the daily quota (the
 * model is then skipped until reset), false for a short per-minute limit.
 */
export function recordQuotaError(scope: string, model: string, err: unknown): boolean {
  const message = String((err as Error)?.message ?? "");
  if (!/PerDay/i.test(message)) return false;

  const q = current(scope, model);
  const limit = Number(message.match(/"quotaValue"\s*:\s*"?(\d+)/)?.[1]);
  if (limit > 0) q.limit = limit;
  q.used = q.limit;
  const retrySeconds = Number(message.match(/"retryDelay"\s*:\s*"(\d+)s"/)?.[1]);
  q.exhaustedUntil = retrySeconds > 0 ? Date.now() + retrySeconds * 1000 : nextPacificMidnight();
  return true;
}

export type QuotaSnapshot = {
  /** Estimated answers left today across all models in the chain. */
  remaining: number;
  /** Estimated answers left on the stronger models (all but the last fallback). */
  primaryRemaining: number;
  resetsAt: number;
  /** Whole hours until the daily reset, rounded up (at least 1). */
  resetsInHours: number;
  /** True when the estimate is for the visitor's own key rather than the shared one. */
  ownKey: boolean;
  models: { model: string; remaining: number; limit: number }[];
};

export function snapshot(models: string[], scope: string): QuotaSnapshot {
  const now = Date.now();
  const rows = models.map((model) => {
    const q = current(scope, model, now);
    const remaining = q.exhaustedUntil ? 0 : Math.max(0, q.limit - q.used);
    return { model, remaining, limit: q.limit };
  });
  const resetsAt = nextPacificMidnight(now);
  return {
    remaining: rows.reduce((n, r) => n + r.remaining, 0),
    primaryRemaining: rows.slice(0, -1).reduce((n, r) => n + r.remaining, 0),
    resetsAt,
    resetsInHours: Math.max(1, Math.ceil((resetsAt - now) / 3_600_000)),
    ownKey: scope !== SHARED_SCOPE,
    models: rows,
  };
}
