import Link from 'next/link'
import type { ReactNode } from 'react'
import { explorerTxUrl } from '@skillproof/shared'
import type { AttestationView, CredentialView, ProjectView } from '@/lib/reads'
import { deployedContracts, publicEnv } from '@/lib/env'
import { formatDate, shortAddress } from '@/lib/utils'
import { InspectEvidence } from './inspect'
import { AddressLink, TxLink } from './links'
import { MetaStatusNote, StatusPill, TrustBadge } from './trust'

function EvidenceRef({ kind, label, refValue }: { kind: string; label: string; refValue: string }) {
  const isTx = /^0x[0-9a-fA-F]{64}$/.test(refValue)
  const isAddr = /^0x[0-9a-fA-F]{40}$/.test(refValue)
  const href = isTx
    ? explorerTxUrl(refValue, publicEnv.explorerUrl)
    : isAddr
      ? `${publicEnv.explorerUrl}/address/${refValue}`
      : refValue
  return (
    <li className="flex min-w-0 items-baseline gap-2 text-[13px]">
      <span className="w-[92px] shrink-0 font-mono text-[10px] uppercase tracking-[0.04em] text-ink-3">{kind}</span>
      <a href={href} target="_blank" rel="noreferrer nofollow ugc" className="min-w-0 truncate underline decoration-line-strong underline-offset-2 hover:decoration-ink">
        {label || (isTx || isAddr ? shortAddress(refValue, 6) : refValue.replace(/^https:\/\//, ''))}
      </a>
    </li>
  )
}

export function ProjectCard({
  project,
  attestations = [],
  actions,
  endorseHref,
}: {
  project: ProjectView
  attestations?: AttestationView[]
  actions?: ReactNode
  endorseHref?: string
}) {
  const m = project.meta.data
  const c = deployedContracts()
  const active = attestations.filter((a) => a.active)
  return (
    <article id={`project-${project.id}`} className="sp-panel sp-rule scroll-mt-28">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <TrustBadge level="self" />
            <StatusPill status={project.status === 'none' ? 'none' : project.status} />
            <span className="sp-label">PROJECT #{project.id}</span>
          </div>
          <h3 className={`sp-display mt-4 text-[clamp(1.7rem,3vw,2.4rem)] ${project.status !== 'active' ? 'text-ink-3' : ''}`}>
            {m?.title ?? 'Untitled (metadata unavailable)'}
          </h3>
          {m?.role ? <p className="mt-2 font-mono text-[11.5px] uppercase tracking-[0.04em] text-ink-3">ROLE · {m.role}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="space-y-4 px-5 py-4 sm:px-6">
        {m?.summary ? <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-ink-2">{m.summary}</p> : null}
        {project.meta.status !== 'verified' ? <MetaStatusNote status={project.meta.status} /> : null}
        {m && (m.projectUrl || m.repositoryUrl || m.evidence.length) ? (
          <ul className="space-y-1">
            {m.projectUrl ? <EvidenceRef kind="site" label="" refValue={m.projectUrl} /> : null}
            {m.repositoryUrl ? <EvidenceRef kind="repo" label="" refValue={m.repositoryUrl} /> : null}
            {m.evidence.map((e, i) => (
              <EvidenceRef key={i} kind={e.kind} label={e.label} refValue={e.ref} />
            ))}
          </ul>
        ) : null}
        {m?.skills.length ? (
          <div className="flex flex-wrap gap-1.5">
            {m.skills.map((k) => {
              const n = active.filter((a) => a.skill === k).length
              return (
                <span key={k} className="rounded border border-line px-1.5 py-0.5 font-mono text-[11.5px] text-ink-2">
                  {k}
                  {n ? <span className="ml-1 text-peer">· {n} peer</span> : null}
                </span>
              )
            })}
          </div>
        ) : null}
        {project.supersedes !== '0' ? (
          <p className="text-[12.5px] text-ink-3">
            Revision of <a className="underline" href={`#project-${project.supersedes}`}>project #{project.supersedes}</a>
          </p>
        ) : null}
        {project.supersededBy !== '0' ? (
          <p className="text-[12.5px] text-ink-3">
            Superseded by <a className="underline" href={`#project-${project.supersededBy}`}>project #{project.supersededBy}</a>. The original
            evidence hash below stays bound to this record.
          </p>
        ) : null}
        {active.length ? (
          <div className="border-l-2 border-peer bg-peer-bg px-3 py-2 text-[12.5px]">
            <span className="font-medium text-peer">
              {active.length} active peer attestation{active.length === 1 ? '' : 's'}
            </span>{' '}
            <span className="text-ink-2">
              from {[...new Set(active.map((a) => (a.issuerLabel ? `${a.issuerLabel}.ai` : shortAddress(a.issuer))))].slice(0, 4).join(', ')}
            </span>
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line px-5 py-3 sm:px-6">
        <span className="sp-label">ADDED {formatDate(project.createdAt).toUpperCase()}</span>
        <TxLink kind="project-added" id={project.id} block={project.createdBlock} />
        {c ? (
          <InspectEvidence
            contract={c.projectRegistry}
            contractName="ProjectEvidenceRegistry"
            recordLabel={`getProject(${project.id})`}
            hash={project.evidenceHash}
            uri={project.metadataURI}
            status={project.meta.status}
            raw={project.meta.raw}
            extra={[
              ['Creator', project.creator],
              ['Status', project.status],
            ]}
          />
        ) : null}
        {endorseHref && project.status === 'active' ? (
          <Link href={endorseHref} className="ml-auto font-mono text-[10.5px] uppercase tracking-[0.04em] text-peer underline decoration-accent underline-offset-4 hover:text-ink">
            Attest to this project ↗
          </Link>
        ) : null}
      </div>
    </article>
  )
}

export function AttestationRow({ a, projectTitle, actions }: { a: AttestationView; projectTitle?: string; actions?: ReactNode }) {
  const c = deployedContracts()
  const who = a.issuerLabel ? `${a.issuerLabel}.ai` : a.issuerName ?? shortAddress(a.issuer)
  return (
    <li className="sp-panel px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <TrustBadge level="peer" />
        <StatusPill status={a.revoked ? 'revoked' : 'active'} />
        <span className="font-mono text-[13px] font-medium text-peer">{a.skill}</span>
        <span className="text-[12px] text-ink-3">
          on <a className="underline" href={`/p/${a.subjectProfileId}#project-${a.projectId}`}>{projectTitle ?? `project #${a.projectId}`}</a>
        </span>
        {actions ? <span className="ml-auto">{actions}</span> : null}
      </div>
      <p className="mt-2.5 text-[13.5px] text-ink-2">
        Signed by{' '}
        {a.issuerProfileId ? (
          <a className="font-medium underline" href={`/p/${a.issuerProfileId}`}>
            {who}
          </a>
        ) : (
          <span className="font-medium">{who}</span>
        )}{' '}
        (<AddressLink address={a.issuer} />)
        {a.note.data ? <> · {a.note.data.relationship}</> : null}
        {a.revoked ? <> · revoked {formatDate(a.revokedAt)}</> : null}
      </p>
      {a.note.data?.comment ? <p className="mt-2 border-l border-line-strong pl-3 font-display text-[15px] italic text-ink">“{a.note.data.comment}”</p> : null}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1">
        <span className="sp-label">{formatDate(a.issuedAt).toUpperCase()}</span>
        <TxLink kind="attestation-issued" id={a.id} block={a.issuedBlock} />
        {a.revoked ? <TxLink kind="attestation-revoked" id={a.id} block={a.revokedBlock} label="View revocation" /> : null}
        {c ? (
          <InspectEvidence
            contract={c.attestationRegistry}
            contractName="SkillAttestation"
            recordLabel={`getAttestation(${a.id})`}
            hash={a.metadataHash}
            status={a.note.status}
            raw={a.note.raw}
            extra={[
              ['Issuer', a.issuer],
              ['Subject profile', a.subjectProfileId],
              ['Project', a.projectId],
              ['Skill key', a.skill],
            ]}
          />
        ) : null}
      </div>
    </li>
  )
}

export function CredentialCard({ cred, actions }: { cred: CredentialView; actions?: ReactNode }) {
  const c = deployedContracts()
  const m = cred.meta.data
  const status = cred.status === 'none' ? 'none' : cred.status
  return (
    <article className="sp-panel sp-rule [background:radial-gradient(circle_at_85%_0%,rgba(63,145,255,0.12),transparent_40%),linear-gradient(160deg,rgba(21,32,48,0.7),rgba(19,17,23,0.72))]">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <TrustBadge level="issuer" />
            <StatusPill status={status} />
            <span className="sp-label">CREDENTIAL #{cred.id}</span>
          </div>
          <h3 className="sp-display mt-4 text-[clamp(1.7rem,3vw,2.4rem)]">{m?.title ?? cred.credentialType}</h3>
          <p className="mt-2 text-[13px] text-ink-2">
            Issued by <span className="font-medium">{cred.issuer.name || 'Unnamed issuer'}</span> (
            <AddressLink address={cred.issuer.address} />) · type <span className="font-mono">{cred.credentialType}</span>
          </p>
        </div>
        {actions}
      </div>
      <div className="space-y-2 px-5 py-4 text-[13.5px] text-ink-2 sm:px-6">
        {m?.description ? <p className="whitespace-pre-line leading-relaxed">{m.description}</p> : null}
        {m?.criteria ? <p className="text-[13px]">Criteria: {m.criteria}</p> : null}
        {m?.evidenceUrl ? (
          <a className="text-[13px] underline" href={m.evidenceUrl} target="_blank" rel="noreferrer nofollow">
            Issuer evidence ↗
          </a>
        ) : null}
        {cred.meta.status !== 'verified' ? <MetaStatusNote status={cred.meta.status} /> : null}
        <p className="text-[12.5px] text-ink-3">
          {cred.expiresAt ? `Expires ${formatDate(cred.expiresAt)}` : 'No expiry'}
          {cred.revoked ? ` · revoked ${formatDate(cred.revokedAt)}${cred.revokedBy && cred.revokedBy !== cred.issuer.address ? ' by protocol governance' : ''}` : ''}
          {!cred.issuer.active ? ' · issuer has since been removed from the allowlist' : ''}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line px-5 py-3 sm:px-6">
        <span className="sp-label">ISSUED {formatDate(cred.issuedAt).toUpperCase()}</span>
        <TxLink kind="credential-issued" id={cred.id} block={cred.issuedBlock} />
        {cred.revoked ? <TxLink kind="credential-revoked" id={cred.id} block={cred.revokedBlock} label="View revocation" /> : null}
        {c ? (
          <InspectEvidence
            contract={c.credentialRegistry}
            contractName="CredentialRegistry"
            recordLabel={`verifyCredential(${cred.id})`}
            hash={cred.metadataHash}
            uri={cred.metadataURI}
            status={cred.meta.status}
            raw={cred.meta.raw}
            extra={[
              ['Issuer', cred.issuer.address],
              ['On allowlist now', String(cred.issuer.active)],
              ['Status', cred.status],
            ]}
          />
        ) : null}
        <Link className="font-mono text-[10.5px] uppercase tracking-[0.04em] text-issuer underline underline-offset-4" href={`/verify?q=credential:${cred.id}`}>
          Verify ↗
        </Link>
      </div>
    </article>
  )
}
