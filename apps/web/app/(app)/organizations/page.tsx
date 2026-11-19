import type { Metadata } from 'next'
import Link from 'next/link'
import { explorerAddressUrl } from '@skillproof/shared'
import { SectionHead } from '@/components/section-head'
import { Empty, Notice, PageHero, StatStrip } from '@/components/ui/card'
import { buttonClass } from '@/components/ui/button'
import { deployedContracts, publicEnv } from '@/lib/env'
import { organizations, type OrganizationSummary } from '@/lib/insights'
import { formatDate, shortAddress } from '@/lib/utils'

export const metadata: Metadata = { title: 'Organizations' }
export const dynamic = 'force-dynamic'

export default async function Organizations() {
  let orgs: OrganizationSummary[] = []
  let failed = !deployedContracts()
  if (!failed) {
    try {
      orgs = await organizations()
    } catch {
      failed = true
    }
  }
  const active = orgs.filter((o) => o.active)
  const removed = orgs.filter((o) => !o.active)

  return (
    <div className="pb-10">
      <PageHero
        kicker={`// ORGANIZATIONS · ${active.length} APPROVED ISSUER${active.length === 1 ? '' : 'S'}`}
        title={
          <>
            Who can
            <br />
            issue credentials
          </>
        }
        lede="Only admin-approved organizations can issue credentials."
        className="!pt-8 sm:!pt-12"
      />
      <StatStrip
        items={[
          { label: 'APPROVED NOW', value: active.length, tone: 'text-issuer' },
          { label: 'REMOVED', value: removed.length },
          { label: 'CREDENTIALS ISSUED', value: orgs.reduce((s, o) => s + o.issued, 0) },
          { label: 'CURRENTLY VALID', value: orgs.reduce((s, o) => s + o.valid, 0), tone: 'text-ok' },
        ]}
      />

      <section className="mt-14 space-y-4">
        <SectionHead kicker="// 01 · ALLOWLIST" title="Approved issuers" />
        {failed ? <Notice tone="warn">Could not read the issuer allowlist from BNB Smart Chain right now.</Notice> : null}
        {!failed && active.length === 0 ? <Empty>No organizations have been approved yet.</Empty> : null}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {active.map((o, i) => (
            <OrgCard key={o.address} o={o} index={i + 1} />
          ))}
        </div>
      </section>

      {removed.length ? (
        <section className="mt-14 space-y-4">
          <SectionHead kicker="// 02 · HISTORY" title="Removed issuers" note="Their credentials no longer count as valid, but stay visible and verifiable." />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {removed.map((o, i) => (
              <OrgCard key={o.address} o={o} index={i + 1} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-14 grid gap-4 md:grid-cols-3">
        {(
          [
            ['01', 'APPLY', 'An organization shares its issuing wallet, name and public info page with the protocol admin, out of band.'],
            ['02', 'APPROVAL', 'The admin calls setIssuer on CredentialRegistry. Approval and removal are public on-chain events.'],
            ['03', 'ISSUE & REVOKE', 'The issuer reviews evidence outside the protocol, then issues or revokes from the Dashboard → Credentials tab.'],
          ] as const
        ).map(([n, t, d]) => (
          <div key={n} className="sp-rule border-t border-line pt-5">
            <div className="flex justify-between">
              <span className="font-mono text-[13px]">{t}</span>
              <span className="sp-label">{n}</span>
            </div>
            <p className="mt-6 text-[14px] leading-relaxed text-ink-2">{d}</p>
          </div>
        ))}
      </section>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/dashboard/credentials" className={buttonClass('secondary', 'md')}>
          Issuer & admin tools
        </Link>
        {deployedContracts() ? (
          <a href={explorerAddressUrl(deployedContracts()!.credentialRegistry, publicEnv.explorerUrl)} target="_blank" rel="noreferrer" className={buttonClass('ghost', 'md')}>
            CredentialRegistry on BscScan ↗
          </a>
        ) : null}
      </div>
    </div>
  )
}

function OrgCard({ o, index }: { o: OrganizationSummary; index: number }) {
  return (
    <Link
      href={`/organizations/${o.address}`}
      className="sp-panel sp-rule group flex flex-col p-5 [background:radial-gradient(circle_at_85%_0%,rgba(63,145,255,0.12),transparent_40%),linear-gradient(160deg,rgba(21,32,48,0.6),rgba(19,17,23,0.72))]"
    >
      <div className="flex justify-between">
        <span className="sp-label">ORG {String(index).padStart(2, '0')}</span>
        <span className={`sp-label flex items-center gap-1.5 ${o.active ? '!text-ok' : '!text-warn'}`}>
          <i className={`size-1.5 rounded-full ${o.active ? 'bg-ok' : 'bg-warn'}`} aria-hidden />
          {o.active ? 'APPROVED' : 'REMOVED'}
        </span>
      </div>
      <p className="sp-display mt-8 text-[2.2rem] group-hover:text-issuer">{o.name || 'Unnamed issuer'}</p>
      <p className="mt-2 font-mono text-[11.5px] text-ink-3">{shortAddress(o.address, 6)}</p>
      <dl className="mt-8 grid grid-cols-3 border-t border-line">
        {(
          [
            ['ISSUED', o.issued, ''],
            ['VALID', o.valid, 'text-ok'],
            ['REVOKED', o.revoked, o.revoked ? 'text-bad' : ''],
          ] as const
        ).map(([k, v, tone], i) => (
          <div key={k} className={`pt-3 ${i ? 'border-l border-line pl-3' : ''}`}>
            <dt className="sp-label">{k}</dt>
            <dd className={`mt-1 text-right font-mono text-[1.3rem] ${tone}`}>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="sp-label mt-4">
        {o.active ? `SINCE ${formatDate(o.approvedAt).toUpperCase()}` : `REMOVED ${formatDate(o.removedAt).toUpperCase()}`}
      </p>
    </Link>
  )
}
