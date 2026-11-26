import { verifyTypedData, type Address, type Hex } from 'viem'
import { BSC_CHAIN_ID } from '@skillproof/shared'

/**
 * Sign-in by signature: the app issues a short-lived login message, the user's Agentic Wallet signs
 * it with `baw sign-message` (EIP-712 only), and the server checks the signature. No keys, no
 * passwords. Shared by the browser (builds the command) and the server (verifies the signature).
 */
export const LOGIN_TYPES = {
  Login: [
    { name: 'address', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'issuedAt', type: 'uint64' },
    { name: 'expiresAt', type: 'uint64' },
  ],
} as const

export const LOGIN_TTL_S = 5 * 60

export interface LoginMessage {
  address: Address
  nonce: string
  issuedAt: number
  expiresAt: number
}

export function loginDomain(verifyingContract: Address) {
  return { name: 'attested Login', version: '1', chainId: BSC_CHAIN_ID, verifyingContract } as const
}

/** The EIP-712 data the wallet signs. Exported so a browser wallet can sign it directly. */
export function loginTypedData(m: LoginMessage, verifyingContract: Address) {
  return {
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      ...LOGIN_TYPES,
    },
    primaryType: 'Login',
    domain: loginDomain(verifyingContract),
    message: { address: m.address, nonce: m.nonce, issuedAt: String(m.issuedAt), expiresAt: String(m.expiresAt) },
  }
}

/** The `baw` command the agent runs. Single quotes are escaped for the shell. */
export function bawLoginCommand(m: LoginMessage, verifyingContract: Address): string {
  const req = { method: 'eth_signTypedData_v4', params: [m.address, JSON.stringify(loginTypedData(m, verifyingContract))] }
  const msg = JSON.stringify(req).replace(/'/g, "'\\''")
  return `baw sign-message preview --binanceChainId ${BSC_CHAIN_ID} --signType EIP712 --message '${msg}' --json`
}

/** SHA-256 (hex) of the browser's secret. The server stores only this hash. */
export async function loginSecretHash(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * The prompt shown on the sign-in page. It carries every step inline: an agent that cannot open links
 * can still sign in. The agent finds its own address, asks for the login message, runs the real baw steps
 * (preview, execute, result), and sends the signature back. `secretHash` is the hash of a secret only this
 * browser keeps.
 */
export function agentLoginPrompt(origin: string, secretHash: string): string {
  return [
    'Sign me in to attested with my Agentic Wallet. Do these steps in order:',
    '1. Run `baw wallet address --json` and take the BSC (56) address.',
    `2. POST ${origin}/api/auth/challenge with JSON {"address":"<address>","secretHash":"${secretHash}"}. Keep "challenge" and "command" from the reply.`,
    '3. Run that "command" with baw. It prints a requestId.',
    '4. Run `baw sign-message execute --requestId <requestId> --json` and approve in the Binance App.',
    '5. Run `baw sign-message result --requestId <requestId> --json` and take "signature".',
    `6. POST ${origin}/api/auth/complete with JSON {"challenge":"<challenge>","signature":"<signature>"}.`,
    'Never ask me for keys or seed phrases. If Developer Mode is off, tell me to enable it in the Binance App (Agentic Wallet > Settings) and stop. Reply with the result of step 6.',
  ].join('\n')
}

/**
 * The 65-byte forms a returned signature can take. Agents often send only r‖s (64 bytes) and no
 * recovery id, so the server tries both v values, plus the EIP-2098 compact form. The user pastes
 * just the signature; no second field is needed.
 */
export function signatureCandidates(signature: string): Hex[] {
  const s = signature.trim().toLowerCase()
  const hex = s.startsWith('0x') ? s : `0x${s}`
  if (!/^0x[0-9a-f]+$/.test(hex)) return []
  if (hex.length === 132) return [hex as Hex]
  if (hex.length !== 130) return []
  const body = hex.slice(2)
  const r = body.slice(0, 64)
  const yParityAndS = BigInt(`0x${body.slice(64)}`)
  const yParity = Number(yParityAndS >> 255n)
  const sWithoutParity = (yParityAndS & ((1n << 255n) - 1n)).toString(16).padStart(64, '0')
  return [`0x${body}1b`, `0x${body}1c`, `0x${r}${sWithoutParity}${(27 + yParity).toString(16)}`] as Hex[]
}

/** Pure check used by the server: does `signature` prove `m` was signed by `m.address`? */
export async function verifyLogin(m: LoginMessage, verifyingContract: Address, signature: string): Promise<boolean> {
  for (const sig of signatureCandidates(signature)) {
    try {
      const ok = await verifyTypedData({
        address: m.address,
        domain: loginDomain(verifyingContract),
        types: LOGIN_TYPES,
        primaryType: 'Login',
        message: { address: m.address, nonce: BigInt(m.nonce), issuedAt: BigInt(m.issuedAt), expiresAt: BigInt(m.expiresAt) },
        signature: sig,
      })
      if (ok) return true
    } catch {
      // A malformed candidate is a failed check for that form, not a server error.
    }
  }
  return false
}
