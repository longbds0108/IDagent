import { randomBytes } from 'node:crypto'
import { getAddress, isAddress } from 'viem'
import { json, errorResponse } from '@/lib/http'
import { bawLoginCommand, loginPrompt, LOGIN_TTL_S, type LoginMessage } from '@/lib/login'
import { loginStore } from '@/lib/login-store'
import { clientKey, rateLimit } from '@/lib/rate-limit'
import { isAgentIdHolder, contracts } from '@/lib/reads'
import { newNonce, signToken } from '@/lib/session'

/**
 * Step 1 of sign-in: check the Agent ID, then return a login prompt for the Agentic Wallet to sign.
 * The browser may send the SHA-256 of a secret it keeps. Then the agent can finish sign-in by itself
 * (see /api/auth/complete) and the page picks up the session (see /api/auth/status).
 */
export async function POST(req: Request) {
  if (!rateLimit(`login:${clientKey(req)}`, 10, 10)) return json({ error: 'Too many attempts. Wait a minute.' }, { status: 429 })
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body.address !== 'string' || !isAddress(body.address)) return json({ error: 'Enter a valid 0x address.' }, { status: 400 })
    const address = getAddress(body.address)
    if (!(await isAgentIdHolder(address))) {
      return json({ error: 'This wallet has no Agent ID. Claim one in the Binance App first.' }, { status: 403 })
    }
    const now = Math.floor(Date.now() / 1000)
    const message: LoginMessage = { address, nonce: newNonce(), issuedAt: now, expiresAt: now + LOGIN_TTL_S }
    const command = bawLoginCommand(message, contracts().profileRegistry)
    const secretHash = typeof body.secretHash === 'string' && /^[0-9a-f]{64}$/.test(body.secretHash) ? body.secretHash : null
    const pid = secretHash ? randomBytes(16).toString('hex') : null
    if (pid && secretHash) await loginStore().put({ pid, secretHash, address, expiresAt: message.expiresAt, approved: false })
    const challenge = signToken({ kind: 'login-challenge', ...message, pid })
    const origin = new URL(req.url).origin
    const prompt = loginPrompt(command, pid ? { url: `${origin}/api/auth/complete`, challenge } : undefined)
    return json({ challenge, prompt, command, expiresAt: message.expiresAt, pid })
  } catch (e) {
    return errorResponse(e)
  }
}
