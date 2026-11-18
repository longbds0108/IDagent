'use client'

import { useEffect, useState } from 'react'
import { isAddress, type Address } from 'viem'
import { normalizeKey } from '@skillproof/shared'
import { ActionRunner } from '@/components/action-runner'
import { useIssued, useIssuers, useMyProfile, useProfileBundle } from '@/components/dashboard/hooks'
import { AddressLink } from '@/components/links'
import { CredentialCard } from '@/components/records'
import { Card, CardBody, CardHeader, Empty, Notice } from '@/components/ui/card'
import { Field, Input, Textarea } from '@/components/ui/field'
import { useIdentity } from '@/components/wallet/identity'
import { uploadMetadata } from '@/lib/client-api'
import { formatDate } from '@/lib/utils'

function IssueForm() {
  const [subject, setSubject] = useState('')
  const [debounced, setDebounced] = useState('')
  const [type, setType] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [criteria, setCriteria] = useState('')
  const [evidenceUrl, setEvidenceUrl] = useState('')
  const [expiry, setExpiry] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebounced(subject.trim()), 400)
    return () => clearTimeout(t)
  }, [subject])
  const bundle = useProfileBundle(debounced || null)
  const key = normalizeKey(type)
  const expiresAt = expiry ? Math.floor(new Date(`${expiry}T23:59:59Z`).getTime() / 1000) : 0
  const expiryBad = expiry && expiresAt <= Date.now() / 1000

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Subject profile" htmlFor="cr-subject" hint="Profile id or bound .ai name" error={debounced && bundle.isError ? 'Profile not found' : null}>
          <Input id="cr-subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="font-mono" placeholder="e.g. 12 or alice.ai" />
        </Field>
        <Field label="Credential type" htmlFor="cr-type" hint={key ? `Key: ${key}` : 'e.g. hackathon-winner, audit-passed'} error={type && !key ? 'Cannot normalize' : null}>
          <Input id="cr-type" value={type} onChange={(e) => setType(e.target.value)} className="font-mono" />
        </Field>
      </div>
      {bundle.data ? (
        <p className="text-[13px] text-ink-2">
          Issuing to <strong>{bundle.data.profile.meta.data?.displayName ?? `profile #${bundle.data.profile.id}`}</strong> ·{' '}
          <AddressLink address={bundle.data.profile.owner} />
        </p>
      ) : null}
      <Field label="Title" htmlFor="cr-title">
        <Input id="cr-title" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. 1st place, Example Hackathon 2026" />
      </Field>
      <Field label="Description" htmlFor="cr-desc">
        <Textarea id="cr-desc" value={description} maxLength={800} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Criteria" htmlFor="cr-crit">
          <Input id="cr-crit" value={criteria} maxLength={500} onChange={(e) => setCriteria(e.target.value)} />
        </Field>
        <Field label="Evidence URL (https)" htmlFor="cr-ev">
          <Input id="cr-ev" value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} />
        </Field>
        <Field label="Expires (optional)" htmlFor="cr-exp" error={expiryBad ? 'Must be in the future' : null}>
          <Input id="cr-exp" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        </Field>
      </div>
      <ActionRunner
        label="Issue credential on-chain"
        disabled={!bundle.data || !key || !title.trim() || !!expiryBad}
        prepare={async () => {
          const { uri, hash } = await uploadMetadata('credential', { title, description, criteria, evidenceUrl })
          return {
            action: 'issueCredential',
            profileId: BigInt(bundle.data!.profile.id),
            credentialType: key!,
            metadataURI: uri,
            metadataHash: hash,
            expiresAt: BigInt(expiresAt),
          }
        }}
      />
    </div>
  )
}

