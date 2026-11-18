import type { ReactNode } from 'react'

/** Section heading: mono kicker on the right, Fraunces title on the left (the landing "principles" heading). */
export function SectionHead({ kicker, title, note, action }: { kicker: string; title: ReactNode; note?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3 border-b border-line pb-4">
      <div className="min-w-0">
        <h2 className="font-display text-[clamp(1.8rem,3.4vw,2.8rem)] font-semibold leading-none">{title}</h2>
        {note ? <p className="mt-3 max-w-2xl text-[13.5px] text-ink-2">{note}</p> : null}
      </div>
      <div className="flex items-center gap-4">
        {action}
        <span className="sp-label !text-accent">{kicker}</span>
      </div>
    </div>
  )
}
