'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { PreferenceSigner, usePreferences } from '@/components/dashboard/pref-signer'
import { useMyProfile } from '@/components/dashboard/hooks'
import { BindLabel } from '@/components/dashboard/profile-form'
import { profileHref } from '@/components/builder-card'
import { Card, CardBody, CardHeader, Notice } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useIdentity } from '@/components/wallet/identity'
import { formatDate, shortAddress as shortAddr } from '@/lib/utils'

type Toggles = { reputationOptIn: boolean; hideFromExplore: boolean; hideSocialLinks: boolean; hideAvatar: boolean }
const TOGGLES: [keyof Toggles, string, string][] = [
  ['reputationOptIn', 'Show my reputation', 'List my three reputation components on the Reputation page. Inputs are public on-chain either way.'],
  ['hideFromExplore', 'Hide me from Explore', 'Leave my profile out of Builders listings and search. Direct links and verification keep working.'],
  ['hideSocialLinks', 'Hide social links', 'Do not show website / GitHub / X / LinkedIn links on my public profile page.'],
  ['hideAvatar', 'Hide avatar', 'Show a generated identicon instead of my avatar image.'],
]

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2.5">
      <dt className="text-ink-3">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  )
}

export default function SettingsPage() {
  const { address, account, agentAddress, disconnect } = useIdentity()
  const prefs = usePreferences(address)
  const bundle = useMyProfile()
  const [t, setT] = useState<Toggles>({ reputationOptIn: false, hideFromExplore: false, hideSocialLinks: false, hideAvatar: false })
  useEffect(() => {
    if (prefs.data) setT({ reputationOptIn: prefs.data.reputationOptIn, hideFromExplore: prefs.data.hideFromExplore, hideSocialLinks: prefs.data.hideSocialLinks, hideAvatar: prefs.data.hideAvatar })
  }, [prefs.data])
  if (!address || !account) return null
  const dirty = prefs.data ? (Object.keys(t) as (keyof Toggles)[]).some((k) => t[k] !== prefs.data![k]) : false

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-5">
        <Card>
          <CardHeader
            index="01"
            title="Privacy & presentation"
            description="Signed by your wallet. Only changes how your profile looks."
          />
          <CardBody className="space-y-1">
            {TOGGLES.map(([key, title, help]) => (
              <label key={key} className="flex cursor-pointer items-start justify-between gap-6 border-b border-line py-4 last:border-0">
                <span>
                  <span className="font-mono text-[12px] uppercase tracking-[0.05em]">{title}</span>
                  <span className="mt-1 block text-[13px] leading-relaxed text-ink-2">{help}</span>
                </span>
                <span className="relative mt-1 inline-flex shrink-0">
                  <input type="checkbox" className="peer sr-only" checked={t[key]} onChange={(e) => setT({ ...t, [key]: e.target.checked })} />
                  <span className="h-6 w-11 border border-line-strong bg-[#120f17] transition-colors peer-checked:border-accent peer-checked:bg-accent/25" />
                  <span className="absolute left-1 top-1 size-4 bg-ink-3 transition-transform peer-checked:translate-x-5 peer-checked:bg-accent" />
                </span>
              </label>
            ))}
            <div className="pt-4">
              <PreferenceSigner
                label={dirty ? 'Sign & save preferences' : prefs.data?.signed ? 'Saved' : 'No changes'}
                disabled={!dirty}
                build={(cur) => ({ ...cur, ...t })}
              />
              {prefs.data?.signed ? (
                <p className="sp-label mt-3 !normal-case !tracking-normal">Last signed {new Date(prefs.data.issuedAt * 1000).toUTCString()}</p>
              ) : null}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader index="02" title="Profile" description="Profile content lives on-chain as a hash; edits publish a new version." />
          <CardBody className="space-y-5">
            {account.profileId && bundle.data ? (
              <>
                <div className="flex flex-wrap gap-3">
                  <Link href="/dashboard" className="sp-action sp-action--compact">
                    <span>EDIT PROFILE</span>
                    <span className="sp-action__icon" aria-hidden>↗</span>
                  </Link>
                  <Link href={profileHref(bundle.data.profile)} className="self-center font-mono text-[11px] uppercase tracking-[0.04em] text-peer underline underline-offset-4">
                    Public page ↗
                  </Link>
                </div>
                {!bundle.data.profile.agentLabel ? <BindLabel /> : <p className="text-[13.5px] text-ink-2">.ai name bound on-chain: <span className="font-mono text-peer">{bundle.data.profile.agentLabel}.ai</span></p>}
                <Notice>
                  Profiles cannot be deleted. Projects, attestations and credentials can be revoked, and the revocation stays visible
                  in history.
                </Notice>
              </>
            ) : (
              <Notice>No profile yet. Create one on the Overview tab.</Notice>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <CardHeader index="03" title="Account status" />
          <CardBody>
            <dl className="divide-y divide-line border-y border-line font-mono text-[12px]">
              <Row k="ADDRESS" v={<span className="break-all">{address}</span>} />
              <Row k="AGENT ID" v={<span className={account.agentIdHeld ? 'text-ok' : 'text-bad'}>{account.agentIdHeld ? 'HELD' : 'NOT HELD'}</span>} />
              <Row k="PROFILE" v={account.profileId ? `#${account.profileId}` : '—'} />
              <Row k="ISSUER" v={account.isIssuer ? account.issuer?.name ?? 'YES' : 'NO'} />
              <Row k="PROTOCOL ADMIN" v={account.isAdmin ? 'YES' : 'NO'} />
              {bundle.data ? <Row k="MEMBER SINCE" v={formatDate(bundle.data.profile.createdAt).toUpperCase()} /> : null}
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader index="04" title="Connection" />
          <CardBody className="space-y-4 text-[13.5px] text-ink-2">
            <p>
              Connected as <span className="font-mono text-ink">{agentAddress ? shortAddr(agentAddress) : '—'}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => disconnect()}>
                Disconnect
              </Button>
            </div>
            <p className="text-[12.5px] text-ink-3">We never store keys, QR codes, pairing codes or sessions.</p>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
