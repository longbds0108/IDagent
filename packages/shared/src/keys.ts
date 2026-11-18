import { hexToString, stringToHex, type Hex } from 'viem'

/** Characters accepted on-chain by `Keys.isValidKey` (see packages/contracts/src/lib/Keys.sol). */
const ALLOWED = /^[a-z0-9\-.+#]+$/

/**
 * Normalize free text into a skill / credential-type key:
 * lowercase, trim, whitespace and underscores -> "-", strip anything else not allowed,
 * collapse repeated dashes. Returns null when the result is empty or longer than 32 bytes.
 */
export function normalizeKey(input: string): string | null {
  const s = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9\-.+#]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  if (!s || s.length > 32 || !ALLOWED.test(s)) return null
  return s
}

export function isValidKeyString(s: string): boolean {
  return s.length > 0 && s.length <= 32 && ALLOWED.test(s)
}

/** Left-aligned bytes32 encoding used on-chain. Throws on invalid input. */
export function keyToBytes32(key: string): Hex {
  if (!isValidKeyString(key)) throw new Error(`Invalid key "${key}"`)
  return stringToHex(key, { size: 32 })
}

export function bytes32ToKey(value: Hex): string {
  return hexToString(value, { size: 32 }).replace(/\0+$/, '')
}
