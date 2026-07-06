// Lightweight in-memory rate limiting + bot heuristics for public write endpoints (suggestion /
// report / analytics forms). Per-instance only — fine for the current single-node deployment; swap
// the Map for Redis (see apps/worker/src/redis.ts) if/when we scale horizontally.
//
// Why in-memory: these endpoints have no auth, so a bot can otherwise flood the DB (and, once
// RESEND_API_KEY is set, the admin's inbox). A fixed-window counter keyed by IP+bucket is enough to
// blunt that without a new dependency.

interface Window {
  count: number;
  resetAt: number; // epoch ms when this window rolls over
}

const windows = new Map<string, Window>();
// Bound memory: if the map grows past this, sweep expired entries. Bots rotating IPs could otherwise
// accumulate stale keys indefinitely.
const SWEEP_THRESHOLD = 10_000;

function sweep(now: number): void {
  for (const [key, w] of windows) {
    if (w.resetAt <= now) windows.delete(key);
  }
}

/** Best-effort client IP from proxy headers; falls back to a shared bucket when unknown. */
export function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

/**
 * Fixed-window limiter. Returns `ok: false` with `retryAfterSec` once `limit` is hit inside
 * `windowMs`. `bucket` namespaces the counter so different endpoints don't share a budget.
 */
export function rateLimit(
  ip: string,
  bucket: string,
  opts: { limit: number; windowMs: number },
): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  if (windows.size > SWEEP_THRESHOLD) sweep(now);

  const key = `${bucket}:${ip}`;
  const w = windows.get(key);
  if (!w || w.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  if (w.count >= opts.limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((w.resetAt - now) / 1000)) };
  }
  w.count += 1;
  return { ok: true, retryAfterSec: 0 };
}

/**
 * Honeypot check: the public forms render a visually-hidden `company` field that humans never see.
 * Real submitters leave it blank; naive bots fill every field. A non-empty value ⇒ treat as a bot.
 */
export function isHoneypotTripped(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) return false;
  const v = (body as Record<string, unknown>).company;
  return typeof v === 'string' && v.trim().length > 0;
}

/** Standard 429 JSON body + Retry-After-friendly shape for the public endpoints. */
export function tooManyRequests(retryAfterSec: number) {
  return {
    body: { error: { code: 'RATE_LIMITED', message: 'Too many requests — please slow down and try again shortly.' } },
    retryAfterSec,
  };
}
