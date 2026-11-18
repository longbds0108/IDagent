'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { explorerAddressUrl, LIMITATIONS } from '@skillproof/shared'
import { deployedContracts, isLocalRpc, publicEnv } from '@/lib/env'
import { IdentityChip, MainnetBadge } from './wallet/connect'

const NAV = [
  ['/builders', 'BUILDERS'],
  ['/verify', 'VERIFY'],
  ['/dashboard', 'DASHBOARD'],
] as const

export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <rect x="1.5" y="1.5" width="21" height="21" rx="5" fill="currentColor" />
      <path d="M7 12.5l3 3 7-7.5" fill="none" stroke="#17141b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="18.5" cy="18.5" r="2.6" fill="#9b5de5" />
    </svg>
  )
}

export function SiteHeader() {
  const path = usePathname()
  const active = NAV.findIndex(([href]) => path === href || path.startsWith(`${href}/`))
  return (
    <>
      <header className="sp-header sp-header--app sp-header--dark">
        <Link href="/" className="sp-header__brand" aria-label="SkillProof home">
          <BrandMark />
          <span>SkillProof</span>
        </Link>
        <nav className="sp-nav sp-nav--3" aria-label="Main" style={{ ['--sp-nav-index' as string]: Math.max(active, 0) }}>
          <span className={`sp-nav__pill ${active < 0 ? 'is-hidden' : ''}`} aria-hidden />
          {NAV.map(([href, label], i) => (
            <Link key={href} href={href} className={i === active ? 'is-active' : undefined} aria-current={i === active ? 'page' : undefined}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="sp-header__right">
          <MainnetBadge />
          <IdentityChip />
        </div>
      </header>
      {isLocalRpc ? (
        <div className="sp-demo-banner">DEMO MODE · READING A LOCAL MIRROR OF BNB SMART CHAIN · EXPLORER LINKS WILL NOT RESOLVE LOCAL TXS</div>
      ) : null}
    </>
  )
}

export function SiteFooter() {
  const c = deployedContracts()
  const entries: [string, string][] = [
    ...(c
      ? ([
          ['PROFILES', c.profileRegistry],
          ['PROJECTS', c.projectRegistry],
          ['ATTESTATIONS', c.attestationRegistry],
          ['CREDENTIALS', c.credentialRegistry],
        ] as [string, string][])
      : []),
    ['AGENT ID', publicEnv.agentId],
  ]
  return (
    <footer className="sp-app-footer">
      <div className="sp-app-footer__grid">
        <div>
          <h4>// WHAT RECORDS DO NOT PROVE</h4>
          <ul>
            {LIMITATIONS.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4>// NAVIGATE</h4>
          <ul>
            <li><Link href="/">HOME</Link></li>
            {NAV.map(([href, label]) => (
              <li key={href}><Link href={href}>{label}</Link></li>
            ))}
          </ul>
        </div>
        <div>
          <h4>// CONTRACTS · BSC 56</h4>
          <ul>
            {entries.map(([k, a]) => (
              <li key={k}>
                <a href={explorerAddressUrl(a, publicEnv.explorerUrl)} target="_blank" rel="noreferrer">
                  {k} ↗ <span style={{ opacity: 0.5 }}>{a.slice(0, 6)}…{a.slice(-4)}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="sp-app-footer__wordmark" aria-hidden>
        SKILLPROOF
      </div>
      <div className="sp-app-footer__bottom">
        <span>© 2026 SKILLPROOF</span>
        <span>BUILT ON BNB SMART CHAIN</span>
        <span>NOT AFFILIATED WITH BINANCE OR BNB CHAIN</span>
      </div>
    </footer>
  )
}
