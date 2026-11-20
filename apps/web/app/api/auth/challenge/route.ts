import { getAddress, isAddress } from 'viem'
import { json, errorResponse } from '@/lib/http'
import { bawLoginCommand, loginPrompt, LOGIN_TTL_S, type LoginMessage } from '@/lib/login'
import { clientKey, rateLimit } from '@/lib/rate-limit'
import { isAgentIdHolder, contracts } from '@/lib/reads'
import { newNonce, signToken } from '@/lib/session'

/** Step 1 of sign-in: check the Agent ID, then return a login prompt for the Agentic Wallet to sign. */
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
    const challenge = signToken({ kind: 'login-challenge', ...message })
    return json({ challenge, prompt: loginPrompt(command), command, expiresAt: message.expiresAt })
  } catch (e) {
    return errorResponse(e)
  }
}
