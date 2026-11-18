import { describe, expect, it } from 'vitest'
import { computeReputation, reputationHistory, type RepAttestation } from './reputation'

const att = (o: Partial<RepAttestation>): RepAttestation => ({
  id: '1', issuer: '0xaaa', issuerLabel: 'bob', issuerHasProfile: true, skill: 'solidity',
  revoked: false, declined: false, reciprocal: false, issuedAt: 10, revokedAt: 0, ...o,
})

describe('reputation v1', () => {
  it('scores evidence from verified active projects only', () => {
    const r = computeReputation({
      projects: [
        { id: '1', title: 'A', active: true, verified: true, evidenceCount: 7, createdAt: 1, closedAt: 0 },
        { id: '2', title: 'B', active: false, verified: true, evidenceCount: 3, createdAt: 1, closedAt: 2 },
        { id: '3', title: 'C', active: true, verified: false, evidenceCount: 3, createdAt: 1, closedAt: 0 },
      ],
      attestations: [],
      credentials: [],
    })
    expect(r.evidence.score).toBe(20) // 10 + min(5,7)*2
  })

  it('groups peers by signer, diminishes repeats, dampens reciprocal and profileless signers', () => {
    const r = computeReputation({
      projects: [],
      attestations: [
        att({ id: '1', issuer: '0xaaa', skill: 'solidity' }),
        att({ id: '2', issuer: '0xaaa', skill: 'rust' }),
        att({ id: '3', issuer: '0xaaa', skill: 'go' }),
        att({ id: '4', issuer: '0xaaa', skill: 'ts' }), // capped at +2 extra
        att({ id: '5', issuer: '0xbbb', reciprocal: true }),
        att({ id: '6', issuer: '0xccc', issuerHasProfile: false }),
        att({ id: '7', issuer: '0xddd', revoked: true }),
        att({ id: '8', issuer: '0xeee', declined: true }),
      ],
      credentials: [],
    })
    expect(r.peer.items.map((i) => i.points)).toEqual([30, 10, 16])
    expect(r.peer.score).toBe(56)
  })

  it('counts issuer credentials per issuer with diminishing extras', () => {
    const c = (id: string, issuer: string, valid = true) => ({ id, title: id, issuer, issuerName: issuer, valid, issuedAt: 1, endedAt: 0 })
    const r = computeReputation({ projects: [], attestations: [], credentials: [c('1', '0x1'), c('2', '0x1'), c('3', '0x2'), c('4', '0x3', false)] })
    expect(r.issuer.score).toBe(90)
  })

  it('replays history including revocations', () => {
    const h = reputationHistory({ projects: [], attestations: [att({ issuedAt: 5, revokedAt: 9, revoked: true })], credentials: [] })
    expect(h.map((p) => p.peer)).toEqual([20, 0])
  })

  it('orders same-second events by block', () => {
    const h = reputationHistory({
      projects: [],
      attestations: [att({ issuedAt: 5, issuedBlock: 10, revokedAt: 5, revokedBlock: 12, revoked: true })],
      credentials: [],
    })
    expect(h.map((p) => p.peer)).toEqual([20, 0])
  })
})
