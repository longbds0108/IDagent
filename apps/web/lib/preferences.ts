import type { Address, Hex } from 'viem'
import { BSC_CHAIN_ID } from '@skillproof/shared'

/**
 * Off-chain, owner-signed presentation preferences (EIP-712). They change only how attested
 * presents an account: they never alter on-chain records, which stay public in the Verification
 * Center and Activity feed. Agentic Wallets sign EIP-712 via `baw sign-message`; browser wallets
 * via eth_signTypedData_v4.
 */
export interface Preferences {
  account: Address
  reputationOptIn: boolean
  hideFromExplore: boolean
  hideSocialLinks: boolean
  hideAvatar: boolean
  /** Attestation ids the subject acknowledges ("accepted"). */
  acceptedAttestations: string[]
  /** Attestation ids the subject declines; hidden from their profile summary, never deleted. */
  declinedAttestations: string[]
  issuedAt: number
}

export interface SignedPreferences extends Preferences {
  signature: Hex
}

export const DEFAULT_PREFERENCES = (account: Address): Preferences => ({
  account,
  reputationOptIn: false,
  hideFromExplore: false,
  hideSocialLinks: false,
  hideAvatar: false,
  acceptedAttestations: [],
  declinedAttestations: [],
  issuedAt: 0,
})

export const PREFERENCE_TYPES = {
  Preferences: [
    { name: 'account', type: 'address' },
    { name: 'reputationOptIn', type: 'bool' },
    { name: 'hideFromExplore', type: 'bool' },
    { name: 'hideSocialLinks', type: 'bool' },
    { name: 'hideAvatar', type: 'bool' },
    { name: 'acceptedAttestations', type: 'uint256[]' },
    { name: 'declinedAttestations', type: 'uint256[]' },
    { name: 'issuedAt', type: 'uint64' },
  ],
} as const

export function preferenceDomain(verifyingContract: Address) {
  return { name: 'attested Preferences', version: '1', chainId: BSC_CHAIN_ID, verifyingContract } as const
}

export function preferenceMessage(p: Preferences) {
  return {
    account: p.account,
    reputationOptIn: p.reputationOptIn,
    hideFromExplore: p.hideFromExplore,
    hideSocialLinks: p.hideSocialLinks,
    hideAvatar: p.hideAvatar,
    acceptedAttestations: p.acceptedAttestations.map((x) => BigInt(x)),
    declinedAttestations: p.declinedAttestations.map((x) => BigInt(x)),
    issuedAt: BigInt(p.issuedAt),
  }
}

/** Full eth_signTypedData_v4 JSON-RPC request, as `baw sign-message --signType EIP712 --message` expects. */
export function signTypedDataRequest(p: Preferences, verifyingContract: Address) {
  const typedData = {
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      ...PREFERENCE_TYPES,
    },
    primaryType: 'Preferences',
    domain: preferenceDomain(verifyingContract),
    message: {
      ...p,
      issuedAt: String(p.issuedAt),
    },
  }
  return { method: 'eth_signTypedData_v4', params: [p.account, JSON.stringify(typedData)] }
}

export function bawSignCommand(p: Preferences, verifyingContract: Address) {
  const msg = JSON.stringify(signTypedDataRequest(p, verifyingContract)).replace(/'/g, "'\\''")
  return `baw sign-message preview --binanceChainId ${BSC_CHAIN_ID} --signType EIP712 --message '${msg}' --json`
}

/**
 * `baw sign-message execute` returns `signature` and `signatureRecovery` (e.g. "01") as separate
 * fields. Accept either a full 65-byte signature, or a 64-byte r‖s plus the recovery id, and
 * return a standard 65-byte signature (v = 27 + recovery). Returns null when malformed.
 */
export function normalizeSignature(signature: string, recovery?: string | null): `0x${string}` | null {
  const s = signature.trim().toLowerCase()
  const hex = s.startsWith('0x') ? s : `0x${s}`
  if (!/^0x[0-9a-f]+$/.test(hex)) return null
  if (hex.length === 132) return hex as `0x${string}`
  if (hex.length === 130) {
    const r = recovery?.trim() ? parseInt(recovery.trim().replace(/^0x/, ''), 16) : NaN
    if (Number.isNaN(r) || r < 0 || r > 28) return null
    const v = r < 27 ? r + 27 : r
    return `${hex}${v.toString(16).padStart(2, '0')}` as `0x${string}`
  }
  return null
}
