import { trustLevels, type TrustLevel } from '@skillproof/shared'
import { cn } from '@/lib/utils'

const styles: Record<TrustLevel, string> = {
  self: 'text-self bg-self-bg border-self/35 border-dashed',
  peer: 'text-peer bg-peer-bg border-peer/45',
  issuer: 'text-issuer bg-issuer-bg border-issuer/45',
}

function Glyph({ level }: { level: TrustLevel }) {
  // Distinct shapes, so trust levels never rely on colour alone.
  if (level === 'self')
    return (
      <svg aria-hidden viewBox="0 0 12 12" className="size-3">
        <circle cx="6" cy="6" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1.6" />
      </svg>
    )
  if (level === 'peer')
    return (
      <svg aria-hidden viewBox="0 0 12 12" className="size-3">
        <circle cx="4.2" cy="6" r="3" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="7.8" cy="6" r="3" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    )
  return (
    <svg aria-hidden viewBox="0 0 12 12" className="size-3">
      <path d="M6 1.2 10.2 3v3.1c0 2.4-1.8 4-4.2 4.7C3.6 10.1 1.8 8.5 1.8 6.1V3z" fill="currentColor" />
    </svg>
  )
}

export function TrustBadge({ level, className }: { level: TrustLevel; className?: string }) {
  const t = trustLevels[level]
  return (
    <span
      title={`${t.label}. Proves: ${t.proves} Does not prove: ${t.doesNotProve}`}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 border px-2 py-[3px] font-mono text-[10px] font-medium uppercase tracking-[0.05em]',
        styles[level],
        className,
      )}
    >
      <Glyph level={level} />
      {t.label}
    </span>
  )
}

type Status = 'active' | 'superseded' | 'revoked' | 'valid' | 'expired' | 'issuer-inactive' | 'none' | 'pending'
const statusStyle: Record<Status, string> = {
  active: 'text-ok [--dot:var(--ok)]',
  valid: 'text-ok [--dot:var(--ok)]',
  pending: 'text-warn [--dot:var(--warn)]',
  superseded: 'text-ink-3 [--dot:var(--ink-3)] line-through decoration-1',
  revoked: 'text-bad [--dot:var(--bad)]',
  expired: 'text-bad [--dot:var(--bad)]',
  'issuer-inactive': 'text-warn [--dot:var(--warn)]',
  none: 'text-ink-3 [--dot:var(--ink-3)]',
}
const statusText: Record<Status, string> = {
  active: 'Active',
  valid: 'Currently valid',
  pending: 'Pending',
  superseded: 'Superseded',
  revoked: 'Revoked',
  expired: 'Expired',
  'issuer-inactive': 'Issuer no longer approved',
  none: 'Unknown',
}

export function StatusPill({ status }: { status: Status }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.05em]', statusStyle[status])}>
      <i className="size-1.5 rounded-full bg-[var(--dot)] shadow-[0_0_8px_var(--dot)]" aria-hidden />
      {statusText[status]}
    </span>
  )
}

export function MetaStatusNote({ status }: { status: string }) {
  if (status === 'verified') return <span className="text-[12px] text-ink-3">Metadata hash matches on-chain record</span>
  if (status === 'none') return null
  const text: Record<string, string> = {
    mismatch: 'Metadata does NOT match the on-chain hash — ignore its content',
    unavailable: 'Metadata unavailable — only the on-chain hash is known',
    invalid: 'Metadata matches hash but does not follow the SkillProof schema',
  }
  return <span className="text-[12px] font-medium text-bad">{text[status] ?? status}</span>
}
