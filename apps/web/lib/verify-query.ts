import { isAddress } from 'viem'
import { parseAgentLabel } from '@skillproof/shared'

export type VerifyQuery =
  | { kind: 'tx'; hash: `0x${string}` }
  | { kind: 'address'; address: `0x${string}` }
  | { kind: 'profile'; ref: string }
  | { kind: 'project' | 'attestation' | 'credential'; id: bigint }
  | { kind: 'invalid'; input: string }
  | { kind: 'empty' }

/** Parse whatever a visitor pastes: tx hash, address, profile URL, "credential:5", "alice.ai", "12". */
export function parseVerifyQuery(raw: string | undefined | null): VerifyQuery {
  let s = (raw ?? '').trim()
  if (!s) return { kind: 'empty' }
  // profile / bscscan URLs
  const url = s.match(/^https?:\/\/[^/]+\/(p|tx|address)\/([^/?#]+)/i)
  if (url) {
    if (url[1]!.toLowerCase() === 'p') return { kind: 'profile', ref: decodeURIComponent(url[2]!) }
    s = url[2]!
  }
  if (/^0x[0-9a-fA-F]{64}$/.test(s)) return { kind: 'tx', hash: s.toLowerCase() as `0x${string}` }
  if (isAddress(s)) return { kind: 'address', address: s as `0x${string}` }
  const typed = s.match(/^(profile|project|attestation|credential)\s*[:#]\s*(\d{1,12})$/i)
  if (typed) {
    const k = typed[1]!.toLowerCase()
    if (k === 'profile') return { kind: 'profile', ref: typed[2]! }
    return { kind: k as 'project' | 'attestation' | 'credential', id: BigInt(typed[2]!) }
  }
  if (/^\d{1,12}$/.test(s)) return { kind: 'profile', ref: s }
  if (/\.ai$/i.test(s) && parseAgentLabel(s)) return { kind: 'profile', ref: s }
  return { kind: 'invalid', input: s }
}
