'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { Notice } from '@/components/ui/card'
import { ConnectPanel } from '@/components/wallet/connect'
import { useIdentity } from '@/components/wallet/identity'
import { deployedContracts } from '@/lib/env'
import { cn, shortAddress } from '@/lib/utils'

const tabs = [
  ['/dashboard', '01', 'OVERVIEW'],
  ['/dashboard/projects', '02', 'PROJECTS'],
  ['/dashboard/endorsements', '03', 'ENDORSEMENTS'],
  ['/dashboard/credentials', '04', 'CREDENTIALS'],
  ['/dashboard/settings', '05', 'SETTINGS'],
] as const

export function DashboardShell({ children }: { children: ReactNode }) {
  const { address, account, accountLoading, accountError } = useIdentity()
  const path = usePathname()

  if (!deployedContracts()) {
    return (
      <div className="py-12">
        <Notice tone="warn">Contracts are not set up for this site.</Notice>
      </div>
    )
  }

  if (!address) {
    return (
      <div className="pb-10 pt-8 sm:pt-12">
        <p className="sp-label">DASHBOARD</p>
        <h1 className="sp-display mt-4 text-[clamp(2.6rem,6vw,5rem)]">Connect to start</h1>
        <p className="mt-4 max-w-xl text-[15px] text-ink-2">Use your Agent ID wallet. Browsing works without connecting.</p>
        <div className="mt-10">
          <ConnectPanel />
        </div>
      </div>
    )
  }

  const roles = [
    account?.agentIdHeld ? 'AGENT ID' : null,
    account?.isIssuer ? `ISSUER · ${account.issuer?.name?.toUpperCase() ?? ''}` : null,
    account?.isAdmin ? 'ADMIN' : null,
  ].filter(Boolean)

  return (
    <div className="pb-10">
      <div className="sp-enter flex flex-wrap items-end justify-between gap-6 border-b border-line pb-8 pt-8 sm:pt-12">
        <div>
          <p className="sp-label">DASHBOARD</p>
          <h1 className="sp-display mt-4 text-[clamp(2.6rem,6vw,5rem)]">Dashboard</h1>
        </div>
        <div className="sp-panel min-w-[240px] p-4 font-mono text-[12px]">
          <p className="sp-label">CONNECTED AS</p>
          <p className="mt-2 text-[15px]">{shortAddress(address, 6)}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {accountLoading ? <span className="sp-label">LOADING…</span> : null}
            {roles.map((r) => (
              <span key={r} className="border border-peer/40 bg-peer-bg px-1.5 py-0.5 text-[10px] text-peer">
                {r}
              </span>
            ))}
          </div>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-b border-line" aria-label="Dashboard sections">
        {tabs.map(([href, n, label]) => (
          <Link
            key={href}
            href={href}
            aria-current={path === href ? 'page' : undefined}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 px-4 py-3.5 font-mono text-[11px] tracking-[0.05em] transition-colors',
              path === href ? 'border-accent text-ink' : 'border-transparent text-ink-3 hover:text-ink',
            )}
          >
            <span className={cn('mr-2', path === href ? 'text-peer' : 'text-ink-3')}>{n}</span>
            {label}
          </Link>
        ))}
      </nav>
      <div className="mt-8 space-y-5">
        {accountError ? <Notice tone="bad">Could not load your account. Refresh and try again.</Notice> : null}
        {children}
      </div>
    </div>
  )
}
