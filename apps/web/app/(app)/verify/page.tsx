import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { explorerAddressUrl, explorerTxUrl, trustLevels, type TrustLevel } from '@skillproof/shared'
import { profileHref } from '@/components/builder-card'
import { AttestationRow, CredentialCard, ProjectCard } from '@/components/records'
import { TrustBadge } from '@/components/trust'
import { SectionHead } from '@/components/section-head'
import { Notice, PageHero } from '@/components/ui/card'
import { buttonClass } from '@/components/ui/button'
import { deployedContracts, publicEnv } from '@/lib/env'
import {
  getAccount,
  getAttestation,
  getCredential,
  getProfile,
  getProject,
  isAgentIdHolder,
  resolveProfileId,
} from '@/lib/reads'
import { verifyTransaction } from '@/lib/verify'
import { getPreferences } from '@/lib/preferences-server'
import { parseVerifyQuery } from '@/lib/verify-query'
import { shortAddress } from '@/lib/utils'

export const metadata: Metadata = { title: 'Verification Center' }
export const dynamic = 'force-dynamic'

function Proves({ level }: { level: TrustLevel }) {
  const t = trustLevels[level]
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="sp-panel border-l-2 !border-l-ok p-5">
        <p className="sp-label !text-ok">// INTEGRITY · WHAT THE CHAIN CONFIRMS</p>
        <p className="mt-2 text-[13.5px] leading-relaxed">{t.proves}</p>
      </div>
      <div className="border border-dashed border-line-strong p-5">
        <p className="sp-label">// TRUTH OF THE CLAIM · NOT ESTABLISHED</p>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{t.doesNotProve}</p>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="sp-enter space-y-4">
      <SectionHead kicker="// RESULT" title={title} />
      {children}
    </section>
  )
}

const eventLink: Record<string, (a: Record<string, string>) => string | null> = {
  ProfileCreated: (a) => `profile:${a.profileId}`,
  ProfileMetadataUpdated: (a) => `profile:${a.profileId}`,
  AgentLabelBound: (a) => `profile:${a.profileId}`,
  ProjectAdded: (a) => `project:${a.projectId}`,
  ProjectSuperseded: (a) => `project:${a.newProjectId}`,
  ProjectRevoked: (a) => `project:${a.projectId}`,
  AttestationIssued: (a) => `attestation:${a.attestationId}`,
  AttestationRevoked: (a) => `attestation:${a.attestationId}`,
  CredentialIssued: (a) => `credential:${a.credentialId}`,
  CredentialRevoked: (a) => `credential:${a.credentialId}`,
}

