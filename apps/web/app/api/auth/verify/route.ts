import { cookies } from 'next/headers'
import { z } from 'zod'
import { json, errorResponse } from '@/lib/http'
import { verifyLogin, type LoginMessage } from '@/lib/login'
import { clientKey, rateLimit } from '@/lib/rate-limit'
import { contracts, isAgentIdHolder } from '@/lib/reads'
import { readToken, SESSION_COOKIE, SESSION_TTL_S, signToken } from '@/lib/session'

const Body = z.object({ challenge: z.string().min(10).max(2000), signature: z.string().min(40).max(400) })

/** Step 2 of sign-in: check the signed login message and start a session. */
export async function POST(req: Request) {
  if (!rateLimit(`verify:${clientKey(req)}`, 20, 20)) return json({ error: 'Too many attempts. Wait a minute.' }, { status: 429 })
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return json({ error: 'Start sign-in again.' }, { status: 400 })
    const payload = readToken<LoginMessage & { kind: string }>(parsed.data.challenge)
    const now = Math.floor(Date.now() / 1000)
    if (!payload || payload.kind !== 'login-challenge' || payload.expiresAt < now) {
      return json({ error: 'This login prompt expired. Start again.' }, { status: 400 })
    }
    const message: LoginMessage = { address: payload.address, nonce: payload.nonce, issuedAt: payload.issuedAt, expiresAt: payload.expiresAt }
    if (!(await verifyLogin(message, contracts().profileRegistry, parsed.data.signature))) {
      return json({ error: 'The signature does not match this wallet. Copy the prompt again and sign it.' }, { status: 400 })
    }
    if (!(await isAgentIdHolder(message.address))) {
      return json({ error: 'This wallet has no Agent ID. Claim one in the Binance App first.' }, { status: 403 })
    }
    const token = signToken({ kind: 'session', address: message.address, exp: now + SESSION_TTL_S })
    ;(await cookies()).set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_TTL_S,
    })
    return json({ address: message.address, expiresAt: now + SESSION_TTL_S })
  } catch (e) {
    return errorResponse(e)
  }
}
