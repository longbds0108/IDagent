import { keccak256, stringToBytes } from 'viem'

/**
 * Agent IDs are "<label>.ai" names. On the official contract the ERC-721 token id equals
 * uint256(keccak256(bytes(label))) — verified for 311/311 mints observed on chain 56 on
 * 2026-11-18. SkillProof re-checks ownership on-chain (`ownerOf`) rather than trusting this
 * client-side, so a wrong assumption fails closed.
 */
export function parseAgentLabel(input: string): string | null {
  const s = input.trim().toLowerCase().replace(/\.ai$/, '')
  if (!s || s.length > 64 || /[\s/]/.test(s)) return null
  return s
}

export function agentLabelToTokenId(label: string): bigint {
  return BigInt(keccak256(stringToBytes(label)))
}

export function formatAgentName(label: string | null | undefined): string | null {
  return label ? `${label}.ai` : null
}
