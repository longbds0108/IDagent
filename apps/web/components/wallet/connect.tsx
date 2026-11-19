'use client'

import Link from 'next/link'
import { useState } from 'react'
import { getAddress, isAddress } from 'viem'
import { useIdentity } from './identity'
import type { AccountInfo } from './identity'
import { getJson } from '@/lib/client-api'
import { shortAddress } from '@/lib/utils'

export function MainnetBadge() {
  return (
    <span className="sp-chip sp-chip--net" title="BNB Smart Chain mainnet, chain id 56">
      <i aria-hidden />
      BSC · 56
    </span>
  )
}

export function IdentityChip() {
  const { address, account, disconnect } = useIdentity()
  if (!address) {
    return (
      <Link href="/dashboard" className="sp-action sp-action--compact">
        <span>CONNECT</span>
        <span className="sp-action__icon" aria-hidden>
          ↗
        </span>
      </Link>
    )
  }
  return (
    <span className="sp-chip" title={account?.agentIdHeld ? 'Agent ID wallet' : 'Checking…'}>
      <i aria-hidden />
      <span>{shortAddress(address, 4)}</span>
      <button onClick={disconnect} aria-label="Disconnect">
        ✕
      </button>
    </span>
  )
}

/** The only way in: an Agentic Wallet address that holds a Binance Agent ID. */
export function ConnectPanel() {
  const { setAgentAddress } = useIdentity()
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function connect(e: React.FormEvent) {
    e.preventDefault()
    const addr = value.trim()
    if (!isAddress(addr)) return setError('Enter a valid 0x address.')
    setBusy(true)
    setError(null)
    try {
      const acct = await getJson<AccountInfo>(`/api/account/${getAddress(addr)}`)
      if (!acct.agentIdHeld) return setError('This wallet has no Agent ID. Claim one in the Binance App first.')
      setAgentAddress(addr)
    } catch {
      setError('Could not check this wallet. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="sp-panel mx-auto max-w-2xl p-6 sm:p-8">
      <p className="sp-label">CONNECT</p>
      <h2 className="sp-display mt-4 text-[clamp(2rem,4vw,3rem)]">Your Agent ID wallet</h2>
      <p className="mt-4 text-[15px] leading-relaxed text-ink-2">
        Only Binance Agent ID wallets can connect. Paste your Agentic Wallet address.
      </p>
      <form className="mt-8 space-y-3" onSubmit={connect}>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="0x… Agentic Wallet address"
          aria-label="Agentic Wallet address"
          className="box-field h-12 w-full px-4 font-mono text-[14px] focus:border-accent focus:outline-none"
        />
        {error ? <p className="text-[13px] text-bad">{error}</p> : null}
        <button
          type="submit"
          disabled={busy || !value.trim()}
          className="sp-action w-full disabled:opacity-40"
        >
          <span>{busy ? 'CHECKING…' : 'CONNECT'}</span>
          <span className="sp-action__icon" aria-hidden>
            ↗
          </span>
        </button>
      </form>
      <div className="mt-8 border-t border-line pt-5 text-[13px] leading-relaxed text-ink-3">
        <p>
          Find your address: ask your AI agent to run <code className="font-mono text-peer">baw wallet address --json</code>, then pick
          the BSC (56) entry.
        </p>
        <p className="mt-2">We never ask for keys, QR codes or passwords.</p>
      </div>
    </section>
  )
}
