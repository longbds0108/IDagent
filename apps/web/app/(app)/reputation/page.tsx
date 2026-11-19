import type { Metadata } from 'next'
import Link from 'next/link'
import { profileHref } from '@/components/builder-card'
import { ScoreChart } from '@/components/score-chart'
import { SectionHead } from '@/components/section-head'
import { Empty, Notice, PageHero } from '@/components/ui/card'
import { buttonClass } from '@/components/ui/button'
import { deployedContracts } from '@/lib/env'
import { optedInReputations, reputationFor } from '@/lib/insights'
import { resolveProfileId } from '@/lib/reads'
import { FORMULA_VERSION, type Component } from '@/lib/reputation'
import { cn, formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Reputation' }
export const dynamic = 'force-dynamic'

const COMPONENTS = [
  {
    key: 'evidence',
    name: 'Evidence',
    level: 'SELF-REPORTED',
    tone: 'text-self',
    label: '!text-self',
    bar: 'bg-[#b9b0c6]',
    rule: '10 pts per active project with hash-verified metadata, +2 per evidence reference (max 5). Max 5 projects.',
    caveat: 'Measures how much evidence was published, not whether it is true.',
  },
  {
    key: 'peer',
    name: 'Peer',
    level: 'PEER ATTESTED',
    tone: 'text-peer',
    label: '!text-peer',
    bar: 'bg-[#c39bf5]',
    rule: '20 pts per distinct signer × weight. Extra skills from the same signer add +0.25 each (max +0.5). Reciprocal pairs ×0.5. Signers without a profile ×0.8. Declined attestations excluded.',
    caveat: 'Dampening does not prove or rule out collusion between wallets.',
  },
  {
    key: 'issuer',
    name: 'Issuer',
    level: 'APPROVED ISSUER',
    tone: 'text-issuer',
    label: '!text-issuer',
    bar: 'bg-[#7db4ff]',
    rule: '40 pts for the first currently valid credential from each approved issuer, 10 pts for each further one from the same issuer.',
    caveat: 'Proves issuance by an approved organization, not factual infallibility.',
  },
] as const

function ScoreBlock({ c, comp }: { c: (typeof COMPONENTS)[number]; comp: Component }) {
  return (
    <div className="sp-panel sp-rule flex flex-col p-5">
      <div className="flex justify-between">
        <span className={cn('sp-label', c.label)}>{c.level}</span>
        <span className="sp-label">CAP 100</span>
      </div>
      <p className="sp-display mt-6 text-[2.2rem]">{c.name}</p>
      <p className={cn('mt-2 font-mono text-[3.4rem] leading-none tabular-nums', c.tone)}>
        {comp.score}
        {comp.raw > 100 ? <span className="ml-2 text-[0.9rem] text-ink-3">raw {comp.raw}</span> : null}
      </p>
      <div className="mt-4 h-1 bg-surface-2">
        <div className={cn('h-full', c.bar)} style={{ width: `${comp.score}%` }} />
      </div>
      <ul className="mt-5 divide-y divide-line border-t border-line">
        {comp.items.length === 0 ? <li className="py-3 text-[13px] text-ink-3">No contributing records.</li> : null}
        {comp.items.map((i) => (
          <li key={i.ref} className="flex items-start justify-between gap-3 py-3">
            <div className="min-w-0">
              <Link href={`/verify?q=${encodeURIComponent(i.ref)}`} className="text-[13.5px] underline decoration-line-strong underline-offset-4 hover:text-peer">
                {i.label}
              </Link>
              <p className="mt-0.5 font-mono text-[10.5px] text-ink-3">{i.detail}</p>
            </div>
            <span className="font-mono text-[13px] tabular-nums">+{i.points}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default async function ReputationPage({ searchParams }: { searchParams: Promise<{ profile?: string }> }) {
  const { profile: param } = await searchParams
  const configured = !!deployedContracts()

  if (param && configured) {
    const id = await resolveProfileId(param).catch(() => null)
    const data = id !== null ? await reputationFor(id).catch(() => null) : null
    if (!data) {
      return (
        <div className="py-16">
          <Notice tone="bad">No attested profile matches “{param}”.</Notice>
        </div>
      )
    }
    const name = data.profile.meta.data?.displayName ?? (data.profile.agentLabel ? `${data.profile.agentLabel}.ai` : `Builder #${data.profile.id}`)
    return (
      <div className="pb-10">
        <PageHero
          kicker={`// REPUTATION · FORMULA ${FORMULA_VERSION.toUpperCase()} · ${data.optedIn ? 'OPTED IN' : 'NOT OPTED IN'}`}
          title={name}
          lede={
            <>
              Three separate components, recomputed live from chain state. They are never added together into one trust score.{' '}
              <Link className="text-peer underline underline-offset-4" href={profileHref(data.profile)}>
                Open profile ↗
              </Link>
            </>
          }
          className="!pt-8 sm:!pt-12"
        />
        {!data.optedIn ? (
          <Notice className="mt-8">
            This builder has not opted in to having scores displayed. Every input is public on-chain, so anyone can recompute these
            numbers. attested shows them only on request, and keeps them out of listings.
          </Notice>
        ) : null}
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {COMPONENTS.map((c) => (
            <ScoreBlock key={c.key} c={c} comp={data.reputation[c.key]} />
          ))}
        </div>
        {data.declinedCount ? (
          <p className="sp-label mt-4 !normal-case !tracking-normal">
            {data.declinedCount} attestation{data.declinedCount === 1 ? '' : 's'} declined by the builder {data.declinedCount === 1 ? 'is' : 'are'} excluded. Declined
            attestations stay visible in the Verification Center.
          </p>
        ) : null}
        <section className="mt-14 space-y-5">
          <SectionHead kicker="// HISTORY · REPLAYED AT EVERY RECORDED CHANGE" title="How it got here" />
          <div className="sp-panel p-5">
            <ScoreChart points={data.history} />
          </div>
          <ol className="divide-y divide-line border-y border-line">
            {[...data.history].reverse().slice(0, 20).map((h, i) => (
              <li key={i} className="grid grid-cols-[110px_minmax(0,1fr)_auto] items-center gap-4 py-2.5">
                <span className="font-mono text-[11px] text-ink-3">{formatDate(h.t).toUpperCase()}</span>
                <span className="text-[13.5px]">{h.event}</span>
                <span className="font-mono text-[11px] tabular-nums">
                  <span className="text-self">{h.evidence}</span> · <span className="text-peer">{h.peer}</span> · <span className="text-issuer">{h.issuer}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    )
  }

  const rows = configured ? await optedInReputations().catch(() => null) : null
  return (
    <div className="pb-10">
      <PageHero
        kicker={`// REPUTATION · FORMULA ${FORMULA_VERSION.toUpperCase()} · OPT-IN`}
        title={
          <>
            A score you
            <br />
            can audit
          </>
        }
        lede="Reputation on attested is opt-in, published as a formula and split by source. Self-reported evidence, peer attestations and issuer credentials are scored separately and never merged into one number."
        className="!pt-8 sm:!pt-12"
      />
      <section className="mt-12 grid gap-4 lg:grid-cols-3">
        {COMPONENTS.map((c, i) => (
          <div key={c.key} className="sp-rule border-t border-line pt-5">
            <div className="flex justify-between">
              <span className={cn('font-mono text-[13px]', c.tone)}>{c.name.toUpperCase()}</span>
              <span className="sp-label">0{i + 1}</span>
            </div>
            <p className="mt-6 text-[14px] leading-relaxed text-ink">{c.rule}</p>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-3">{c.caveat}</p>
          </div>
        ))}
      </section>

      <section className="mt-16 space-y-4">
        <SectionHead
          kicker="// OPTED-IN BUILDERS"
          title="Scoreboard"
          note="Only builders who signed an opt-in in Settings appear here. Sorted by peer component; click a row for the full breakdown."
          action={
            <Link href="/dashboard/settings" className={buttonClass('secondary', 'sm')}>
              Opt in
            </Link>
          }
        />
        {rows === null ? <Notice tone="warn">Could not compute reputation right now.</Notice> : null}
        {rows && rows.length === 0 ? <Empty>No builders have opted in yet.</Empty> : null}
        {rows && rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className="border-b border-line text-left">
                  {['BUILDER', 'EVIDENCE', 'PEER', 'ISSUER', ''].map((h) => (
                    <th key={h} className="sp-label px-3 py-3 font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...rows]
                  .sort((a, b) => b.reputation.peer.score - a.reputation.peer.score)
                  .map((r) => (
                    <tr key={r.profile.id} className="border-b border-line transition-colors hover:bg-[rgba(155,93,229,0.05)]">
                      <td className="px-3 py-4">
                        <span className="text-[15px]">{r.profile.meta.data?.displayName ?? `#${r.profile.id}`}</span>
                        {r.profile.agentLabel ? <span className="ml-2 font-mono text-[11px] text-ink-3">{r.profile.agentLabel}.ai</span> : null}
                      </td>
                      <td className="px-3 py-4 font-mono text-self">{r.reputation.evidence.score}</td>
                      <td className="px-3 py-4 font-mono text-peer">{r.reputation.peer.score}</td>
                      <td className="px-3 py-4 font-mono text-issuer">{r.reputation.issuer.score}</td>
                      <td className="px-3 py-4 text-right">
                        <Link href={`/reputation?profile=${r.profile.id}`} className="font-mono text-[10.5px] uppercase tracking-[0.04em] text-peer underline underline-offset-4">
                          Breakdown ↗
                        </Link>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <form action="/reputation" className="sp-panel mt-10 grid gap-2 p-3 sm:grid-cols-[1fr_auto]">
        <input
          name="profile"
          placeholder="Look up any profile: id or name.ai"
          aria-label="Profile"
          className="h-11 border border-line-strong bg-[#120f17] px-3 font-mono text-[13px] focus:border-accent focus:outline-none"
        />
        <button className={buttonClass('primary', 'md')}>Show breakdown</button>
      </form>
    </div>
  )
}
