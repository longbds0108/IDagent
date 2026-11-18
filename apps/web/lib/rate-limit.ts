import 'server-only'

/** Best-effort in-memory token bucket per key (per server instance). Anti-spam only. */
const buckets = new Map<string, { tokens: number; at: number }>()
export function rateLimit(key: string, capacity = 20, refillPerMinute = 20): boolean {
  const now = Date.now()
  const b = buckets.get(key) ?? { tokens: capacity, at: now }
  b.tokens = Math.min(capacity, b.tokens + ((now - b.at) / 60_000) * refillPerMinute)
  b.at = now
  if (b.tokens < 1) {
    buckets.set(key, b)
    return false
  }
  b.tokens -= 1
  buckets.set(key, b)
  if (buckets.size > 10_000) buckets.clear()
  return true
}

export function clientKey(req: Request) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local'
}
