import { describe, expect, it } from 'vitest'
import { parseVerifyQuery } from './verify-query'

describe('parseVerifyQuery', () => {
  it('parses all supported inputs', () => {
    expect(parseVerifyQuery('')).toEqual({ kind: 'empty' })
    expect(parseVerifyQuery('0x' + 'A'.repeat(64))).toEqual({ kind: 'tx', hash: '0x' + 'a'.repeat(64) })
    expect(parseVerifyQuery('https://bscscan.com/tx/0x' + 'b'.repeat(64))).toEqual({ kind: 'tx', hash: '0x' + 'b'.repeat(64) })
    expect(parseVerifyQuery('0x' + '1'.repeat(40)).kind).toBe('address')
    expect(parseVerifyQuery('credential:5')).toEqual({ kind: 'credential', id: 5n })
    expect(parseVerifyQuery('Attestation #12')).toEqual({ kind: 'attestation', id: 12n })
    expect(parseVerifyQuery('7')).toEqual({ kind: 'profile', ref: '7' })
    expect(parseVerifyQuery('alice.ai')).toEqual({ kind: 'profile', ref: 'alice.ai' })
    expect(parseVerifyQuery('https://skillproof.example/p/alice.ai')).toEqual({ kind: 'profile', ref: 'alice.ai' })
    expect(parseVerifyQuery('hello world').kind).toBe('invalid')
  })
})
