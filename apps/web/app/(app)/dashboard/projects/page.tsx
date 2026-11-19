'use client'

import { useState } from 'react'
import { ActionRunner } from '@/components/action-runner'
import { useMyProfile } from '@/components/dashboard/hooks'
import { ProjectForm } from '@/components/dashboard/project-form'
import { ProjectCard } from '@/components/records'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, Empty, Notice } from '@/components/ui/card'
import { useIdentity } from '@/components/wallet/identity'

export default function ProjectsPage() {
  const { account } = useIdentity()
  const bundle = useMyProfile()
  const [adding, setAdding] = useState(false)
  const [revising, setRevising] = useState<string | null>(null)

  if (!account) return null
  if (!account.profileId) return <Notice>Create your profile on the Overview tab first.</Notice>
  const b = bundle.data
  if (!b) return <p className="text-[14px] text-ink-3">Loading projects…</p>

  const byProject = new Map<string, typeof b.attestations>()
  for (const a of b.attestations) byProject.set(a.projectId, [...(byProject.get(a.projectId) ?? []), a])
  const ordered = [...b.projects].sort((x, y) => (x.status === 'active' ? 0 : 1) - (y.status === 'active' ? 0 : 1) || Number(y.id) - Number(x.id))

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Project evidence"
          description="Edits create a new record. Old versions stay visible."
          action={
            <Button size="sm" variant={adding ? 'ghost' : 'primary'} onClick={() => setAdding((v) => !v)}>
              {adding ? 'Close' : '+ Add project'}
            </Button>
          }
        />
        {adding ? (
          <CardBody>
            <ProjectForm profileId={account.profileId} onDone={() => setAdding(false)} />
          </CardBody>
        ) : null}
      </Card>

      {ordered.length === 0 ? <Empty>No projects yet.</Empty> : null}
      {ordered.map((p) => (
        <div key={p.id} className="space-y-2">
          <ProjectCard
            project={p}
            attestations={byProject.get(p.id)}
            actions={
              p.status === 'active' ? (
                <>
                  <Button size="sm" variant="secondary" onClick={() => setRevising(revising === p.id ? null : p.id)}>
                    {revising === p.id ? 'Close' : 'Revise'}
                  </Button>
                  <ActionRunner compact variant="danger" label="Revoke" prepare={async () => ({ action: 'revokeProject', projectId: BigInt(p.id) })} />
                </>
              ) : null
            }
          />
          {revising === p.id ? (
            <Card>
              <CardHeader title={`Revise project #${p.id}`} description="Existing attestations stay attached to the original record." />
              <CardBody>
                <ProjectForm profileId={account.profileId!} supersede={{ projectId: p.id, meta: p.meta.data }} onDone={() => setRevising(null)} />
              </CardBody>
            </Card>
          ) : null}
        </div>
      ))}
    </div>
  )
}
