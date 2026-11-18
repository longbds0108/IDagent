'use client'

import { useEffect, useRef, useState } from 'react'

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#+*.'

/** Text that resolves left-to-right from random glyphs when it scrolls into view (or on replay). */
export function TextScramble({ text, replayKey }: { text: string; replayKey?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [state, setState] = useState({ display: text, resolved: text.length })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setState({ display: text, resolved: text.length })
      return
    }
    let frame = 0
    const run = () => {
      cancelAnimationFrame(frame)
      const duration = Math.max(520, Math.min(820, text.length * 18))
      const start = performance.now()
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / duration)
        const settled = Math.floor(p * text.length)
        const display = Array.from(text)
          .map((ch, i) => (ch === ' ' || i < settled ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]))
          .join('')
        setState({ display, resolved: settled })
        if (p < 1) frame = requestAnimationFrame(tick)
        else setState({ display: text, resolved: text.length })
      }
      frame = requestAnimationFrame(tick)
    }
    let io: IntersectionObserver | null = null
    if (replayKey && replayKey > 0) run()
    else {
      io = new IntersectionObserver(
        ([e]) => {
          if (!e?.isIntersecting) return
          io?.disconnect()
          run()
        },
        { threshold: 0.35 },
      )
      io.observe(el)
    }
    return () => {
      io?.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [text, replayKey])

  return (
    <span ref={ref} className="sp-scramble" aria-label={text}>
      <span className="sp-scramble__measure" aria-hidden>
        {text}
      </span>
      <span className="sp-scramble__visual" aria-hidden>
        {Array.from(state.display).map((ch, i) => (
          <span key={i} className={i >= state.resolved && ch !== ' ' ? 'sp-scramble__pending' : undefined}>
            {ch}
          </span>
        ))}
      </span>
    </span>
  )
}
