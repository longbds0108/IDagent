import Link from 'next/link'
import type { BuilderSummary } from '@/lib/reads'
import { shortAddress } from '@/lib/utils'
import { Avatar } from './avatar'

export function profileHref(p: { id: string; agentLabel: string }) {
  return p.agentLabel ? `/p/${encodeURIComponent(p.agentLabel)}.ai` : `/p/${p.id}`
}

/** Compact version of the landing's record card. */
export function BuilderCard({ s }: { s: BuilderSummary }) {
  const p = s.profile
  const name = p.meta.data?.displayName ?? (p.agentLabel ? `${p.agentLabel}.ai` : `Profile #${p.id}`)
  const skills = p.meta.data?.skills ?? []
  return (
    <Link href={profileHref(p)} className="sp-panel sp-rule group flex flex-col p-5 transition-colors hover:border-line-strong">
      <div className="flex items-center justify-between">
        <span className="sp-label">#{p.id.padStart(3, '0')}</span>
        <span className={`sp-label flex items-center gap-1.5 ${p.agentIdHeld ? '!text-ink-2' : '!text-bad'}`}>
          <i className={`size-1.5 rounded-full ${p.agentIdHeld ? 'bg-ok shadow-[0_0_8px_var(--ok)]' : 'bg-bad'}`} aria-hidden />
          {p.agentIdHeld ? 'AGENT ID' : 'NO AGENT ID'}
        </span>
      </div>
      <div className="mt-6 flex items-center gap-4">
        <Avatar url={p.meta.data?.avatarUrl} seed={p.owner} size={52} />
        <div className="min-w-0">
          <p className="sp-display truncate text-[2rem] group-hover:text-peer">{name}</p>
          <p className="mt-1.5 truncate font-mono text-[11.5px] text-ink-3">{p.agentLabel ? `${p.agentLabel}.ai` : shortAddress(p.owner)}</p>
        </div>
      </div>
      {p.meta.data?.bio ? <p className="mt-4 line-clamp-2 text-[13.5px] leading-relaxed text-ink-2">{p.meta.data.bio}</p> : null}
      {skills.length ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {skills.slice(0, 6).map((k) => (
            <span key={k} className="border border-line px-1.5 py-0.5 font-mono text-[11px] text-ink-2">
              {k}
              {s.peerSkills[k] ? <span className="ml-1 text-peer">×{s.peerSkills[k]}</span> : null}
            </span>
          ))}
        </div>
      ) : null}
      <dl className="mt-auto grid grid-cols-3 border-t border-line pt-0 [&:not(:first-child)]:mt-6">
        {(
          [
            ['SELF', s.activeProjects, 'text-self'],
            ['PEER', s.activePeer, 'text-peer'],
            ['ISSUER', s.validCredentials, 'text-issuer'],
          ] as const
        ).map(([k, v, tone], i) => (
          <div key={k} className={`pt-3 ${i > 0 ? 'border-l border-line pl-3' : ''}`}>
            <dt className="sp-label">{k}</dt>
            <dd className={`mt-1 text-right font-mono text-[1.3rem] tabular-nums ${tone}`}>{v}</dd>
          </div>
        ))}
      </dl>
    </Link>
  )
}
