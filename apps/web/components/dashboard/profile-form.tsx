'use client'

import { useState } from 'react'
import { normalizeKey, parseAgentLabel, type ProfileMetadata } from '@skillproof/shared'
import { ActionRunner } from '@/components/action-runner'
import { Field, Input, Textarea } from '@/components/ui/field'
import { uploadMetadata } from '@/lib/client-api'
import { useIdentity } from '@/components/wallet/identity'

export function skillsFromText(text: string) {
  return text
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function ProfileForm({ existing, onDone }: { existing?: ProfileMetadata | null; onDone?: () => void }) {
  const { address } = useIdentity()
  const [displayName, setDisplayName] = useState(existing?.displayName ?? '')
  const [bio, setBio] = useState(existing?.bio ?? '')
  const [skills, setSkills] = useState((existing?.skills ?? []).join(', '))
  const [avatarUrl, setAvatarUrl] = useState(existing?.avatarUrl ?? '')
  const [website, setWebsite] = useState(existing?.links.website ?? '')
  const [github, setGithub] = useState(existing?.links.github ?? '')
  const [x, setX] = useState(existing?.links.x ?? '')
  const [linkedin, setLinkedin] = useState(existing?.links.linkedin ?? '')
  const creating = !existing

  const normalized = skillsFromText(skills).map((s) => [s, normalizeKey(s)] as const)
  const badSkill = normalized.find(([, k]) => !k)?.[0]

  return (
    <div className="space-y-5">
      <p className="text-[14px] leading-relaxed text-ink-2">
        Only the display name is required. You can bind a .ai name after the profile is created.
      </p>
      <Field label="Display name" htmlFor="pf-name">
        <Input id="pf-name" value={displayName} maxLength={60} onChange={(e) => setDisplayName(e.target.value)} />
      </Field>
      <Field label="Bio" htmlFor="pf-bio" hint="Public. Do not include e-mail addresses or private details.">
        <Textarea id="pf-bio" value={bio} maxLength={600} onChange={(e) => setBio(e.target.value)} />
      </Field>
      <Field
        label="Skills"
        htmlFor="pf-skills"
        hint={normalized.length ? `Saved as: ${normalized.map(([, k]) => k ?? '✕').join(', ')}` : 'Comma-separated, e.g. Solidity, Next.js, UI design'}
        error={badSkill ? `"${badSkill}" cannot be normalized` : null}
      >
        <Input id="pf-skills" value={skills} onChange={(e) => setSkills(e.target.value)} />
      </Field>

      <details className="border border-line p-4" open={!creating}>
        <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.05em] text-ink-2">Links and avatar (optional)</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Avatar URL (https)" htmlFor="pf-avatar">
            <Input id="pf-avatar" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" />
          </Field>
          <Field label="Website" htmlFor="pf-web">
            <Input id="pf-web" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" />
          </Field>
          <Field label="GitHub" htmlFor="pf-gh">
            <Input id="pf-gh" value={github} onChange={(e) => setGithub(e.target.value)} placeholder="https://github.com/…" />
          </Field>
          <Field label="X" htmlFor="pf-x">
            <Input id="pf-x" value={x} onChange={(e) => setX(e.target.value)} placeholder="https://x.com/…" />
          </Field>
          <Field label="LinkedIn" htmlFor="pf-li">
            <Input id="pf-li" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="https://linkedin.com/in/…" />
          </Field>
        </div>
      </details>

      <ActionRunner
        label={creating ? 'Create profile on-chain' : 'Publish profile update'}
        disabled={!displayName.trim() || !!badSkill}
        onConfirmed={onDone}
        detect={
          creating
            ? async () => {
                const r = await fetch(`/api/account/${address}`, { cache: 'no-store' })
                const j = await r.json()
                return !!j.profileId
              }
            : undefined
        }
        prepare={async () => {
          const { uri, hash } = await uploadMetadata('profile', {
            displayName,
            bio,
            skills: skillsFromText(skills),
            avatarUrl,
            links: { website, github, x, linkedin },
          })
          return creating
            ? { action: 'createProfile', agentLabel: '', metadataURI: uri, metadataHash: hash }
            : { action: 'updateProfile', metadataURI: uri, metadataHash: hash }
        }}
      />
    </div>
  )
}

export function BindLabel() {
  const [label, setLabel] = useState('')
  const parsed = parseAgentLabel(label)
  return (
    <div className="space-y-3">
      <Field label="Your Agent ID name" htmlFor="bind-label" hint="One-time. Verified on-chain with ownerOf on the official Agent ID contract.">
        <Input id="bind-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="yourname.ai" className="font-mono" />
      </Field>
      <ActionRunner label="Bind .ai name" disabled={!parsed} prepare={async () => ({ action: 'bindAgentLabel', agentLabel: parsed! })} />
    </div>
  )
}
