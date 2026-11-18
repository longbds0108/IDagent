'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { normalizeKey } from '@skillproof/shared'
import { ActionRunner } from '@/components/action-runner'
import { AttestForm } from '@/components/dashboard/attest-form'
import { useIssued, useMyProfile } from '@/components/dashboard/hooks'
import { AttestationRow } from '@/components/records'
import { Card, CardBody, CardHeader, Empty } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/field'
import { useIdentity } from '@/components/wallet/identity'

function RequestLink() {
  const bundle = useMyProfile()
  const [projectId, setProjectId] = useState('')
  const [skill, setSkill] = useState('')
  const [copied, setCopied] = useState(false)
  const b = bundle.data
  if (!b) return <p className="text-[13px] text-ink-3">Create a profile and add a project to request attestations.</p>
  const active = b.projects.filter((p) => p.status === 'active')
  const key = normalizeKey(skill)
  const url =
    typeof window !== 'undefined' && projectId
      ? `${window.location.origin}/dashboard/endorsements?profile=${b.profile.id}&project=${projectId}${key ? `&skill=${encodeURIComponent(key)}` : ''}`
      : ''
  const project = active.find((p) => p.id === projectId)
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Project" htmlFor="rq-project">
          <Select id="rq-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Choose a project</option>
            {active.map((p) => (
              <option key={p.id} value={p.id}>
                #{p.id} · {p.meta.data?.title ?? 'untitled'}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Skill to vouch for" htmlFor="rq-skill">
          <Input id="rq-skill" list="rq-skill-list" value={skill} onChange={(e) => setSkill(e.target.value)} className="font-mono" />
          <datalist id="rq-skill-list">{project?.meta.data?.skills.map((k) => <option key={k} value={k} />)}</datalist>
        </Field>
      </div>
      {url ? (
        <div className="flex gap-2">
          <Input readOnly value={url} className="font-mono text-[12px]" aria-label="Request link" />
          <button
            className="rounded-md border border-line-strong px-3 text-[13px]"
            onClick={() => navigator.clipboard?.writeText(url).then(() => setCopied(true))}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      ) : null}
      <p className="text-[12px] text-ink-3">Send this to someone who saw the work. They need their own Agent ID to sign.</p>
    </div>
  )
}

function Inner() {
  const sp = useSearchParams()
  const { account, address } = useIdentity()
  const mine = useMyProfile()
  const issued = useIssued()
  const initial = { profile: sp.get('profile') ?? undefined, project: sp.get('project') ?? undefined, skill: sp.get('skill') ?? undefined }
  const isRequest = !!initial.profile && initial.profile !== account?.profileId

  const titles = new Map((mine.data?.projects ?? []).map((p) => [p.id, p.meta.data?.title ?? `project #${p.id}`]))

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={isRequest ? 'Attestation request' : 'Attest to a builder'}
          description="Peer attestations require your address to hold an Agent ID. One active attestation per builder, project and skill."
        />
        <CardBody>
          <AttestForm key={`${initial.profile}-${initial.project}-${initial.skill}`} initial={initial} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Request an attestation" description="Generate a direct link for a project and skill." />
        <CardBody>
          <RequestLink />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Received" description="Attestations other Agent ID holders signed for your projects." />
        <CardBody>
          {!account?.profileId ? (
            <Empty>No profile yet.</Empty>
          ) : !mine.data?.attestations.length ? (
            <Empty>None yet.</Empty>
          ) : (
            <ul className="space-y-2">
              {[...mine.data.attestations].reverse().map((a) => (
                <AttestationRow key={a.id} a={a} projectTitle={titles.get(a.projectId)} />
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Sent" description="Attestations signed by this address. Only you can revoke them." />
        <CardBody>
          {!issued.data?.attestations.length ? (
            <Empty>You haven&apos;t signed any attestations.</Empty>
          ) : (
            <ul className="space-y-2">
              {[...issued.data.attestations].reverse().map((a) => (
                <AttestationRow
                  key={a.id}
                  a={a}
                  actions={
                    a.active && a.issuer.toLowerCase() === address?.toLowerCase() ? (
                      <ActionRunner compact variant="danger" label="Revoke" prepare={async () => ({ action: 'revokeAttestation', attestationId: BigInt(a.id) })} />
                    ) : null
                  }
                />
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  )
}

export default function EndorsementsPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  )
}
