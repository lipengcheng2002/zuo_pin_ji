import type { NextRequest } from "next/server";

export const NO_STORE = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
} as const;

export function jsonError(message: string, status = 400): Response {
  return Response.json({ error: message }, { status, headers: NO_STORE });
}

export function rateLimited(retryAfter: number, message = "操作过于频繁，请稍后再试"): Response {
  return Response.json(
    { error: message, retryAfter },
    {
      status: 429,
      headers: { ...NO_STORE, "Retry-After": String(Math.max(1, retryAfter)) },
    },
  );
}

export function assertSameOrigin(request: NextRequest): Response | null {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return jsonError("跨站请求被拒绝", 403);
  }
  const origin = request.headers.get("origin");
  if (!origin) return null;
  try {
    const parsed = new URL(origin);
    const host = request.headers.get("host");
    if (parsed.host !== host) {
      return jsonError("跨站请求被拒绝", 403);
    }
    return null;
  } catch {
    return jsonError("非法请求来源", 403);
  }
}

export function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const raw =
    forwarded?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "local";
  return raw.replace(/^::ffff:/i, "");
}

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; remaining: number; retryAfter: number } {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfter: 0 };
  }
  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.ceil((existing.resetAt - now) / 1000),
    };
  }
  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count, retryAfter: 0 };
}

export function zodMessage(error: { issues: Array<{ path: (string | number)[]; message: string }> }) {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "参数"}: ${issue.message}`)
    .join("；");
}
