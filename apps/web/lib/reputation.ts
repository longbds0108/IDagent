/**
 * SkillProof reputation, formula v1. Public, deterministic, and recomputable by anyone from
 * chain state. Three components are reported SEPARATELY and are never summed into one score:
 *
 *  Evidence (self-reported)  per active project with hash-verified metadata: 10 pts
 *                            + 2 pts per evidence reference (max 5 refs). Max 5 projects. Cap 100.
 *  Peer (attested)           grouped by signer; signer weight = 1 + 0.25 × (extra skills, max 2)
 *                            × 0.5 if the pair attest each other (reciprocal)
 *                            × 0.8 if the signer has no SkillProof profile (less accountable)
 *                            20 pts × weight. Declined attestations excluded. Cap 100.
 *  Issuer (credentials)      first valid credential per approved issuer 40 pts, each further
 *                            one from the same issuer 10 pts. Cap 100.
 *
 * A score measures recorded signals, not the truth of any claim. Dampening reciprocal pairs
 * does not prove or disprove collusion.
 */
export const FORMULA_VERSION = 'v1'

export interface RepProject {
  id: string
  title: string
  active: boolean
  verified: boolean
  evidenceCount: number
  createdAt: number
  closedAt: number
  createdBlock?: number
  closedBlock?: number
}
export interface RepAttestation {
  id: string
  issuer: string
  issuerLabel: string | null
  issuerHasProfile: boolean
  skill: string
  revoked: boolean
  declined: boolean
  reciprocal: boolean
  issuedAt: number
  revokedAt: number
  issuedBlock?: number
  revokedBlock?: number
}
export interface RepCredential {
  id: string
  title: string
  issuer: string
  issuerName: string
  valid: boolean
  issuedAt: number
  /** time it stopped counting (revoked/expired), 0 if still valid or unknown */
  endedAt: number
  issuedBlock?: number
  endedBlock?: number
}

export interface Contribution {
  label: string
  detail: string
  points: number
  ref: string
}
export interface Component {
  score: number
  raw: number
  items: Contribution[]
}
export interface Reputation {
  formula: typeof FORMULA_VERSION
  evidence: Component
  peer: Component
  issuer: Component
}

const cap = (n: number) => Math.min(100, Math.round(n * 10) / 10)

export function computeReputation(input: { projects: RepProject[]; attestations: RepAttestation[]; credentials: RepCredential[] }): Reputation {
  // Evidence
  const counted = input.projects.filter((p) => p.active && p.verified).slice(0, 5)
  const evItems = counted.map((p) => {
    const refs = Math.min(5, p.evidenceCount)
    return { label: p.title, detail: `10 base + ${refs} evidence ref${refs === 1 ? '' : 's'} × 2`, points: 10 + refs * 2, ref: `project:${p.id}` }
  })
  const evRaw = evItems.reduce((s, i) => s + i.points, 0)

  // Peer
  const bySigner = new Map<string, RepAttestation[]>()
  for (const a of input.attestations) {
    if (a.revoked || a.declined) continue
    const k = a.issuer.toLowerCase()
    bySigner.set(k, [...(bySigner.get(k) ?? []), a])
  }
  const peerItems: Contribution[] = []
  for (const list of bySigner.values()) {
    const first = list[0]!
    let w = 1 + 0.25 * Math.min(2, list.length - 1)
    const notes = [`${list.length} skill${list.length === 1 ? '' : 's'} (${list.map((a) => a.skill).join(', ')})`]
    if (list.some((a) => a.reciprocal)) {
      w *= 0.5
      notes.push('reciprocal pair ×0.5')
    }
    if (!first.issuerHasProfile) {
      w *= 0.8
      notes.push('signer has no profile ×0.8')
    }
    peerItems.push({
      label: first.issuerLabel ? `${first.issuerLabel}.ai` : `${first.issuer.slice(0, 6)}…${first.issuer.slice(-4)}`,
      detail: notes.join(' · '),
      points: Math.round(20 * w * 10) / 10,
      ref: `attestation:${first.id}`,
    })
  }
  const peerRaw = peerItems.reduce((s, i) => s + i.points, 0)

  // Issuer
  const seen = new Map<string, number>()
  const issItems: Contribution[] = []
  for (const c of input.credentials) {
    if (!c.valid) continue
    const k = c.issuer.toLowerCase()
    const n = seen.get(k) ?? 0
    seen.set(k, n + 1)
    issItems.push({ label: c.title, detail: `${c.issuerName}${n ? ' · additional from same issuer' : ''}`, points: n ? 10 : 40, ref: `credential:${c.id}` })
  }
  const issRaw = issItems.reduce((s, i) => s + i.points, 0)

  return {
    formula: FORMULA_VERSION,
    evidence: { score: cap(evRaw), raw: evRaw, items: evItems },
    peer: { score: cap(peerRaw), raw: peerRaw, items: peerItems },
    issuer: { score: cap(issRaw), raw: issRaw, items: issItems },
  }
}

export interface HistoryPoint {
  t: number
  evidence: number
  peer: number
  issuer: number
  event: string
}

/**
 * Replays the formula after every recorded change, in event order (timestamp, then block), so
 * a record created and revoked in the same second still shows both steps. Auditable timeline.
 */
export function reputationHistory(input: { projects: RepProject[]; attestations: RepAttestation[]; credentials: RepCredential[] }): HistoryPoint[] {
  type Ev = { t: number; b: number; key: string; end: boolean; label: string }
  const ev: Ev[] = []
  for (const p of input.projects) {
    ev.push({ t: p.createdAt, b: p.createdBlock ?? 0, key: `p${p.id}`, end: false, label: `Project: ${p.title}` })
    if (p.closedAt) ev.push({ t: p.closedAt, b: p.closedBlock ?? 0, key: `p${p.id}`, end: true, label: `Project closed: ${p.title}` })
  }
  for (const a of input.attestations) {
    ev.push({ t: a.issuedAt, b: a.issuedBlock ?? 0, key: `a${a.id}`, end: false, label: `Attestation: ${a.skill}` })
    if (a.revokedAt) ev.push({ t: a.revokedAt, b: a.revokedBlock ?? 0, key: `a${a.id}`, end: true, label: `Attestation revoked: ${a.skill}` })
  }
  for (const c of input.credentials) {
    ev.push({ t: c.issuedAt, b: c.issuedBlock ?? 0, key: `c${c.id}`, end: false, label: `Credential: ${c.title}` })
    if (c.endedAt) ev.push({ t: c.endedAt, b: c.endedBlock ?? 0, key: `c${c.id}`, end: true, label: `Credential ended: ${c.title}` })
  }
  ev.sort((x, y) => x.t - y.t || x.b - y.b || Number(x.end) - Number(y.end))
  const started = new Set<string>()
  const ended = new Set<string>()
  return ev.map((e) => {
    ;(e.end ? ended : started).add(e.key)
    const live = (k: string) => started.has(k) && !ended.has(k)
    const r = computeReputation({
      projects: input.projects.filter((p) => started.has(`p${p.id}`)).map((p) => ({ ...p, active: live(`p${p.id}`) })),
      attestations: input.attestations.filter((a) => started.has(`a${a.id}`)).map((a) => ({ ...a, revoked: !live(`a${a.id}`) })),
      credentials: input.credentials
        .filter((c) => started.has(`c${c.id}`))
        .map((c) => ({ ...c, valid: c.endedAt ? live(`c${c.id}`) : c.valid })),
    })
    return { t: e.t, evidence: r.evidence.score, peer: r.peer.score, issuer: r.issuer.score, event: e.label }
  })
}
