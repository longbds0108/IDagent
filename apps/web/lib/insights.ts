import 'server-only'
import type { Address } from 'viem'
import { allPreferences, getPreferences } from './preferences-server'
import { computeReputation, reputationHistory, type RepAttestation, type RepCredential, type RepProject } from './reputation'
import {
  getAttestation,
  getAttestationsIssued,
  getAttestationsReceived,
  getCredential,
  getCredentialsIssuedBy,
  getCredentialsOf,
  getIssuers,
  getProfile,
  getProject,
  getProjectsOf,
  listProfiles,
  protocolStats,
  swr,
  type AttestationView,
  type CredentialView,
  type IssuerView,
  type ProfileView,
  type ProjectView,
} from './reads'

// ---------------------------------------------------------------------------
// Reputation for one profile
// ---------------------------------------------------------------------------

export async function reputationFor(profileId: bigint) {
  const profile = await getProfile(profileId)
  if (!profile) return null
  const [projects, received, credentials, prefs, issuedBySubject] = await Promise.all([
    getProjectsOf(profileId),
    getAttestationsReceived(profileId),
    getCredentialsOf(profileId),
    getPreferences(profile.owner),
    getAttestationsIssued(profile.owner),
  ])
  const subjectAttested = new Set(issuedBySubject.filter((a) => a.active).map((a) => a.subjectProfileId))
  const declined = new Set(prefs.declinedAttestations)
  const input = {
    projects: projects.map<RepProject>((p) => ({
      id: p.id,
      title: p.meta.data?.title ?? `Project #${p.id}`,
      active: p.status === 'active',
      verified: p.meta.status === 'verified',
      evidenceCount: (p.meta.data?.evidence.length ?? 0) + (p.meta.data?.repositoryUrl ? 1 : 0) + (p.meta.data?.projectUrl ? 1 : 0),
      createdAt: p.createdAt,
      closedAt: p.closedAt,
      createdBlock: p.createdBlock,
      closedBlock: p.closedBlock,
    })),
    attestations: received.map<RepAttestation>((a) => ({
      id: a.id,
      issuer: a.issuer,
      issuerLabel: a.issuerLabel,
      issuerHasProfile: !!a.issuerProfileId,
      skill: a.skill,
      revoked: a.revoked,
      declined: declined.has(a.id),
      reciprocal: !!a.issuerProfileId && subjectAttested.has(a.issuerProfileId),
      issuedAt: a.issuedAt,
      revokedAt: a.revokedAt,
      issuedBlock: a.issuedBlock,
      revokedBlock: a.revokedBlock,
    })),
    credentials: credentials.map<RepCredential>((c) => ({
      id: c.id,
      title: c.meta.data?.title ?? c.credentialType,
      issuer: c.issuer.address,
      issuerName: c.issuer.name || 'Issuer',
      valid: c.valid,
      issuedAt: c.issuedAt,
      endedAt: c.revoked ? c.revokedAt : c.status === 'expired' ? c.expiresAt : c.status === 'issuer-inactive' ? c.issuer.removedAt : 0,
      issuedBlock: c.issuedBlock,
      endedBlock: c.revoked ? c.revokedBlock : 0,
    })),
  }
  return {
    profile,
    optedIn: prefs.reputationOptIn,
    declinedCount: declined.size,
    reputation: computeReputation(input),
    history: reputationHistory(input),
  }
}

export async function optedInReputations() {
  const [profiles, prefs] = await Promise.all([listProfiles(), allPreferences()])
  const opted = profiles.filter((p) => prefs.get(p.owner.toLowerCase())?.reputationOptIn)
  const out = await Promise.all(opted.map((p) => reputationFor(BigInt(p.id))))
  return out.filter((x): x is NonNullable<typeof x> => x !== null)
}

// ---------------------------------------------------------------------------
// Activity: every create/close event reconstructed from contract state
// ---------------------------------------------------------------------------

export type ActivityKind = 'profile' | 'project' | 'attestation' | 'credential' | 'issuer'
export interface ActivityItem {
  key: string
  t: number
  block: number
  kind: ActivityKind
  action: string
  title: string
  actor: Address | null
  profileId: string | null
  verify: string | null
  tx: { kind: string; id: string } | null
}

async function all<T>(count: number, fetch: (id: bigint) => Promise<T | null>): Promise<T[]> {
  const ids = Array.from({ length: count }, (_, i) => BigInt(i + 1))
  const out: T[] = []
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = await Promise.all(ids.slice(i, i + 150).map(fetch))
    out.push(...chunk.filter((x): x is Awaited<T> => x !== null))
  }
  return out
}

export function activityFeed(): Promise<ActivityItem[]> {
  return swr('activity', 20_000, buildActivity)
}

