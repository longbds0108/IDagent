import { describe, expect, it } from 'vitest'
import { decodeFunctionData, keccak256, stringToBytes } from 'viem'
import {
  agentLabelToTokenId,
  bawPreviewCommand,
  bytes32ToKey,
  canonicalJson,
  hashMetadata,
  keyToBytes32,
  normalizeKey,
  parseAgentLabel,
  prepareAction,
  profileMetadataSchema,
  projectMetadataSchema,
  skillAttestationAbi,
} from '../src'

const addrs = {
  profileRegistry: '0x1111111111111111111111111111111111111111',
  projectRegistry: '0x2222222222222222222222222222222222222222',
  attestationRegistry: '0x3333333333333333333333333333333333333333',
  credentialRegistry: '0x4444444444444444444444444444444444444444',
} as const

describe('keys', () => {
  it('normalizes free text', () => {
    expect(normalizeKey('  Solidity ')).toBe('solidity')
    expect(normalizeKey('UI Design')).toBe('ui-design')
    expect(normalizeKey('Next.js')).toBe('next.js')
    expect(normalizeKey('C++')).toBe('c++')
    expect(normalizeKey('Tiếng Việt')).toBe('tieng-viet')
    expect(normalizeKey('!!!')).toBeNull()
    expect(normalizeKey('x'.repeat(33))).toBeNull()
  })
  it('round-trips bytes32 encoding (left-aligned)', () => {
    const b = keyToBytes32('solidity')
    expect(b.startsWith('0x736f6c6964697479')).toBe(true)
    expect(bytes32ToKey(b)).toBe('solidity')
    expect(() => keyToBytes32('Solidity')).toThrow()
  })
})

describe('agent id', () => {
  it('derives token id from label (matches observed mainnet mint)', () => {
    expect(agentLabelToTokenId('yahaya38')).toBe(
      BigInt('0x2f469098eb5ed3fe5d2aecec9e5db259a1f28e3f048e9b5bf2918d276ab3100c'),
    )
    expect(parseAgentLabel('Alice.AI')).toBe('alice')
    expect(parseAgentLabel('bad name')).toBeNull()
  })
})

describe('metadata', () => {
  it('canonicalizes independent of key order', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}')
    expect(hashMetadata({ b: 1, a: 2 }).hash).toBe(hashMetadata({ a: 2, b: 1 }).hash)
    expect(hashMetadata({ a: 1 }).hash).toBe(keccak256(stringToBytes('{"a":1}')))
  })
  it('validates profiles and normalizes skills', () => {
    const p = profileMetadataSchema.parse({
      schema: 'skillproof/profile@1',
      displayName: 'Alice',
      skills: ['Solidity', 'solidity', 'Next.js'],
      links: { github: 'https://github.com/alice', x: '' },
    })
    expect(p.skills).toEqual(['solidity', 'next.js'])
    expect(p.links.x).toBeUndefined()
    expect(() =>
      profileMetadataSchema.parse({ schema: 'skillproof/profile@1', displayName: 'A', bio: 'mail me a@b.co' }),
    ).toThrow()
    expect(() =>
      profileMetadataSchema.parse({ schema: 'skillproof/profile@1', displayName: 'A', avatarUrl: 'http://x.y' }),
    ).toThrow()
  })
  it('validates evidence references', () => {
    const ok = projectMetadataSchema.safeParse({
      schema: 'skillproof/project@1',
      title: 'X',
      evidence: [
        { kind: 'deployment-tx', ref: '0x' + 'a'.repeat(64) },
        { kind: 'contract', ref: '0x' + 'b'.repeat(40) },
        { kind: 'pull-request', ref: 'https://github.com/o/r/pull/1' },
      ],
    })
    expect(ok.success).toBe(true)
    const bad = projectMetadataSchema.safeParse({
      schema: 'skillproof/project@1',
      title: 'X',
      evidence: [{ kind: 'demo', ref: 'javascript:alert(1)' }],
    })
    expect(bad.success).toBe(false)
  })
})

describe('actions', () => {
  it('encodes attest calldata and a baw preview command', () => {
    const call = prepareAction(
      { action: 'attest', profileId: 1n, projectId: 2n, skill: 'solidity', metadataHash: `0x${'0'.repeat(64)}` },
      addrs,
    )
    expect(call.to).toBe(addrs.attestationRegistry)
    const decoded = decodeFunctionData({ abi: skillAttestationAbi, data: call.data })
    expect(decoded.functionName).toBe('attest')
    expect(decoded.args?.[0]).toBe(1n)
    const cmd = bawPreviewCommand('0x5555555555555555555555555555555555555555', call)
    expect(cmd).toContain('--binanceChainId 56')
    expect(cmd).toContain(`--inputData ${call.data}`)
  })
})
