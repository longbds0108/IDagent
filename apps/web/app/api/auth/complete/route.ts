import { z } from 'zod'
import { json, errorResponse } from '@/lib/http'
import { verifyLogin, type LoginMessage } from '@/lib/login'
import { loginStore } from '@/lib/login-store'
import { clientKey, rateLimit } from '@/lib/rate-limit'
import { contracts } from '@/lib/reads'
import { readToken } from '@/lib/session'

const Body = z.object({ challenge: z.string().min(10).max(2000), signature: z.string().min(40).max(400) })

/**
 * The agent sends back the signed login. This only records the signature. The session is opened for
 * the browser that holds the secret, when it asks /api/auth/status.
 */
export async function POST(req: Request) {
  if (!rateLimit(`complete:${clientKey(req)}`, 20, 20)) return json({ error: 'Too many attempts. Wait a minute.' }, { status: 429 })
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return json({ error: 'Send the challenge and the signature from the prompt.' }, { status: 400 })
    const payload = readToken<LoginMessage & { kind: string; pid?: string | null }>(parsed.data.challenge)
    const now = Math.floor(Date.now() / 1000)
    if (!payload || payload.kind !== 'login-challenge' || !payload.pid || payload.expiresAt < now) {
      return json({ error: 'This login prompt expired. Start again.' }, { status: 400 })
    }
    const row = await loginStore().get(payload.pid)
    if (!row || row.approved || row.expiresAt < now) {
      return json({ error: 'This login prompt was already used or expired. Start again.' }, { status: 409 })
    }
    const message: LoginMessage = { address: payload.address, nonce: payload.nonce, issuedAt: payload.issuedAt, expiresAt: payload.expiresAt }
    if (!(await verifyLogin(message, contracts().profileRegistry, parsed.data.signature))) {
      return json({ error: 'The signature does not match this wallet. Copy the prompt again and sign it.' }, { status: 400 })
    }
    await loginStore().approve(payload.pid)
    return json({ ok: true, message: 'Signed. Your attested tab signs you in within a few seconds.' })
  } catch (e) {
    return errorResponse(e)
  }
}
