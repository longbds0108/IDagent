'use client'

import { useEffect, useMemo, useState } from 'react'
import { normalizeKey, relationships } from '@skillproof/shared'
import { ActionRunner } from '@/components/action-runner'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { Notice } from '@/components/ui/card'
import { useIdentity } from '@/components/wallet/identity'
import { uploadMetadata } from '@/lib/client-api'
import { useIssued, useProfileBundle } from './hooks'

export function AttestForm({ initial }: { initial: { profile?: string; project?: string; skill?: string } }) {
  const { address } = useIdentity()
  const [target, setTarget] = useState(initial.profile ?? '')
  const [debounced, setDebounced] = useState(initial.profile ?? '')
  const [projectId, setProjectId] = useState(initial.project ?? '')
  const [skill, setSkill] = useState(initial.skill ?? '')
  const [relationship, setRelationship] = useState<(typeof relationships)[number]>('collaborator')
  const [comment, setComment] = useState('')
  const issued = useIssued()

  useEffect(() => {
    const t = setTimeout(() => setDebounced(target.trim()), 400)
    return () => clearTimeout(t)
  }, [target])

  const bundle = useProfileBundle(debounced || null)
  const b = bundle.data
  const active = useMemo(() => b?.projects.filter((p) => p.status === 'active') ?? [], [b])
  const project = active.find((p) => p.id === projectId)
  const skillKey = normalizeKey(skill)
  const isSelf = !!b && !!address && b.profile.owner.toLowerCase() === address.toLowerCase()
  const duplicate = issued.data?.attestations.find(
    (a) => a.active && a.subjectProfileId === b?.profile.id && a.projectId === projectId && a.skill === skillKey,
  )

  useEffect(() => {
    if (!projectId && active.length === 1) setProjectId(active[0]!.id)
  }, [active, projectId])

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Builder" htmlFor="at-target" hint="Profile id or the .ai name bound on attested" error={debounced && bundle.isError ? 'Profile not found' : null}>
          <Input id="at-target" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="e.g. 12 or alice.ai" className="font-mono" />
        </Field>
        <Field label="Project" htmlFor="at-project">
          <Select id="at-project" value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={!b}>
            <option value="">{b ? (active.length ? 'Choose a project' : 'No active projects') : '—'}</option>
            {active.map((p) => (
              <option key={p.id} value={p.id}>
                #{p.id} · {p.meta.data?.title ?? 'untitled'}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {b ? (
        <p className="text-[13px] text-ink-2">
          Attesting for <strong>{b.profile.meta.data?.displayName ?? `profile #${b.profile.id}`}</strong>
          {b.profile.agentLabel ? <span className="font-mono"> ({b.profile.agentLabel}.ai)</span> : null}. Review their evidence on the{' '}
          <a className="underline" href={`/p/${b.profile.id}${projectId ? `#project-${projectId}` : ''}`} target="_blank" rel="noreferrer">
            public profile ↗
          </a>{' '}
          before signing.
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Skill" htmlFor="at-skill" hint={skillKey ? `Key: ${skillKey}` : 'Pick one the project lists, or type another'} error={skill && !skillKey ? 'Cannot normalize this skill' : null}>
          <Input id="at-skill" list="at-skill-list" value={skill} onChange={(e) => setSkill(e.target.value)} className="font-mono" />
          <datalist id="at-skill-list">
            {project?.meta.data?.skills.map((k) => <option key={k} value={k} />)}
          </datalist>
        </Field>
        <Field label="Your relationship to this work" htmlFor="at-rel">
          <Select id="at-rel" value={relationship} onChange={(e) => setRelationship(e.target.value as typeof relationship)}>
            {relationships.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="What you witnessed (optional, public)" htmlFor="at-comment">
        <Textarea id="at-comment" value={comment} maxLength={500} onChange={(e) => setComment(e.target.value)} />
      </Field>
      {isSelf ? <Notice tone="bad">You cannot attest to your own profile; the contract rejects self-attestation.</Notice> : null}
      {duplicate ? <Notice tone="warn">You already have active attestation #{duplicate.id} for this project and skill. Revoke it first to re-issue.</Notice> : null}
      <Notice>
        You are signing a public statement from your own address. It proves that you signed it, not that it is true. You can
        revoke it later, but the history stays visible.
      </Notice>
      <ActionRunner
        label="Sign attestation on-chain"
        disabled={!b || !project || !skillKey || isSelf || !!duplicate}
        prepare={async () => {
          const { hash } = await uploadMetadata('attestation', { relationship, comment })
          return { action: 'attest', profileId: BigInt(b!.profile.id), projectId: BigInt(project!.id), skill: skillKey!, metadataHash: hash }
        }}
      />
    </div>
  )
}
