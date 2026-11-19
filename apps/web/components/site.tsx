'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { explorerAddressUrl, LIMITATIONS } from '@skillproof/shared'
import { deployedContracts, isLocalRpc, publicEnv } from '@/lib/env'
import { IdentityChip, MainnetBadge } from './wallet/connect'

const NAV = [
  ['/builders', 'BUILDERS'],
  ['/organizations', 'ORGS'],
  ['/activity', 'ACTIVITY'],
  ['/reputation', 'REPUTATION'],
  ['/verify', 'VERIFY'],
  ['/dashboard', 'DASHBOARD'],
] as const

export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={className}>
      <rect x="2" y="2" width="60" height="60" rx="14" fill="#111015" stroke="#2a2438" strokeWidth="2" />
      <path d="M17 33.5 27.5 44 47 23" fill="none" stroke="#f4f2f7" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="46" cy="46" r="6" fill="#9b5de5" stroke="#111015" strokeWidth="3" />
    </svg>
  )
}

export function SiteHeader() {
  const path = usePathname()
  const active = NAV.findIndex(([href]) => path === href || path.startsWith(`${href}/`) || (href === '/dashboard' && path === '/settings'))
  return (
    <>
      <header className="sp-header sp-header--app sp-header--dark">
        <Link href="/" className="sp-header__brand" aria-label="attested home">
          <img src="/attested-logo.png" alt="attested" className="sp-header__logo" />
        </Link>
        <nav className="sp-nav sp-nav--app" aria-label="Main" style={{ ['--sp-nav-index' as string]: Math.max(active, 0), ['--sp-nav-n' as string]: NAV.length }}>
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
        attested
      </div>
      <div className="sp-app-footer__bottom">
        <span>© 2026 attested</span>
        <span>BUILT ON BNB SMART CHAIN</span>
        <span>NOT AFFILIATED WITH BINANCE OR BNB CHAIN</span>
      </div>
    </footer>
  )
}
