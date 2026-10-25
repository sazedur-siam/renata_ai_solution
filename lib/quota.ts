/**
 * Estimates how much of the Gemini free-tier daily quota is left.
 *
 * The Gemini API does not report remaining quota, so we count successful calls per
 * model per day and correct the count whenever Google returns a daily-quota 429
 * (which carries the real limit and the time until reset). Counts are in memory, so
 * on serverless hosting they restart with each instance: treat them as estimates.
 */

/** Free-tier requests per day per model (October 2026); corrected from 429s. */
const DEFAULT_DAILY_LIMIT = Number(process.env.GEMINI_DAILY_LIMIT ?? 20);

type ModelQuota = {
  day: string;
  used: number;
  limit: number;
  /** Set after a daily-quota 429: the model is skipped until this time. */
  exhaustedUntil?: number;
};

const quotas = new Map<string, ModelQuota>();

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

function current(model: string, now = Date.now()): ModelQuota {
  const day = pacificDay(now);
  let q = quotas.get(model);
  if (!q || q.day !== day) {
    q = { day, used: 0, limit: q?.limit ?? DEFAULT_DAILY_LIMIT };
    quotas.set(model, q);
  }
  if (q.exhaustedUntil && now >= q.exhaustedUntil) {
    q.exhaustedUntil = undefined;
    q.used = 0;
  }
  return q;
}

export function isExhausted(model: string): boolean {
  const q = current(model);
  return Boolean(q.exhaustedUntil) || q.used >= q.limit;
}

export function recordSuccess(model: string): void {
  current(model).used++;
}

/**
 * Updates the estimate from a 429. Returns true if it was the daily quota (the
 * model is then skipped until reset), false for a short per-minute limit.
 */
export function recordQuotaError(model: string, err: unknown): boolean {
  const message = String((err as Error)?.message ?? "");
  if (!/PerDay/i.test(message)) return false;

  const q = current(model);
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
  models: { model: string; remaining: number; limit: number }[];
};

export function snapshot(models: string[]): QuotaSnapshot {
  const now = Date.now();
  const rows = models.map((model) => {
    const q = current(model, now);
    const remaining = q.exhaustedUntil ? 0 : Math.max(0, q.limit - q.used);
    return { model, remaining, limit: q.limit };
  });
  const resetsAt = nextPacificMidnight(now);
  return {
    remaining: rows.reduce((n, r) => n + r.remaining, 0),
    primaryRemaining: rows.slice(0, -1).reduce((n, r) => n + r.remaining, 0),
    resetsAt,
    resetsInHours: Math.max(1, Math.ceil((resetsAt - now) / 3_600_000)),
    models: rows,
  };
}
