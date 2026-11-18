import { json, errorResponse } from '@/lib/http'
import { PreferenceError, savePreferences } from '@/lib/preferences-server'
import { clientKey, rateLimit } from '@/lib/rate-limit'
import { invalidateReads } from '@/lib/reads'

/** Store owner-signed (EIP-712) presentation preferences. Never touches the chain. */
export async function POST(req: Request) {
  if (!rateLimit(`prefs:${clientKey(req)}`, 20, 20)) return json({ error: 'Too many requests' }, { status: 429 })
  try {
    const saved = await savePreferences(await req.json().catch(() => null))
    invalidateReads()
    return json({ ok: true, preferences: saved })
  } catch (e) {
    if (e instanceof PreferenceError) return json({ error: e.message }, { status: 400 })
    return errorResponse(e)
  }
}
