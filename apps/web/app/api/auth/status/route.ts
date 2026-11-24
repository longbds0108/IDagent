import { cookies } from 'next/headers'
import { z } from 'zod'
import { json, errorResponse } from '@/lib/http'
import { loginSecretHash } from '@/lib/login'
import { loginStore } from '@/lib/login-store'
import { clientKey, rateLimit } from '@/lib/rate-limit'
import { isAgentIdHolder } from '@/lib/reads'
import { signToken, SESSION_COOKIE, SESSION_TTL_S } from '@/lib/session'

const Body = z.object({ secret: z.string().regex(/^[0-9a-f]{64}$/) })

/**
 * The page asks whether its login was signed. The page knows only its own secret, so the login is found by
 * the hash of that secret. Only this browser can open the session. The check is one-time.
 *   waiting  the agent has not requested a login yet
 *   pending  requested, not signed yet
 *   expired  the login ran out of time
 *   signed-in  the session cookie is set
 */
export async function POST(req: Request) {
  if (!rateLimit(`status:${clientKey(req)}`, 120, 120)) return json({ status: 'pending' })
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return json({ error: 'Start sign-in again.' }, { status: 400 })
    const pid = await loginSecretHash(parsed.data.secret)
    const row = await loginStore().get(pid)
    if (!row) return json({ status: 'waiting' })
    const now = Math.floor(Date.now() / 1000)
    if (row.expiresAt < now) {
      await loginStore().remove(pid)
      return json({ status: 'expired' })
    }
    if (!row.approved) return json({ status: 'pending' })
    if (!(await isAgentIdHolder(row.address))) {
      await loginStore().remove(pid)
      return json({ error: 'This wallet has no Agent ID. Claim one in the Binance App first.' }, { status: 403 })
    }
    await loginStore().remove(pid)
    const token = signToken({ kind: 'session', address: row.address, exp: now + SESSION_TTL_S })
    ;(await cookies()).set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_TTL_S,
    })
    return json({ status: 'signed-in', address: row.address, expiresAt: now + SESSION_TTL_S })
  } catch (e) {
    return errorResponse(e)
  }
}
