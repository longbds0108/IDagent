'use client'

import { useState } from 'react'
import { normalizeKey, parseAgentLabel, type ProfileMetadata } from '@skillproof/shared'
import { ActionRunner } from '@/components/action-runner'
import { Button } from '@/components/ui/button'
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
  const [step, setStep] = useState<'write' | 'publish'>('write')
  const creating = !existing

  const normalized = skillsFromText(skills).map((s) => [s, normalizeKey(s)] as const)
  const badSkill = normalized.find(([, k]) => !k)?.[0]

  const profile = () => ({ displayName, bio, skills: skillsFromText(skills), avatarUrl, links: { website, github, x, linkedin } })
  const publish = () => ({
    prepare: async () => {
      const { uri, hash } = await uploadMetadata('profile', profile())
      return creating
        ? { action: 'createProfile' as const, agentLabel: '', metadataURI: uri, metadataHash: hash }
        : { action: 'updateProfile' as const, metadataURI: uri, metadataHash: hash }
    },
  })
  // Creating: the profile id appears on-chain once the transaction lands. The page notices it by itself.
  const detectCreated = creating
    ? async () => {
        const r = await fetch(`/api/account/${address}`, { cache: 'no-store' })
        const j = await r.json()
        return !!j.profileId
      }
    : undefined

  const linksAndPhoto = (
    <details className="border border-line p-4" open={!creating}>
      <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.05em] text-ink-2">Links and photo (optional)</summary>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Photo URL (https)" htmlFor="pf-avatar">
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
  )

  // Step 1 (new profile): only what a newcomer needs. Name is the only required field.
  if (creating && step === 'write') {
    return (
      <div className="space-y-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.05em] text-ink-3">Step 1 of 2 · Write</p>
        <Field label="Your name" htmlFor="pf-name" hint="Shown on your public profile.">
          <Input id="pf-name" value={displayName} maxLength={60} onChange={(e) => setDisplayName(e.target.value)} />
        </Field>
        <Field label="About you (optional)" htmlFor="pf-bio" hint="One or two sentences. Do not add email or private details.">
          <Textarea id="pf-bio" value={bio} maxLength={600} onChange={(e) => setBio(e.target.value)} />
        </Field>
        <Field
          label="Skills (optional)"
          htmlFor="pf-skills"
          hint={normalized.length ? `Saved as: ${normalized.map(([, k]) => k ?? '✕').join(', ')}` : 'Separate with commas, e.g. Solidity, Next.js, UI design'}
          error={badSkill ? `"${badSkill}" cannot be normalized` : null}
        >
          <Input id="pf-skills" value={skills} onChange={(e) => setSkills(e.target.value)} />
        </Field>
        {linksAndPhoto}
        <Button disabled={!displayName.trim() || !!badSkill} onClick={() => setStep('publish')}>
          Next: publish
        </Button>
      </div>
    )
  }

  // Step 2 (new profile): check what you wrote, then publish with one transaction.
  if (creating) {
    return (
      <div className="space-y-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.05em] text-ink-3">Step 2 of 2 · Publish</p>
        <dl className="divide-y divide-line border-y border-line text-[14px]">
          <div className="flex justify-between gap-4 py-2.5">
            <dt className="text-ink-3">Name</dt>
            <dd className="text-right font-medium">{displayName}</dd>
          </div>
          <div className="flex justify-between gap-4 py-2.5">
            <dt className="text-ink-3">About</dt>
            <dd className="text-right">{bio || <span className="text-ink-3">None</span>}</dd>
          </div>
          <div className="flex justify-between gap-4 py-2.5">
            <dt className="text-ink-3">Skills</dt>
            <dd className="text-right">{skillsFromText(skills).join(', ') || <span className="text-ink-3">None</span>}</dd>
          </div>
        </dl>
        <p className="text-[13px] leading-relaxed text-ink-2">
          Publishing is one transaction from your Agentic Wallet. You pay a small BNB gas fee.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <ActionRunner label="Publish my profile" detect={detectCreated} onConfirmed={onDone} prepare={publish().prepare} />
          <Button variant="ghost" onClick={() => setStep('write')}>
            Edit details
          </Button>
        </div>
      </div>
    )
  }

  // Editing an existing profile: one form, publish a new version.
  return (
    <div className="space-y-5">
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
      {linksAndPhoto}
      <ActionRunner label="Publish profile update" disabled={!displayName.trim() || !!badSkill} onConfirmed={onDone} prepare={publish().prepare} />
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
