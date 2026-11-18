'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { Notice, PageHero } from '@/components/ui/card'
import { ChainGuard, ConnectPanel } from '@/components/wallet/connect'
import { useIdentity } from '@/components/wallet/identity'
import { deployedContracts } from '@/lib/env'
import { cn, shortAddress } from '@/lib/utils'

const tabs = [
  ['/dashboard', '01', 'OVERVIEW'],
  ['/dashboard/projects', '02', 'PROJECTS'],
  ['/dashboard/endorsements', '03', 'ENDORSEMENTS'],
  ['/dashboard/credentials', '04', 'CREDENTIALS'],
] as const

export function DashboardShell({ children }: { children: ReactNode }) {
  const { address, mode, account, accountLoading, accountError } = useIdentity()
  const path = usePathname()

  if (!deployedContracts()) {
    return (
      <div className="py-12">
        <Notice tone="warn">Contracts are not configured for this deployment (see .env.example).</Notice>
      </div>
    )
  }

  if (!address) {
    return (
      <div className="pb-10">
        <PageHero
          kicker="// DASHBOARD · CHOOSE HOW YOU ACT"
          title={
            <>
              Step onto
              <br />
              the record
            </>
          }
          lede="Public pages work without connecting anything. To write, pick the path that matches your wallet."
          className="!pt-8 sm:!pt-12"
        />
        <div className="mt-10">
          <ConnectPanel />
        </div>
      </div>
    )
  }

  const roles = [
    account?.agentIdHeld ? 'AGENT ID HOLDER' : null,
    account?.isIssuer ? `ISSUER · ${account.issuer?.name?.toUpperCase() ?? ''}` : null,
    account?.isAdmin ? 'PROTOCOL ADMIN' : null,
  ].filter(Boolean)

  return (
    <div className="pb-10">
      <PageHero
        kicker={`// DASHBOARD · ${mode === 'agent' ? 'AGENTIC WALLET VIA YOUR AI AGENT' : 'BROWSER WALLET'}`}
        title="Dashboard"
        className="!pt-8 !pb-8 sm:!pt-12"
        aside={
          <div className="sp-panel min-w-[260px] p-4 font-mono text-[12px]">
            <p className="sp-label">// ACTING AS</p>
            <p className="mt-2 text-[15px]">{shortAddress(address, 6)}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {accountLoading ? <span className="sp-label">READING CHAIN…</span> : null}
              {roles.map((r) => (
                <span key={r} className="border border-peer/40 bg-peer-bg px-1.5 py-0.5 text-[10px] text-peer">
                  {r}
                </span>
              ))}
              {!accountLoading && account && !account.agentIdHeld ? (
                <span className="border border-bad/40 bg-bad-bg px-1.5 py-0.5 text-[10px] text-bad">NO AGENT ID</span>
              ) : null}
            </div>
          </div>
        }
      />
      <nav className="mt-2 flex gap-1 overflow-x-auto border-b border-line" aria-label="Dashboard sections">
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
        <ChainGuard />
        {accountError ? <Notice tone="bad">Could not read account state: {accountError}</Notice> : null}
        {!accountLoading && account && !account.agentIdHeld ? (
          <Notice tone="bad">
            <strong>No Agent ID found for this address on BNB Smart Chain.</strong> Creating a profile, adding projects and signing
            attestations require the sending address to hold an Agent ID (checked on-chain with{' '}
            <code className="font-mono">balanceOf</code> on the official contract). Claim one in the Binance App under Wallet → Agent
            ID, then use that Agentic Wallet address. Approved issuers can still issue credentials.
          </Notice>
        ) : null}
        {children}
      </div>
    </div>
  )
}
