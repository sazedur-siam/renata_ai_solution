/**
 * Best-effort per-IP limiter to protect the shared free-tier Gemini key on the
 * public demo. In-memory, so each serverless instance counts separately; good
 * enough for a demo, not a security control.
 */
const WINDOW_MS = 5 * 60 * 1000;
const MAX_REQUESTS = 20;

const hits = new Map<string, number[]>();

export function isRateLimited(ip: string, now = Date.now()): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);

  if (hits.size > 5000) {
    for (const [key, times] of hits) {
      if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(key);
    }
  }
  return false;
}
