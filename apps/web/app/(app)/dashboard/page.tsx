'use client'

import Link from 'next/link'
import { useState } from 'react'
import { profileHref } from '@/components/builder-card'
import { useIssued, useMyProfile } from '@/components/dashboard/hooks'
import { BindLabel, ProfileForm } from '@/components/dashboard/profile-form'
import { TxLink } from '@/components/links'
import { Card, CardBody, CardHeader, Empty } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useIdentity } from '@/components/wallet/identity'

export default function DashboardHome() {
  const { account, accountLoading } = useIdentity()
  const bundle = useMyProfile()
  const issued = useIssued()
  const [editing, setEditing] = useState(false)

  if (accountLoading) return <p className="text-[14px] text-ink-3">Reading account state from BNB Smart Chain…</p>
  if (!account) return null

  if (!account.profileId) {
    return (
      <Card>
        <CardHeader
          title="Create your builder profile"
          index="01"
          description="Profile text is stored off-chain. Its hash goes on-chain."
        />
        <CardBody>
          <ProfileForm />
        </CardBody>
      </Card>
    )
  }

  const b = bundle.data
  if (bundle.isLoading || !b) return <p className="text-[14px] text-ink-3">Loading your profile…</p>
  const m = b.profile.meta.data
  const checks: [string, boolean][] = [
    ['Display name', !!m?.displayName],
    ['Bio', !!m?.bio],
    ['At least 3 skills', (m?.skills.length ?? 0) >= 3],
    ['A public link', !!m && Object.values(m.links).some(Boolean)],
    ['.ai name bound on-chain', !!b.profile.agentLabel],
    ['An active project', b.projects.some((p) => p.status === 'active')],
    ['A peer attestation', b.attestations.some((a) => a.active)],
    ['An issuer credential', b.credentials.some((c) => c.valid)],
  ]
  const done = checks.filter(([, ok]) => ok).length

  type Item = { block: number; text: string; kind: string; id: string }
  const activity: Item[] = [
    { block: b.profile.createdBlock, text: 'Profile created', kind: 'profile-created', id: b.profile.id },
    ...(b.profile.version > 1 ? [{ block: b.profile.updatedBlock, text: `Profile updated (v${b.profile.version})`, kind: 'profile-updated', id: b.profile.id }] : []),
    ...b.projects.map((p) => ({ block: p.createdBlock, text: `Project added: ${p.meta.data?.title ?? '#' + p.id}`, kind: 'project-added', id: p.id })),
    ...b.attestations.map((a) => ({ block: a.issuedBlock, text: `Received attestation for ${a.skill}`, kind: 'attestation-issued', id: a.id })),
    ...b.credentials.map((c) => ({ block: c.issuedBlock, text: `Credential: ${c.meta.data?.title ?? c.credentialType}`, kind: 'credential-issued', id: c.id })),
    ...(issued.data?.attestations ?? []).map((a) => ({ block: a.issuedBlock, text: `You attested ${a.skill} for profile #${a.subjectProfileId}`, kind: 'attestation-issued', id: a.id })),
  ]
    .sort((x, y) => y.block - x.block)
    .slice(0, 10)

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <Card>
          <CardHeader
            title="Your profile"
            index="01"
            description={`Profile #${b.profile.id} · version ${b.profile.version}${b.profile.agentLabel ? ` · ${b.profile.agentLabel}.ai` : ''}`}
            action={
              <div className="flex gap-2">
                <Link href={profileHref(b.profile)} className="self-center font-mono text-[11px] uppercase tracking-[0.04em] text-peer underline underline-offset-4">
                  Public page ↗
                </Link>
                <Button size="sm" variant="secondary" onClick={() => setEditing((v) => !v)}>
                  {editing ? 'Close editor' : 'Edit profile'}
                </Button>
              </div>
            }
          />
          {editing ? (
            <CardBody>
              <ProfileForm existing={m} onDone={() => setEditing(false)} />
            </CardBody>
          ) : (
            <CardBody>
              <p className="sp-display text-[clamp(2rem,4vw,3.2rem)]">{m?.displayName ?? `Profile #${b.profile.id}`}</p>
              <p className="mt-4 max-w-2xl text-[14.5px] leading-relaxed text-ink-2">{m?.bio || <span className="text-ink-3">No bio yet.</span>}</p>
            </CardBody>
          )}
        </Card>

        {!b.profile.agentLabel ? (
          <Card>
            <CardHeader title="Bind your .ai name" description="Shows your Agent ID name on your profile and enables /p/yourname.ai links." />
            <CardBody>
              <BindLabel />
            </CardBody>
          </Card>
        ) : null}

        <Card>
          <CardHeader title="Recent on-chain activity" />
          <CardBody>
            {activity.length === 0 ? (
              <Empty>Nothing yet.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {activity.map((a, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13.5px]">
                    <span><span className="mr-3 font-mono text-[11px] text-ink-3">#{a.block}</span>{a.text}</span>
                    <TxLink kind={a.kind} id={a.id} block={a.block} />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="h-fit">
        <CardHeader title="Profile completeness" action={<span className="font-mono text-[1.4rem] tabular-nums">{done}<span className="text-ink-3">/{checks.length}</span></span>} />
        <CardBody>
          <div className="h-1 overflow-hidden bg-surface-2">
            <div className="h-full bg-gradient-to-r from-[#9b5de5] to-[#3f91ff]" style={{ width: `${(done / checks.length) * 100}%` }} />
          </div>
          <ul className="mt-4 space-y-1.5 text-[13px]">
            {checks.map(([l, ok]) => (
              <li key={l} className={ok ? 'text-ink' : 'text-ink-3'}>
                <span className={`mr-2 inline-block w-3 font-mono ${ok ? 'text-ok' : ''}`}>{ok ? '✓' : '·'}</span>
                {l}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[12px] text-ink-3">This checklist is guidance only. attested shows no overall trust score.</p>
          <div className="mt-4 flex flex-col gap-1.5 text-[13px]">
            <Link className="font-mono text-[11px] uppercase tracking-[0.04em] text-peer underline underline-offset-4" href="/dashboard/projects">Add project evidence ↗</Link>
            <Link className="font-mono text-[11px] uppercase tracking-[0.04em] text-peer underline underline-offset-4" href="/dashboard/endorsements">Request an attestation ↗</Link>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
