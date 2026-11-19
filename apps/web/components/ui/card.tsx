import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('sp-panel', className)} {...props} />
}

export function CardHeader({
  title,
  description,
  action,
  index,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  index?: string
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6', className)}>
      <div className="min-w-0">
        <h2 className="font-mono text-[12px] font-medium uppercase tracking-[0.06em] text-ink">
          {index ? <span className="mr-2 text-ink-3">{index}</span> : null}
          {title}
        </h2>
        {description ? <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-ink-2">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-5 sm:px-6', className)} {...props} />
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="box-empty px-4 py-10 text-center">
      <p className="sp-label mb-2">EMPTY</p>
      <div className="text-[14px] text-ink-2">{children}</div>
    </div>
  )
}

export function Notice({
  tone = 'info',
  children,
  className,
}: {
  tone?: 'info' | 'warn' | 'bad' | 'ok'
  children: ReactNode
  className?: string
}) {
  const tones = {
    info: 'bg-surface-2/70 text-ink-2 border-l-line-strong',
    warn: 'bg-warn-bg text-warn border-l-warn',
    bad: 'bg-bad-bg text-bad border-l-bad',
    ok: 'bg-ok-bg text-ok border-l-ok',
  }
  return <div className={cn('rounded-[14px] border-l-2 px-4 py-3 text-[13.5px] leading-relaxed', tones[tone], className)}>{children}</div>
}

/** Page hero in the landing's display style: mono kicker, huge tight headline, lede, optional aside. */
export function PageHero({
  kicker,
  title,
  lede,
  aside,
  className,
}: {
  kicker: string
  title: ReactNode
  lede?: ReactNode
  aside?: ReactNode
  className?: string
}) {
  return (
    <section className={cn('sp-enter grid gap-8 border-b border-line pb-10 pt-14 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end', className)}>
      <div className="min-w-0">
        <p className="sp-label">{kicker}</p>
        <h1 className="sp-display mt-5 text-[clamp(3rem,7.5vw,7rem)]">{title}</h1>
        {lede ? <div className="mt-6 max-w-2xl text-[16px] leading-relaxed text-ink-2">{lede}</div> : null}
      </div>
      {aside ? <div className="min-w-0">{aside}</div> : null}
    </section>
  )
}

/** Row of mono stat cells divided by hairlines (the landing "card rows"). */
export function StatStrip({ items, className }: { items: { label: string; value: ReactNode; tone?: string }[]; className?: string }) {
  return (
    <dl className={cn('grid border-y border-line', className)} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((it, i) => (
        <div key={it.label} className={cn('px-3 py-4 sm:px-5', i > 0 && 'border-l border-line')}>
          <dt className="sp-label">{it.label}</dt>
          <dd className={cn('mt-2 font-mono text-[clamp(1.2rem,2.4vw,2rem)] tabular-nums', it.tone)}>{it.value}</dd>
        </div>
      ))}
    </dl>
  )
}
