import { verifyTypedData, type Address, type Hex } from 'viem'
import { BSC_CHAIN_ID } from '@skillproof/shared'
import { normalizeSignature } from './preferences'

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

function typedData(m: LoginMessage, verifyingContract: Address) {
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
  const req = { method: 'eth_signTypedData_v4', params: [m.address, JSON.stringify(typedData(m, verifyingContract))] }
  const msg = JSON.stringify(req).replace(/'/g, "'\\''")
  return `baw sign-message preview --binanceChainId ${BSC_CHAIN_ID} --signType EIP712 --message '${msg}' --json`
}

/** The prompt the user copies to their AI agent. */
export function loginPrompt(command: string): string {
  return [
    'Please run this command with the Agentic Wallet CLI (baw) and approve in the Binance App if asked.',
    'Then send me back only the "signature" value from the result, and "signatureRecovery" if it is shown.',
    '',
    command,
  ].join('\n')
}

/** Pure check used by the server: does `signature` prove `m` was signed by `m.address`? */
export async function verifyLogin(m: LoginMessage, verifyingContract: Address, signature: string): Promise<boolean> {
  const sig = normalizeSignature(signature)
  if (!sig) return false
  try {
    return await verifyTypedData({
      address: m.address,
      domain: loginDomain(verifyingContract),
      types: LOGIN_TYPES,
      primaryType: 'Login',
      message: { address: m.address, nonce: BigInt(m.nonce), issuedAt: BigInt(m.issuedAt), expiresAt: BigInt(m.expiresAt) },
      signature: sig as Hex,
    })
  } catch {
    // A malformed signature is a failed check, not a server error.
    return false
  }
}
