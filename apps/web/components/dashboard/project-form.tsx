'use client'

import { useState } from 'react'
import { evidenceKinds, normalizeKey, type ProjectMetadata } from '@skillproof/shared'
import { ActionRunner } from '@/components/action-runner'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { uploadMetadata } from '@/lib/client-api'
import { skillsFromText } from './profile-form'

type Ev = { kind: (typeof evidenceKinds)[number]; label: string; ref: string }

export function ProjectForm({
  profileId,
  supersede,
  onDone,
}: {
  profileId: string
  supersede?: { projectId: string; meta: ProjectMetadata | null }
  onDone?: () => void
}) {
  const m = supersede?.meta
  const [title, setTitle] = useState(m?.title ?? '')
  const [role, setRole] = useState(m?.role ?? '')
  const [summary, setSummary] = useState(m?.summary ?? '')
  const [projectUrl, setProjectUrl] = useState(m?.projectUrl ?? '')
  const [repositoryUrl, setRepositoryUrl] = useState(m?.repositoryUrl ?? '')
  const [skills, setSkills] = useState((m?.skills ?? []).join(', '))
  const [evidence, setEvidence] = useState<Ev[]>(m?.evidence.map((e) => ({ ...e })) ?? [{ kind: 'pull-request', label: '', ref: '' }])

  const badSkill = skillsFromText(skills).find((s) => !normalizeKey(s))
  const evErr = evidence.find(
    (e) => e.ref && !(/^https:\/\//i.test(e.ref) || /^0x[0-9a-fA-F]{64}$/.test(e.ref) || /^0x[0-9a-fA-F]{40}$/.test(e.ref)),
  )

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Project title" htmlFor="pj-title">
          <Input id="pj-title" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Your role" htmlFor="pj-role">
          <Input id="pj-role" value={role} maxLength={80} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Smart contract lead" />
        </Field>
      </div>
      <Field label="Summary" htmlFor="pj-summary" hint="What you built and what you personally did.">
        <Textarea id="pj-summary" value={summary} maxLength={1000} onChange={(e) => setSummary(e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Project URL" htmlFor="pj-url">
          <Input id="pj-url" value={projectUrl} onChange={(e) => setProjectUrl(e.target.value)} placeholder="https://…" />
        </Field>
        <Field label="GitHub repository" htmlFor="pj-repo">
          <Input id="pj-repo" value={repositoryUrl} onChange={(e) => setRepositoryUrl(e.target.value)} placeholder="https://github.com/…" />
        </Field>
      </div>
      <Field label="Skills demonstrated" htmlFor="pj-skills" hint="Peers attest to these skills on this project." error={badSkill ? `"${badSkill}" cannot be normalized` : null}>
        <Input id="pj-skills" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="solidity, foundry, next.js" />
      </Field>
      <div className="space-y-2">
        <p className="text-[13px] font-medium">Evidence references</p>
        <p className="text-[12px] text-ink-3">Commit / PR URLs, deployment transaction hashes, contract addresses, demo links.</p>
        {evidence.map((e, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[150px_1fr_1.4fr_auto]">
            <Select
              aria-label="Evidence kind"
              value={e.kind}
              onChange={(ev) => setEvidence(evidence.map((x, j) => (j === i ? { ...x, kind: ev.target.value as Ev['kind'] } : x)))}
            >
              {evidenceKinds.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </Select>
            <Input aria-label="Evidence label" placeholder="Label (optional)" value={e.label} onChange={(ev) => setEvidence(evidence.map((x, j) => (j === i ? { ...x, label: ev.target.value } : x)))} />
            <Input aria-label="Evidence reference" placeholder="https://… or 0x…" className="font-mono" value={e.ref} onChange={(ev) => setEvidence(evidence.map((x, j) => (j === i ? { ...x, ref: ev.target.value.trim() } : x)))} />
            <Button variant="ghost" size="md" onClick={() => setEvidence(evidence.filter((_, j) => j !== i))} aria-label="Remove evidence">
              ✕
            </Button>
          </div>
        ))}
        {evErr ? <p className="text-[12px] text-bad">Evidence must be an https URL, a 0x transaction hash or a 0x contract address.</p> : null}
        {evidence.length < 20 ? (
          <Button variant="secondary" size="sm" onClick={() => setEvidence([...evidence, { kind: 'commit', label: '', ref: '' }])}>
            + Add evidence
          </Button>
        ) : null}
      </div>
      <ActionRunner
        label={supersede ? `Publish revision of project #${supersede.projectId}` : 'Add project on-chain'}
        disabled={!title.trim() || !!badSkill || !!evErr}
        onConfirmed={onDone}
        prepare={async () => {
          const { uri, hash } = await uploadMetadata('project', {
            title,
            role,
            summary,
            projectUrl,
            repositoryUrl,
            skills: skillsFromText(skills),
            evidence: evidence.filter((e) => e.ref),
          })
          return supersede
            ? { action: 'supersedeProject', projectId: BigInt(supersede.projectId), metadataURI: uri, evidenceHash: hash }
            : { action: 'addProject', profileId: BigInt(profileId), metadataURI: uri, evidenceHash: hash }
        }}
      />
    </div>
  )
}
