'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { TextScramble } from './text-scramble'

export function PrinciplesGrid({ items }: { items: readonly (readonly [string, string, string])[] }) {
  const [runs, setRuns] = useState<Record<string, number>>({})
  return (
    <div className="sp-principles__grid">
      {items.map(([n, title, body]) => (
        <article key={n} onPointerEnter={() => setRuns((r) => ({ ...r, [n]: (r[n] ?? 0) + 1 }))}>
          <span>{n}</span>
          <h3>
            <TextScramble text={title.toUpperCase()} replayKey={runs[n] ?? 0} />
          </h3>
          <p>{body}</p>
        </article>
      ))}
    </div>
  )
}

export function FaqList({ items }: { items: readonly { q: string; a: ReactNode }[] }) {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <div className="sp-faq__list">
      {items.map((item, i) => {
        const isOpen = open === i
        return (
          <article key={item.q} className={`sp-faq__item ${isOpen ? 'is-open' : ''}`}>
            <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : i)}>
              <TextScramble text={item.q} />
              <span aria-hidden>{isOpen ? '−' : '+'}</span>
            </button>
            <div className="sp-faq__answer">
              <div>
                <p>{item.a}</p>
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}

/** Fades children up once they enter the viewport. */
export function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setShown(true)
          io.disconnect()
        }
      },
      { threshold: 0.15 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={ref} className={`sp-reveal ${shown ? 'is-shown' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  )
}
