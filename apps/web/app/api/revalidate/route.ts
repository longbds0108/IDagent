import { json } from '@/lib/http'
import { clientKey, rateLimit } from '@/lib/rate-limit'
import { invalidateReads } from '@/lib/reads'

/**
 * Called by the browser after a transaction is confirmed, so the lists it changed show the new data
 * at once instead of after the cache window. Only drops cached reads; never writes anything.
 */
export async function POST(req: Request) {
  if (!rateLimit(`revalidate:${clientKey(req)}`, 30, 30)) return json({ error: 'Too many requests' }, { status: 429 })
  invalidateReads()
  return json({ ok: true })
}