async function buildActivity(): Promise<ActivityItem[]> {
  const stats = await protocolStats()
  const [profiles, projects, attestations, credentials, issuers] = await Promise.all([
    listProfiles(),
    all<ProjectView>(stats.projects, getProject),
    all<AttestationView>(stats.attestations, getAttestation),
    all<CredentialView>(stats.credentials, getCredential),
    getIssuers(),
  ])
  const name = new Map(profiles.map((p) => [p.id, p.meta.data?.displayName ?? (p.agentLabel ? `${p.agentLabel}.ai` : `#${p.id}`)]))
  const items: ActivityItem[] = []
  for (const p of profiles) {
    items.push({ key: `p${p.id}c`, t: p.createdAt, block: p.createdBlock, kind: 'profile', action: 'created', title: `${name.get(p.id)} joined${p.agentLabel ? ` as ${p.agentLabel}.ai` : ''}`, actor: p.owner, profileId: p.id, verify: `profile:${p.id}`, tx: { kind: 'profile-created', id: p.id } })
    if (p.version > 1)
      items.push({ key: `p${p.id}u`, t: p.updatedAt, block: p.updatedBlock, kind: 'profile', action: 'updated', title: `${name.get(p.id)} updated their profile (v${p.version})`, actor: p.owner, profileId: p.id, verify: `profile:${p.id}`, tx: { kind: 'profile-updated', id: p.id } })
  }
  for (const pr of projects) {
    const title = pr.meta.data?.title ?? `project #${pr.id}`
    items.push({ key: `j${pr.id}a`, t: pr.createdAt, block: pr.createdBlock, kind: 'project', action: pr.supersedes !== '0' ? 'revised' : 'added', title: `${name.get(pr.profileId)} ${pr.supersedes !== '0' ? 'revised' : 'added'} “${title}”`, actor: pr.creator, profileId: pr.profileId, verify: `project:${pr.id}`, tx: { kind: 'project-added', id: pr.id } })
    if (pr.status === 'revoked')
      items.push({ key: `j${pr.id}r`, t: pr.closedAt, block: pr.closedBlock, kind: 'project', action: 'revoked', title: `${name.get(pr.profileId)} revoked “${title}”`, actor: pr.creator, profileId: pr.profileId, verify: `project:${pr.id}`, tx: { kind: 'project-revoked', id: pr.id } })
  }
  for (const a of attestations) {
    const who = a.issuerLabel ? `${a.issuerLabel}.ai` : `${a.issuer.slice(0, 6)}…${a.issuer.slice(-4)}`
    items.push({ key: `a${a.id}i`, t: a.issuedAt, block: a.issuedBlock, kind: 'attestation', action: 'issued', title: `${who} attested “${a.skill}” for ${name.get(a.subjectProfileId)}`, actor: a.issuer, profileId: a.subjectProfileId, verify: `attestation:${a.id}`, tx: { kind: 'attestation-issued', id: a.id } })
    if (a.revoked)
      items.push({ key: `a${a.id}r`, t: a.revokedAt, block: a.revokedBlock, kind: 'attestation', action: 'revoked', title: `${who} revoked their “${a.skill}” attestation for ${name.get(a.subjectProfileId)}`, actor: a.issuer, profileId: a.subjectProfileId, verify: `attestation:${a.id}`, tx: { kind: 'attestation-revoked', id: a.id } })
  }
  for (const c of credentials) {
    const t = c.meta.data?.title ?? c.credentialType
    items.push({ key: `c${c.id}i`, t: c.issuedAt, block: c.issuedBlock, kind: 'credential', action: 'issued', title: `${c.issuer.name || 'Issuer'} issued “${t}” to ${name.get(c.subjectProfileId)}`, actor: c.issuer.address, profileId: c.subjectProfileId, verify: `credential:${c.id}`, tx: { kind: 'credential-issued', id: c.id } })
    if (c.revoked)
      items.push({ key: `c${c.id}r`, t: c.revokedAt, block: c.revokedBlock, kind: 'credential', action: 'revoked', title: `“${t}” for ${name.get(c.subjectProfileId)} was revoked`, actor: c.revokedBy, profileId: c.subjectProfileId, verify: `credential:${c.id}`, tx: { kind: 'credential-revoked', id: c.id } })
  }
  for (const i of issuers) {
    items.push({ key: `o${i.address}a`, t: i.approvedAt, block: 0, kind: 'issuer', action: 'approved', title: `${i.name} approved as a credential issuer`, actor: i.address, profileId: null, verify: i.address, tx: null })
    if (!i.active && i.removedAt)
      items.push({ key: `o${i.address}r`, t: i.removedAt, block: 0, kind: 'issuer', action: 'removed', title: `${i.name} removed from the issuer allowlist`, actor: i.address, profileId: null, verify: i.address, tx: null })
  }
  return items.sort((a, b) => b.t - a.t || b.block - a.block)
}

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

export interface OrganizationSummary extends IssuerView {
  issued: number
  valid: number
  revoked: number
  credentials: CredentialView[]
}

export async function organizations(): Promise<OrganizationSummary[]> {
  const issuers = await getIssuers()
  return Promise.all(
    issuers.map(async (i) => {
      const creds = await getCredentialsIssuedBy(i.address)
      return { ...i, issued: creds.length, valid: creds.filter((c) => c.valid).length, revoked: creds.filter((c) => c.revoked).length, credentials: creds }
    }),
  )
}

export async function subjectNames(ids: string[]): Promise<Map<string, ProfileView>> {
  const uniq = [...new Set(ids)]
  const out = await Promise.all(uniq.map((id) => getProfile(BigInt(id))))
  return new Map(out.filter((p): p is ProfileView => !!p).map((p) => [p.id, p]))
}
