import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getAddress, isAddress } from 'viem'
import { explorerAddressUrl } from '@skillproof/shared'
import { CredentialCard } from '@/components/records'
import { SectionHead } from '@/components/section-head'
import { Empty, PageHero, StatStrip } from '@/components/ui/card'
import { publicEnv } from '@/lib/env'
import { organizations, subjectNames } from '@/lib/insights'
import { formatDate } from '@/lib/utils'

export const dynamic = 'force-dynamic'

async function load(address: string) {
  if (!isAddress(address)) return null
  const all = await organizations().catch(() => [])
  return all.find((o) => o.address.toLowerCase() === getAddress(address).toLowerCase()) ?? null
}

export async function generateMetadata({ params }: { params: Promise<{ address: string }> }): Promise<Metadata> {
  const o = await load((await params).address)
  return { title: o ? o.name : 'Organization not found' }
}

export default async function OrganizationPage({ params }: { params: Promise<{ address: string }> }) {
  const o = await load((await params).address)
  if (!o) notFound()
  const subjects = await subjectNames(o.credentials.map((c) => c.subjectProfileId))
  return (
    <div className="pb-10">
      <PageHero
        kicker={`// ORGANIZATION · ${o.active ? 'APPROVED ISSUER' : 'REMOVED FROM ALLOWLIST'}`}
        title={o.name || 'Unnamed issuer'}
        lede={
          <span className="font-mono text-[13px]">
            <a className="underline decoration-line-strong underline-offset-4 hover:text-peer" href={explorerAddressUrl(o.address, publicEnv.explorerUrl)} target="_blank" rel="noreferrer">
              {o.address} ↗
            </a>
            {o.metadataURI ? (
              <>
                {' · '}
                <a className="underline decoration-line-strong underline-offset-4 hover:text-peer" href={o.metadataURI} target="_blank" rel="noreferrer nofollow">
                  INFO ↗
                </a>
              </>
            ) : null}
          </span>
        }
        className="!pt-8 sm:!pt-12"
      />
      <StatStrip
        items={[
          { label: 'STATUS', value: o.active ? 'APPROVED' : 'REMOVED', tone: o.active ? 'text-ok' : 'text-warn' },
          { label: 'SINCE', value: formatDate(o.approvedAt) },
          { label: 'ISSUED', value: o.issued },
          { label: 'VALID NOW', value: o.valid, tone: 'text-issuer' },
        ]}
      />
      <section className="mt-14 space-y-4">
        <SectionHead kicker="// CREDENTIALS ISSUED" title="Credentials" note="Every credential this wallet issued, including revoked and expired ones." />
        {o.credentials.length === 0 ? <Empty>This issuer has not issued any credentials yet.</Empty> : null}
        {[...o.credentials].reverse().map((c) => {
          const s = subjects.get(c.subjectProfileId)
          return (
            <div key={c.id} className="space-y-2">
              <p className="sp-label">
                ISSUED TO{' '}
                <Link className="!text-ink underline underline-offset-4 hover:!text-peer" href={`/p/${c.subjectProfileId}`}>
                  {s?.meta.data?.displayName ?? (s?.agentLabel ? `${s.agentLabel}.ai` : `PROFILE #${c.subjectProfileId}`)}
                </Link>
              </p>
              <CredentialCard cred={c} />
            </div>
          )
        })}
      </section>
    </div>
  )
}
