import { cookies } from 'next/headers'
import { json } from '@/lib/http'
import { readToken, SESSION_COOKIE } from '@/lib/session'

/** The signed-in wallet, or null. Never throws: a missing secret simply means "not signed in". */
export async function GET() {
  try {
    const raw = (await cookies()).get(SESSION_COOKIE)?.value
    const p = raw ? readToken<{ kind: string; address: `0x${string}`; exp: number }>(raw) : null
    if (!p || p.kind !== 'session' || p.exp < Math.floor(Date.now() / 1000)) return json({ address: null })
    return json({ address: p.address, expiresAt: p.exp })
  } catch {
    return json({ address: null })
  }
}
