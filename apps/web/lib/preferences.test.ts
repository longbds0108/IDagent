import { describe, expect, it } from 'vitest'
import { normalizeSignature } from './preferences'

const rs = '0x' + 'ab'.repeat(64)
describe('normalizeSignature (baw returns signature + signatureRecovery separately)', () => {
  it('passes a full 65-byte signature through', () => {
    expect(normalizeSignature(rs + '1b')).toBe(rs + '1b')
  })
  it('appends v = 27 + recovery to a 64-byte signature', () => {
    expect(normalizeSignature(rs, '01')).toBe(rs + '1c')
    expect(normalizeSignature(rs, '00')).toBe(rs + '1b')
    expect(normalizeSignature(rs.slice(2), '1')).toBe(rs + '1c')
  })
  it('rejects malformed input', () => {
    expect(normalizeSignature(rs)).toBeNull()
    expect(normalizeSignature('0xzz')).toBeNull()
    expect(normalizeSignature('0x1234', '01')).toBeNull()
  })
})
