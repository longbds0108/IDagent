'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

const NAV = [
  ['records', 'RECORDS'],
  ['protocol', 'PROTOCOL'],
  ['faq', 'FAQ'],
  ['start', 'START'],
] as const

/** Floating pill header that flips dark/light with the section beneath it and tracks the active section. */
export function LandingHeader() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [active, setActive] = useState(-1)

  useEffect(() => {
    let queued = false
    const update = () => {
      queued = false
      const line = 112
      const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-header-theme]'))
      const hit = sections.filter((s) => {
        const r = s.getBoundingClientRect()
        return r.top <= line && r.bottom > line
      })
      const current = hit[hit.length - 1] ?? sections[0]
      setTheme(current?.dataset.headerTheme === 'light' ? 'light' : 'dark')
      setActive(NAV.findIndex(([id]) => id === current?.dataset.nav))
    }
    const onScroll = () => {
      if (queued) return
      queued = true
      requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  return (
    <header className={`sp-header sp-header--${theme}`}>
      <Link href="/" className="sp-header__brand" aria-label="SkillProof home">
        <svg viewBox="0 0 24 24" aria-hidden>
          <rect x="1.5" y="1.5" width="21" height="21" rx="5" fill="currentColor" />
          <path d="M7 12.5l3 3 7-7.5" fill="none" stroke="var(--sp-header-bg-solid)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="18.5" cy="18.5" r="2.6" fill="#9b5de5" />
        </svg>
        <span>SkillProof</span>
      </Link>
      <nav className="sp-nav" aria-label="Sections" style={{ ['--sp-nav-index' as string]: Math.max(active, 0) }}>
        <span className={`sp-nav__pill ${active < 0 ? 'is-hidden' : ''}`} aria-hidden />
        {NAV.map(([id, label], i) => (
          <a key={id} href={`#${id}`} className={i === active ? 'is-active' : undefined}>
            {label}
          </a>
        ))}
      </nav>
      <div className="sp-header__right">
        <Link href="/builders" className="sp-header__link">
          BUILDERS
        </Link>
        <Link href="/verify" className="sp-header__link">
          VERIFY
        </Link>
        <Link href="/dashboard" className="sp-action sp-action--compact">
          <span>DASHBOARD</span>
          <span className="sp-action__icon" aria-hidden>
            ↗
          </span>
        </Link>
      </div>
    </header>
  )
}
