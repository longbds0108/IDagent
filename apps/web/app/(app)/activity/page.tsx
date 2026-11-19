import type { Metadata } from 'next'
import Link from 'next/link'
import { TxLink } from '@/components/links'
import { Empty, Notice, PageHero, StatStrip } from '@/components/ui/card'
import { buttonClass } from '@/components/ui/button'
import { deployedContracts } from '@/lib/env'
import { activityFeed, type ActivityItem, type ActivityKind } from '@/lib/insights'
import { cn, shortAddress } from '@/lib/utils'

export const metadata: Metadata = { title: 'Activity' }
export const dynamic = 'force-dynamic'

const KINDS: [ActivityKind | 'all', string][] = [
  ['all', 'ALL'],
  ['profile', 'PROFILES'],
  ['project', 'PROJECTS'],
  ['attestation', 'ATTESTATIONS'],
  ['credential', 'CREDENTIALS'],
  ['issuer', 'ISSUERS'],
]
const KIND_TONE: Record<ActivityKind, string> = {
  profile: 'text-ink',
  project: 'text-self',
  attestation: 'text-peer',
  credential: 'text-issuer',
  issuer: 'text-ok',
}
const PAGE = 40

function when(t: number) {
  if (!t) return '—'
  const d = new Date(t * 1000)
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`
}

export default async function Activity({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; action?: string; q?: string; page?: string }>
}) {
  const sp = await searchParams
  const type = (KINDS.some(([k]) => k === sp.type) ? sp.type : 'all') as ActivityKind | 'all'
  const action = sp.action === 'revoked' ? 'revoked' : sp.action === 'created' ? 'created' : 'all'
  const q = (sp.q ?? '').trim().toLowerCase()
  const page = Math.max(1, Number(sp.page) || 1)

  let feed: ActivityItem[] = []
  let failed = !deployedContracts()
  if (!failed) {
    try {
      feed = await activityFeed()
    } catch {
      failed = true
    }
  }
  const filtered = feed.filter((e) => {
    if (type !== 'all' && e.kind !== type) return false
    if (action === 'revoked' && !['revoked', 'removed'].includes(e.action)) return false
    if (action === 'created' && ['revoked', 'removed'].includes(e.action)) return false
    if (q) {
      const hay = `${e.title} ${e.actor ?? ''} ${e.profileId ? `#${e.profileId} profile:${e.profileId}` : ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE))
  const shown = filtered.slice((page - 1) * PAGE, page * PAGE)
  const qs = (o: Record<string, string | number>) => {
    const p = new URLSearchParams({ ...(type !== 'all' ? { type } : {}), ...(action !== 'all' ? { action } : {}), ...(q ? { q } : {}) })
    for (const [k, v] of Object.entries(o)) {
      if (v === '' || v === 'all' || v === 1) p.delete(k)
      else p.set(k, String(v))
    }
    const s = p.toString()
    return s ? `/activity?${s}` : '/activity'
  }

  return (
    <div className="pb-10">
      <PageHero
        kicker="// ACTIVITY · RECONSTRUCTED FROM CONTRACT STATE"
        title={
          <>
            Everything
            <br />
            that happened
          </>
        }
        lede="Every contract event, newest first."
        className="!pt-8 sm:!pt-12"
      />
      <StatStrip
        items={[
          { label: 'EVENTS', value: feed.length },
          { label: 'PROFILES', value: feed.filter((e) => e.kind === 'profile' && e.action === 'created').length },
          { label: 'ATTESTATIONS', value: feed.filter((e) => e.kind === 'attestation' && e.action === 'issued').length, tone: 'text-peer' },
          { label: 'REVOCATIONS', value: feed.filter((e) => e.action === 'revoked').length, tone: 'text-bad' },
        ]}
      />

      <div className="mt-8 flex flex-wrap items-center gap-1.5">
        {KINDS.map(([k, l]) => (
          <Link
            key={k}
            href={qs({ type: k, page: 1 })}
            className={cn(
              'border px-2.5 py-1.5 font-mono text-[11px] tracking-[0.04em] transition-colors',
              type === k ? 'border-accent bg-accent text-accent-ink' : 'border-line text-ink-2 hover:border-accent hover:text-peer',
            )}
          >
            {l}
          </Link>
        ))}
        <span className="mx-2 h-5 w-px bg-line" aria-hidden />
        {(['all', 'created', 'revoked'] as const).map((a) => (
          <Link
            key={a}
            href={qs({ action: a, page: 1 })}
            className={cn('px-2 py-1.5 font-mono text-[11px] tracking-[0.04em]', action === a ? 'text-ink underline decoration-accent underline-offset-4' : 'text-ink-3 hover:text-ink')}
          >
            {a === 'all' ? 'ANY ACTION' : a === 'created' ? 'CREATED' : 'REVOKED'}
          </Link>
        ))}
      </div>
      <form className="sp-panel mt-3 grid gap-2 p-3 sm:grid-cols-[1fr_auto]" action="/activity">
        {type !== 'all' ? <input type="hidden" name="type" value={type} /> : null}
        {action !== 'all' ? <input type="hidden" name="action" value={action} /> : null}
        <input
          name="q"
          defaultValue={sp.q ?? ''}
          placeholder="Filter by address, profile:12, name or skill"
          aria-label="Filter activity"
          className="h-11 border border-line-strong bg-[#120f17] px-3 font-mono text-[13px] focus:border-accent focus:outline-none"
        />
        <button className={buttonClass('primary', 'md')}>Filter</button>
      </form>

      <div className="mt-6">
        {failed ? <Notice tone="warn">Could not read activity from BNB Smart Chain right now.</Notice> : null}
        {!failed && shown.length === 0 ? <Empty>{feed.length ? 'No events match these filters.' : 'No on-chain activity yet.'}</Empty> : null}
        {shown.length ? (
          <ol className="divide-y divide-line border-y border-line">
            {shown.map((e) => (
              <li key={e.key} className="grid gap-x-6 gap-y-1 py-4 md:grid-cols-[170px_190px_minmax(0,1fr)_auto] md:items-center">
                <span className="font-mono text-[11px] text-ink-3">{when(e.t)}</span>
                <span className={cn('font-mono text-[10.5px] uppercase tracking-[0.05em]', KIND_TONE[e.kind])}>
                  {e.kind} · {e.action}
                </span>
                <span className="min-w-0 text-[14px]">
                  {e.title}
                  {e.actor ? <span className="ml-2 font-mono text-[11px] text-ink-3">{shortAddress(e.actor)}</span> : null}
                </span>
                <span className="flex flex-wrap gap-x-4 gap-y-1">
                  {e.tx && e.block ? <TxLink kind={e.tx.kind} id={e.tx.id} block={e.block} label="Tx" /> : null}
                  {e.verify ? (
                    <Link
                      href={`/verify?q=${encodeURIComponent(e.verify)}`}
                      className="font-mono text-[10.5px] uppercase tracking-[0.04em] text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-peer"
                    >
                      Verify
                    </Link>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
        {pages > 1 ? (
          <div className="mt-6 flex items-center justify-between font-mono text-[11px]">
            {page > 1 ? <Link className={buttonClass('secondary', 'sm')} href={qs({ page: page - 1 })}>← Newer</Link> : <span />}
            <span className="text-ink-3">PAGE {page} / {pages}</span>
            {page < pages ? <Link className={buttonClass('secondary', 'sm')} href={qs({ page: page + 1 })}>Older →</Link> : <span />}
          </div>
        ) : null}
        <p className="sp-label mt-6 !normal-case !tracking-normal">
          Profile updates show the latest version only; every intermediate version is still visible as events in the Verification Center.
        </p>
      </div>
    </div>
  )
}