async function Result({ q }: { q: string }) {
  const parsed = parseVerifyQuery(q)
  const c = deployedContracts()
  if (!c) return <Notice tone="warn">Contracts are not configured for this deployment.</Notice>
  switch (parsed.kind) {
    case 'empty':
      return null
    case 'invalid':
      return <Notice tone="bad">Could not understand “{parsed.input}”. Try a transaction hash, an address, a profile URL, or credential:ID.</Notice>
    case 'tx': {
      const v = await verifyTransaction(parsed.hash)
      if (!v.found) return <Notice tone="bad">Transaction not found on BNB Smart Chain mainnet (chain {v.chainId}).</Notice>
      return (
        <Section title="Transaction">
          <div className="sp-panel p-4 text-[13px]">
            <dl className="grid grid-cols-[120px_1fr] gap-y-1.5">
              <dt className="text-ink-3">Chain</dt>
              <dd>BNB Smart Chain mainnet ({v.chainId})</dd>
              <dt className="text-ink-3">Status</dt>
              <dd>
                <span className={v.status === 'success' ? 'font-medium' : v.status === 'pending' ? 'font-medium text-warn' : 'font-medium text-bad'}>
                  {v.status === 'success' ? 'Executed successfully' : v.status === 'pending' ? 'Not yet mined' : 'Reverted: nothing was recorded'}
                </span>
              </dd>
              <dt className="text-ink-3">Block</dt>
              <dd>{v.blockNumber ?? '—'}</dd>
              <dt className="text-ink-3">From</dt>
              <dd className="font-mono">{v.from ? <a className="underline" href={explorerAddressUrl(v.from, publicEnv.explorerUrl)}>{v.from}</a> : '—'}</dd>
              <dt className="text-ink-3">To</dt>
              <dd className="font-mono break-anywhere">{v.to ?? 'Contract creation'}</dd>
              <dt className="text-ink-3">Explorer</dt>
              <dd>
                <a className="underline" href={explorerTxUrl(v.hash, publicEnv.explorerUrl)} target="_blank" rel="noreferrer">
                  BscScan ↗
                </a>
              </dd>
            </dl>
          </div>
          {v.status === 'success' && !v.touchesSkillProof ? <Notice tone="warn">This transaction did not emit any attested events.</Notice> : null}
          {v.events.length ? (
            <ul className="space-y-2">
              {v.events.map((e) => {
                const link = eventLink[e.eventName]?.(e.args)
                return (
                  <li key={e.logIndex} className="sp-panel p-3 text-[13px]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <span className="font-semibold">{e.eventName}</span> <span className="text-ink-3">· {e.contract}</span>
                      </span>
                      {link ? (
                        <Link className="text-[12.5px] font-medium underline" href={`/verify?q=${encodeURIComponent(link)}`}>
                          Check current state →
                        </Link>
                      ) : null}
                    </div>
                    <dl className="mt-2 grid grid-cols-[140px_1fr] gap-y-0.5 font-mono text-[12px]">
                      {Object.entries(e.args).map(([k, val]) => (
                        <div key={k} className="contents">
                          <dt className="text-ink-3">{k}</dt>
                          <dd className="break-anywhere">{val}</dd>
                        </div>
                      ))}
                    </dl>
                  </li>
                )
              })}
            </ul>
          ) : null}
          <p className="text-[12.5px] text-ink-3">
            Events are historical. A record created here may have been revoked or superseded since. Use “Check current state”.
          </p>
        </Section>
      )
    }
    case 'address': {
      const acct = await getAccount(parsed.address)
      return (
        <Section title="Address">
          <div className="sp-panel p-4 text-[13px]">
            <dl className="grid grid-cols-[160px_1fr] gap-y-1.5">
              <dt className="text-ink-3">Address</dt>
              <dd className="break-anywhere font-mono">{acct.address}</dd>
              <dt className="text-ink-3">Holds an Agent ID</dt>
              <dd>{acct.agentIdHeld ? 'Yes' : 'No'}</dd>
              <dt className="text-ink-3">attested profile</dt>
              <dd>{acct.profileId ? <Link className="underline" href={`/p/${acct.profileId}`}>#{acct.profileId}</Link> : 'None'}</dd>
              <dt className="text-ink-3">Approved issuer</dt>
              <dd>{acct.isIssuer ? `Yes: ${acct.issuer?.name}` : acct.issuer ? `Removed (was ${acct.issuer.name})` : 'No'}</dd>
            </dl>
          </div>
        </Section>
      )
    }
    case 'profile': {
      const id = await resolveProfileId(parsed.ref).catch(() => null)
      const p = id !== null ? await getProfile(id) : null
      if (!p) return <Notice tone="bad">No attested profile matches “{parsed.ref}”.</Notice>
      return (
        <Section title={<>Profile #{p.id}</>}>
          <div className="sp-panel p-4 text-[13px]">
            <div className="flex flex-wrap items-center gap-2">
              <TrustBadge level="self" />
              <span className="font-semibold">{p.meta.data?.displayName ?? 'Unnamed'}</span>
              {p.agentLabel ? <span className="font-mono text-ink-2">{p.agentLabel}.ai</span> : null}
            </div>
            <dl className="mt-3 grid grid-cols-[180px_1fr] gap-y-1.5">
              <dt className="text-ink-3">Owner</dt>
              <dd className="break-anywhere font-mono">{p.owner}</dd>
              <dt className="text-ink-3">Agent ID held now</dt>
              <dd>{p.agentIdHeld ? 'Yes' : 'No'}</dd>
              <dt className="text-ink-3">.ai name binding</dt>
              <dd>{p.agentLabel ? `Checked with ownerOf(${shortAddress('0x' + BigInt(p.agentIdTokenId).toString(16), 6)}) at registration` : 'None'}</dd>
              <dt className="text-ink-3">Metadata hash</dt>
              <dd className="break-anywhere font-mono">{p.metadataHash}</dd>
              <dt className="text-ink-3">Hash check</dt>
              <dd>{p.meta.status === 'verified' ? 'Stored JSON matches the on-chain hash' : p.meta.status}</dd>
            </dl>
            <Link href={profileHref(p)} className={buttonClass('secondary', 'sm', 'mt-4')}>
              Open public profile
            </Link>
          </div>
          <Proves level="self" />
        </Section>
      )
    }
    case 'project': {
      const p = await getProject(parsed.id)
      if (!p) return <Notice tone="bad">Project #{parsed.id.toString()} does not exist.</Notice>
      return (
        <Section title={<>Project #{p.id}</>}>
          <ProjectCard project={p} />
          <Proves level="self" />
        </Section>
      )
    }
    case 'attestation': {
      const a = await getAttestation(parsed.id)
      if (!a) return <Notice tone="bad">Attestation #{parsed.id.toString()} does not exist.</Notice>
      const [project, issuerHolds] = await Promise.all([getProject(BigInt(a.projectId)), isAgentIdHolder(a.issuer)])
      const subject = await getProfile(BigInt(a.subjectProfileId))
      const prefs = subject ? await getPreferences(subject.owner).catch(() => null) : null
      const response = prefs?.acceptedAttestations.includes(a.id) ? 'accepted' : prefs?.declinedAttestations.includes(a.id) ? 'declined' : null
      return (
        <Section title={<>Attestation #{a.id}</>}>
          <ul>
            <AttestationRow a={a} projectTitle={project?.meta.data?.title} response={response} />
          </ul>
          <div className="sp-panel p-4 text-[13px]">
            <dl className="grid grid-cols-[200px_1fr] gap-y-1.5">
              <dt className="text-ink-3">Currently active</dt>
              <dd>{a.active ? 'Yes' : 'No (revoked)'}</dd>
              <dt className="text-ink-3">Signer held Agent ID</dt>
              <dd>Yes at signing (enforced by the contract) · now: {issuerHolds ? 'yes' : 'no'}</dd>
              <dt className="text-ink-3">Referenced project status</dt>
              <dd>{project?.status ?? 'unknown'}</dd>
              <dt className="text-ink-3">Builder response</dt>
              <dd>{response ? `${response} (owner-signed, off-chain)` : 'none'}</dd>
            </dl>
          </div>
          <Proves level="peer" />
        </Section>
      )
    }
    case 'credential': {
      const cr = await getCredential(parsed.id)
      if (!cr) return <Notice tone="bad">Credential #{parsed.id.toString()} does not exist.</Notice>
      const checks: [string, boolean, string][] = [
        ['Issuer on allowlist now', cr.issuer.active, cr.issuer.active ? cr.issuer.name : 'Issuer was removed'],
        ['Not revoked', !cr.revoked, cr.revoked ? 'Revoked' : 'OK'],
        ['Not expired', cr.status !== 'expired', cr.expiresAt ? new Date(cr.expiresAt * 1000).toISOString().slice(0, 10) : 'No expiry'],
        ['Metadata matches hash', cr.meta.status === 'verified', cr.meta.status],
      ]
      return (
        <Section title={<>Credential #{cr.id}</>}>
          <div className={`rounded-lg border p-4 ${cr.valid ? 'border-issuer/40 bg-issuer-bg' : 'border-bad/40 bg-bad-bg'}`}>
            <p className={`text-[15px] font-semibold ${cr.valid ? 'text-issuer' : 'text-bad'}`}>
              {cr.valid ? 'Currently valid: issued by an approved organization' : 'Not currently valid'}
            </p>
            <ul className="mt-2 space-y-1 text-[13px]">
              {checks.map(([l, ok, d]) => (
                <li key={l}>
                  <span className="mr-2 font-mono">{ok ? '✓' : '✕'}</span>
                  {l} <span className="text-ink-3">· {d}</span>
                </li>
              ))}
            </ul>
          </div>
          <CredentialCard cred={cr} />
          <Proves level="issuer" />
        </Section>
      )
    }
  }
}

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams
  return (
    <div className="pb-10">
      <PageHero
        kicker="// VERIFICATION CENTER · READ LIVE FROM BSC MAINNET, NOT A CACHE"
        title={
          <>
            Verify
            <br />
            any record
          </>
        }
        lede={
          <>
            Paste a transaction hash, an address, a profile link or <span className="font-mono text-[14px] text-peer">credential:ID</span>.
            Every result separates what the chain confirms from what it cannot.
          </>
        }
        className="!pt-8 sm:!pt-12"
      />
      <form className="sp-panel mt-8 grid gap-2 p-3 sm:grid-cols-[1fr_auto]">
        <input
          name="q"
          defaultValue={q}
          placeholder="0x… · alice.ai · credential:3 · attestation:7 · project:2"
          aria-label="Verify"
          className="h-[54px] min-w-0 border border-line-strong bg-[#120f17] px-4 font-mono text-[13px] focus:border-accent focus:outline-none"
        />
        <button className={buttonClass('primary', 'lg', 'grid grid-cols-[1fr_auto] items-stretch !gap-0 !px-0')}>
          <span className="flex items-center px-5">VERIFY</span>
          <span className="grid aspect-square place-items-center border-l-[6px] border-bg font-sans text-[15px]" aria-hidden>
            ↗
          </span>
        </button>
      </form>
      <div className="mt-10 space-y-6">
        {q ? (
          <Result q={q} />
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {(
              [
                ['01', 'TRANSACTION', 'Decode attested events in any BSC transaction and jump to the current state of each record.'],
                ['02', 'RECORD', 'project:ID, attestation:ID or credential:ID: live status, issuer checks and the hashed evidence.'],
                ['03', 'PROFILE / ADDRESS', 'A profile id, a bound name.ai or an address: identity status and Agent ID eligibility.'],
              ] as const
            ).map(([n, t, d]) => (
              <div key={n} className="sp-rule border-t border-line pt-5">
                <div className="flex justify-between">
                  <span className="font-mono text-[13px]">{t}</span>
                  <span className="sp-label">{n}</span>
                </div>
                <p className="mt-8 text-[14px] leading-relaxed text-ink-2">{d}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
