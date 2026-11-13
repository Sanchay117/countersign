/** Small HTTP helpers shared by the route handlers. */
import type { NextRequest } from "next/server";

/** The public origin of this deployment, as the caller reached it. */
export function originOf(request: NextRequest): string {
  const configured = (process.env.PUBLIC_ORIGIN ?? "").trim();
  if (configured) return configured.replace(/\/$/, "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  const proto = request.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export function clientIp(request: NextRequest): string {
  return (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
}

interface Bucket {
  count: number;
  resetAt: number;
}
const buckets = new Map<string, Bucket>();

/**
 * Fixed-window limiter, per process. It protects the demo's SERV credits and
 * test wallet from a runaway loop; it is not a defence against a determined
 * attacker, since serverless instances do not share memory.
 */
export function allow(key: string, limit: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfterSeconds: number } {
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    if (buckets.size > 5000) for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }
  if (b.count >= limit) return { ok: false, retryAfterSeconds: Math.ceil((b.resetAt - now) / 1000) };
  b.count++;
  return { ok: true, retryAfterSeconds: 0 };
}
