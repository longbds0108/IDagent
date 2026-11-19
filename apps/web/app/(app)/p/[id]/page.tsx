import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { explorerAddressUrl } from '@skillproof/shared'
import { Avatar } from '@/components/avatar'
import { profileHref } from '@/components/builder-card'
import { InspectEvidence } from '@/components/inspect'
import { TxLink } from '@/components/links'
import { AttestationRow, CredentialCard, ProjectCard } from '@/components/records'
import { MetaStatusNote } from '@/components/trust'
import { SectionHead } from '@/components/section-head'
import { Empty, StatStrip } from '@/components/ui/card'
import { deployedContracts, publicEnv } from '@/lib/env'
import { getAttestationsReceived, getCredentialsOf, getProfile, getProjectsOf, resolveProfileId } from '@/lib/reads'
import { getPreferences } from '@/lib/preferences-server'
import { formatDate, shortAddress } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const load = cache(async (param: string) => {
  if (!deployedContracts()) return null
  const id = await resolveProfileId(param).catch(() => null)
  if (id === null) return null
  const [profile, projects, attestations, credentials] = await Promise.all([
    getProfile(id),
    getProjectsOf(id),
    getAttestationsReceived(id),
    getCredentialsOf(id),
  ])
  if (!profile) return null
  const prefs = await getPreferences(profile.owner).catch(() => null)
  return { profile, projects, attestations, credentials, prefs }
})

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const d = await load(id)
  if (!d) return { title: 'Profile not found' }
  const m = d.profile.meta.data
  const name = m?.displayName ?? (d.profile.agentLabel ? `${d.profile.agentLabel}.ai` : `Builder #${d.profile.id}`)
  const peer = d.attestations.filter((a) => a.active).length
  const creds = d.credentials.filter((c) => c.valid).length
  const projects = d.projects.filter((p) => p.status === 'active').length
  const description = `${projects} self-reported project${projects === 1 ? '' : 's'} · ${peer} peer attestation${peer === 1 ? '' : 's'} · ${creds} approved-issuer credential${creds === 1 ? '' : 's'}${m?.skills.length ? ` · ${m.skills.slice(0, 5).join(', ')}` : ''}`
  return {
    title: name,
    description,
    alternates: { canonical: profileHref(d.profile) },
    openGraph: { title: `${name} on Attested`, description, type: 'profile' },
    twitter: { card: 'summary_large_image', title: `${name} on Attested`, description },
  }
}

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const d = await load(id)
  if (!d) notFound()
  const { profile: p, projects, credentials, prefs } = d
  const declined = new Set(prefs?.declinedAttestations ?? [])
  const accepted = new Set(prefs?.acceptedAttestations ?? [])
  const attestations = d.attestations.filter((a) => !declined.has(a.id))
  const declinedCount = d.attestations.length - attestations.length
  const m = p.meta.data
  const c = deployedContracts()!
  const name = m?.displayName ?? (p.agentLabel ? `${p.agentLabel}.ai` : `Builder #${p.id}`)
  const byProject = new Map<string, typeof attestations>()
  for (const a of attestations) byProject.set(a.projectId, [...(byProject.get(a.projectId) ?? []), a])
  const projectTitle = new Map(projects.map((pr) => [pr.id, pr.meta.data?.title ?? `project #${pr.id}`]))
  const activeProjects = projects.filter((x) => x.status === 'active')
  const history = projects.filter((x) => x.status !== 'active')
  const activePeer = attestations.filter((a) => a.active)
  const validCreds = credentials.filter((x) => x.valid)
  const peerBySkill = new Map<string, number>()
  for (const a of activePeer) peerBySkill.set(a.skill, (peerBySkill.get(a.skill) ?? 0) + 1)

  return (
    <div className="pb-10">
      <section className="sp-enter grid gap-10 border-b border-line pb-10 pt-8 sm:pt-12 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end">
        <div className="min-w-0">
          <p className="sp-label">
            // BUILDER #{p.id}
            {p.agentLabel ? ` · ${p.agentLabel.toUpperCase()}.AI` : ''} · v{p.version}
          </p>
          <div className="mt-6 flex items-end gap-5">
            <Avatar url={prefs?.hideAvatar ? undefined : m?.avatarUrl} seed={p.owner} size={84} />
            <h1 className="sp-display min-w-0 break-words text-[clamp(2.8rem,7vw,6.4rem)]">{name}</h1>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3 font-mono text-[12px]">
            {p.agentLabel ? (
              <span
                className="border border-peer/40 bg-peer-bg px-2 py-1 text-peer"
                title="Bound on-chain: the registry checked ownerOf(keccak256(label)) on the official Agent ID contract"
              >
                {p.agentLabel}.ai
              </span>
            ) : null}
            <a className="text-ink-3 underline decoration-line-strong underline-offset-4 hover:text-peer" href={explorerAddressUrl(p.owner, publicEnv.explorerUrl)} target="_blank" rel="noreferrer">
              {shortAddress(p.owner, 6)} ↗
            </a>
          </div>
          {m?.bio ? <p className="mt-6 max-w-2xl whitespace-pre-line text-[16px] leading-relaxed text-ink-2">{m.bio}</p> : null}
          {p.meta.status !== 'verified' ? (
            <div className="mt-2">
              <MetaStatusNote status={p.meta.status} />
            </div>
          ) : null}
          {m && !prefs?.hideSocialLinks && Object.values(m.links).some(Boolean) ? (
            <div className="mt-5 flex flex-wrap gap-5">
              {Object.entries(m.links).map(([k, v]) =>
                v ? (
                  <a key={k} href={v} target="_blank" rel="noreferrer nofollow me" className="font-mono text-[11px] uppercase tracking-[0.04em] text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-peer">
                    {k === 'x' ? 'X' : k} ↗
                  </a>
                ) : null,
              )}
            </div>
          ) : null}
          <p className="sp-label mt-6 !normal-case !tracking-normal">Profile content is self-reported by the owner. Its hash is anchored on-chain.</p>
        </div>

        <aside className="sp-panel p-5 text-[13px]">
          <p className="sp-label">// IDENTITY STATUS</p>
          <dl className="mt-4 divide-y divide-line border-y border-line font-mono text-[12px]">
            {(
              [
                ['AGENT ID HELD NOW', p.agentIdHeld ? 'YES' : 'NO', p.agentIdHeld ? 'text-ok' : 'text-bad'],
                ['.AI NAME BOUND', p.agentLabel ? 'ON-CHAIN' : 'NO', ''],
                ['PROFILE', `#${p.id} · v${p.version}`, ''],
                ['SINCE', formatDate(p.createdAt), ''],
              ] as const
            ).map(([k, v, tone]) => (
              <div key={k} className="flex justify-between py-2.5">
                <dt className="text-ink-3">{k}</dt>
                <dd className={tone}>{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
            <TxLink kind="profile-created" id={p.id} block={p.createdBlock} label="Creation tx" />
            {p.version > 1 ? <TxLink kind="profile-updated" id={p.id} block={p.updatedBlock} label="Latest update" /> : null}
            <InspectEvidence
              contract={c.profileRegistry}
              contractName="SkillProfileRegistry"
              recordLabel={`getProfile(${p.id})`}
              hash={p.metadataHash}
              uri={p.metadataURI}
              status={p.meta.status}
              raw={p.meta.raw}
              extra={p.agentLabel ? [['Agent ID token', p.agentIdTokenId]] : []}
            />
          </div>
          <p className="mt-4 text-[11.5px] leading-relaxed text-ink-3">An Agent ID is an eligibility signal, not proof of a unique person.</p>
        </aside>
      </section>

      <StatStrip
        className="mt-0"
        items={[
          { label: 'SELF · ACTIVE PROJECTS', value: activeProjects.length, tone: 'text-self' },
          { label: 'PEER · ACTIVE ATTESTATIONS', value: activePeer.length, tone: 'text-peer' },
          { label: 'ISSUER · VALID CREDENTIALS', value: validCreds.length, tone: 'text-issuer' },
        ]}
      />

      {m?.skills.length ? (
        <section className="mt-12">
          <p className="sp-label">// SKILLS</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {m.skills.map((k) => (
              <span key={k} className="border border-line bg-surface/60 px-2.5 py-1.5 font-mono text-[12px]">
                {k}
                {peerBySkill.get(k) ? (
                  <span className="ml-2 text-peer">{peerBySkill.get(k)} PEER</span>
                ) : (
                  <span className="ml-2 text-ink-3">SELF</span>
                )}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-16 space-y-4">
        <SectionHead kicker="// 01 · SELF-REPORTED" title="Projects" note="Published by the builder. Revisions create new records; history stays visible." />
        {activeProjects.length === 0 ? <Empty>No active projects.</Empty> : null}
        {activeProjects.map((pr) => (
          <ProjectCard
            key={pr.id}
            project={pr}
            attestations={byProject.get(pr.id)}
            endorseHref={`/dashboard/endorsements?profile=${p.id}&project=${pr.id}`}
          />
        ))}
        {history.length ? (
          <details>
            <summary className="sp-label cursor-pointer !text-ink-2 hover:!text-peer">
              + HISTORY · {history.length} SUPERSEDED OR REVOKED RECORD{history.length === 1 ? '' : 'S'}
            </summary>
            <div className="mt-4 space-y-4">
              {history.map((pr) => (
                <ProjectCard key={pr.id} project={pr} attestations={byProject.get(pr.id)} />
              ))}
            </div>
          </details>
        ) : null}
      </section>

      <section className="mt-16 space-y-4">
        <SectionHead
          kicker="// 02 · PEER ATTESTED"
          title="Peer attestations"
          note="Signed statements by other Agent ID holders. Revoked ones stay visible."
          action={
            prefs?.reputationOptIn ? (
              <Link href={`/reputation?profile=${p.id}`} className="font-mono text-[10.5px] uppercase tracking-[0.04em] text-peer underline underline-offset-4">
                Reputation ↗
              </Link>
            ) : null
          }
        />
        <ul className="space-y-3">
          {attestations.length === 0 ? <Empty>No peer attestations yet.</Empty> : null}
          {[...attestations].reverse().map((a) => (
            <AttestationRow key={a.id} a={a} projectTitle={projectTitle.get(a.projectId)} response={accepted.has(a.id) ? 'accepted' : null} />
          ))}
        </ul>
        {declinedCount ? (
          <p className="sp-label !normal-case !tracking-normal">
            {declinedCount} attestation{declinedCount === 1 ? '' : 's'} declined by the builder {declinedCount === 1 ? 'is' : 'are'} not shown here. They stay
            on-chain and visible in the <Link className="underline" href={`/activity?q=profile:${p.id}`}>Activity feed</Link> and Verification Center.
          </p>
        ) : null}
      </section>

      <section className="mt-16 space-y-4">
        <SectionHead kicker="// 03 · APPROVED ISSUER" title="Credentials" note="Issued by organizations on the admin-approved allowlist." />
        {credentials.length === 0 ? <Empty>No credentials yet.</Empty> : null}
        {credentials.map((cr) => (
          <CredentialCard key={cr.id} cred={cr} />
        ))}
      </section>
    </div>
  )
}
