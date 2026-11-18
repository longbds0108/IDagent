import type { Metadata } from 'next'
import { normalizeKey } from '@skillproof/shared'
import { BuilderCard } from '@/components/builder-card'
import { Empty, PageHero } from '@/components/ui/card'
import { buttonClass } from '@/components/ui/button'
import { deployedContracts } from '@/lib/env'
import { listBuilderSummaries } from '@/lib/reads'

export const metadata: Metadata = { title: 'Explore builders' }
export const dynamic = 'force-dynamic'

type Sort = 'peer' | 'credentials' | 'projects' | 'newest'

export default async function Builders({ searchParams }: { searchParams: Promise<{ q?: string; skill?: string; sort?: string; peer?: string }> }) {
  const sp = await searchParams
  const q = (sp.q ?? '').trim().toLowerCase()
  const skill = sp.skill ? normalizeKey(sp.skill) : null
  const sort = (['peer', 'credentials', 'projects', 'newest'].includes(sp.sort ?? '') ? sp.sort : 'peer') as Sort
  const onlyPeer = sp.peer === '1'

  if (!deployedContracts()) {
    return (
      <div className="py-12">
        <Empty>Contracts are not configured for this deployment.</Empty>
      </div>
    )
  }
  let all: Awaited<ReturnType<typeof listBuilderSummaries>> = []
  let failed = false
  try {
    all = await listBuilderSummaries()
  } catch {
    failed = true
  }
  const qKey = q ? normalizeKey(q) : null
  const results = all
    .filter((s) => {
      const m = s.profile.meta.data
      if (q) {
        const hay = [m?.displayName, m?.bio, s.profile.agentLabel, s.profile.agentLabel && `${s.profile.agentLabel}.ai`, s.profile.owner, ...(m?.skills ?? [])]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q) && !(qKey && (m?.skills ?? []).includes(qKey))) return false
      }
      if (skill && !(m?.skills ?? []).includes(skill) && !s.peerSkills[skill]) return false
      if (onlyPeer && (skill ? !s.peerSkills[skill] : s.activePeer === 0)) return false
      return true
    })
    .sort((a, b) => {
      if (sort === 'newest') return Number(b.profile.id) - Number(a.profile.id)
      if (sort === 'projects') return b.activeProjects - a.activeProjects
      if (sort === 'credentials') return b.validCredentials - a.validCredentials
      const ap = skill ? (a.peerSkills[skill] ?? 0) : a.activePeer
      const bp = skill ? (b.peerSkills[skill] ?? 0) : b.activePeer
      return bp - ap
    })

  const skillCounts = new Map<string, number>()
  for (const s of all) for (const k of s.profile.meta.data?.skills ?? []) skillCounts.set(k, (skillCounts.get(k) ?? 0) + 1)
  const topSkills = [...skillCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)

  return (
    <div className="pb-10">
      <PageHero
        kicker={`// EXPLORE · ${all.length} PROFILE${all.length === 1 ? '' : 'S'} · LIVE FROM BSC`}
        title={
          <>
            Builders
            <br />
            on the record
          </>
        }
        lede="Every profile here was registered by an Agent ID holder. Counts show active records only, split by who vouched for them."
        className="!pt-8 sm:!pt-12"
      />

      <form className="sp-panel mt-8 grid gap-2 p-3 sm:grid-cols-[1fr_200px_200px_auto]">
        <input
          name="q"
          defaultValue={sp.q ?? ''}
          placeholder="Name, .ai, address or skill"
          aria-label="Search"
          className="h-11 border border-line-strong bg-[#120f17] px-3 text-sm focus:border-accent focus:outline-none"
        />
        <input
          name="skill"
          defaultValue={sp.skill ?? ''}
          placeholder="Skill filter"
          aria-label="Skill filter"
          className="h-11 border border-line-strong bg-[#120f17] px-3 font-mono text-sm focus:border-accent focus:outline-none"
        />
        <select name="sort" defaultValue={sort} aria-label="Sort" className="h-11 border border-line-strong bg-[#120f17] px-2 font-mono text-[12px] uppercase">
          <option value="peer">Most peer-attested</option>
          <option value="credentials">Most issuer credentials</option>
          <option value="projects">Most projects</option>
          <option value="newest">Newest</option>
        </select>
        <div className="flex items-center gap-3">
          <label className="sp-label flex items-center gap-1.5 whitespace-nowrap">
            <input type="checkbox" name="peer" value="1" defaultChecked={onlyPeer} className="accent-[var(--accent)]" /> PEER ONLY
          </label>
          <button className={buttonClass('primary', 'md')}>Apply</button>
        </div>
      </form>

      {topSkills.length ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          <span className="sp-label mr-2 self-center">// SKILLS</span>
          {topSkills.map(([k, n]) => (
            <a
              key={k}
              href={`/builders?skill=${encodeURIComponent(k)}`}
              className={`border px-2 py-1 font-mono text-[11.5px] transition-colors ${skill === k ? 'border-accent bg-accent text-accent-ink' : 'border-line text-ink-2 hover:border-accent hover:text-peer'}`}
            >
              {k} <span className="opacity-60">{n}</span>
            </a>
          ))}
        </div>
      ) : null}

      <div className="mt-8">
        {failed ? (
          <Empty>Could not read the registry from BNB Smart Chain right now. Refresh in a moment.</Empty>
        ) : all.length === 0 ? (
          <Empty>No profiles yet. Be the first: an Agent ID is all you need.</Empty>
        ) : results.length === 0 ? (
          <Empty>No builders match these filters.</Empty>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((s) => (
              <BuilderCard key={s.profile.id} s={s} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