function IssuerAdmin() {
  const issuers = useIssuers()
  const [addr, setAddr] = useState('')
  const [name, setName] = useState('')
  const [uri, setUri] = useState('')
  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Issuer wallet" htmlFor="ad-addr" error={addr && !isAddress(addr) ? 'Invalid address' : null}>
            <Input id="ad-addr" value={addr} onChange={(e) => setAddr(e.target.value.trim())} className="font-mono" placeholder="0x…" />
          </Field>
          <Field label="Organization name" htmlFor="ad-name">
            <Input id="ad-name" value={name} maxLength={64} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Info URL (optional)" htmlFor="ad-uri">
            <Input id="ad-uri" value={uri} maxLength={256} onChange={(e) => setUri(e.target.value)} placeholder="https://…" />
          </Field>
        </div>
        <Notice>
          Approve only organizations whose identity you verified out-of-band. Approval does not make their credentials true. It
          only makes them accountable as named issuers.
        </Notice>
        <ActionRunner
          label="Approve issuer"
          disabled={!isAddress(addr) || !name.trim()}
          prepare={async () => ({ action: 'setIssuer', issuer: addr as Address, approved: true, name: name.trim(), metadataURI: uri.trim() })}
        />
      </div>
      <ul className="divide-y divide-line rounded-md border border-line">
        {(issuers.data?.issuers ?? []).map((i) => (
          <li key={i.address} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[13px]">
            <span>
              <strong>{i.name}</strong> · <AddressLink address={i.address} /> ·{' '}
              {i.active ? `approved ${formatDate(i.approvedAt)}` : `removed ${formatDate(i.removedAt)}`}
            </span>
            {i.active ? (
              <ActionRunner compact variant="danger" label="Remove" prepare={async () => ({ action: 'setIssuer', issuer: i.address, approved: false, name: '', metadataURI: '' })} />
            ) : null}
          </li>
        ))}
        {issuers.data?.issuers.length === 0 ? <li className="px-3 py-2 text-[13px] text-ink-3">No issuers yet.</li> : null}
      </ul>
    </div>
  )
}

export default function CredentialsPage() {
  const { account } = useIdentity()
  const mine = useMyProfile()
  const issued = useIssued()
  const issuers = useIssuers()
  if (!account) return null

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Your credentials" description="Issued to your profile by approved organizations." />
        <CardBody className="space-y-3">
          {!account.profileId ? <Empty>No profile yet.</Empty> : !mine.data?.credentials.length ? <Empty>No credentials yet.</Empty> : null}
          {mine.data?.credentials.map((c) => <CredentialCard key={c.id} cred={c} />)}
        </CardBody>
      </Card>

      {account.isIssuer ? (
        <Card>
          <CardHeader title={`Issue a credential as ${account.issuer?.name ?? 'approved issuer'}`} description="Review the builder's evidence outside the protocol before issuing." />
          <CardBody>
            <IssueForm />
          </CardBody>
        </Card>
      ) : null}

      {issued.data?.credentials.length ? (
        <Card>
          <CardHeader title="Credentials you issued" />
          <CardBody className="space-y-3">
            {issued.data.credentials.map((c) => (
              <CredentialCard
                key={c.id}
                cred={c}
                actions={
                  !c.revoked ? (
                    <ActionRunner compact variant="danger" label="Revoke" prepare={async () => ({ action: 'revokeCredential', credentialId: BigInt(c.id) })} />
                  ) : null
                }
              />
            ))}
          </CardBody>
        </Card>
      ) : null}

      {account.isAdmin ? (
        <Card>
          <CardHeader title="Issuer allowlist (protocol admin)" description="Approve or remove organization issuer wallets." />
          <CardBody>
            <IssuerAdmin />
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader title="Approved issuers" description="Organizations the protocol admin has authorized to issue credentials." />
          <CardBody>
            <ul className="space-y-1 text-[13px]">
              {(issuers.data?.issuers ?? []).map((i) => (
                <li key={i.address}>
                  <strong>{i.name}</strong> · <AddressLink address={i.address} /> · {i.active ? 'active' : 'removed'}
                </li>
              ))}
              {issuers.data?.issuers.length === 0 ? <li className="text-ink-3">No issuers yet.</li> : null}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  )
}
