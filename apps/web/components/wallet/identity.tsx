'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getAddress, isAddress, type Address } from 'viem'
import { useQuery } from '@tanstack/react-query'

export interface AccountInfo {
  address: Address
  agentIdHeld: boolean
  profileId: string | null
  isIssuer: boolean
  issuer: { name: string; active: boolean } | null
  isAdmin: boolean
}

interface IdentityCtx {
  /** Only Binance Agent ID wallets (Agentic Wallets) can connect. */
  address: Address | null
  account: AccountInfo | null
  accountLoading: boolean
  accountError: string | null
  setAgentAddress: (a: string | null) => void
  agentAddress: Address | null
  disconnect: () => void
}

const Ctx = createContext<IdentityCtx | null>(null)
const KEY = 'attested.agentWallet'

/**
 * The connected identity is one Binance Agent ID wallet address. It is remembered in this browser only
 * (not a login, no keys, no sessions) and is checked against the chain every time it loads.
 */
export function IdentityProvider({ children }: { children: ReactNode }) {
  const [agentAddress, setAgent] = useState<Address | null>(null)

  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY)
      if (v && isAddress(v)) setAgent(getAddress(v))
    } catch {
      /* storage unavailable */
    }
  }, [])

  const setAgentAddress = useCallback((a: string | null) => {
    const v = a && isAddress(a) ? getAddress(a) : null
    setAgent(v)
    try {
      if (v) localStorage.setItem(KEY, v)
      else localStorage.removeItem(KEY)
    } catch {
      /* ignore */
    }
  }, [])

  const q = useQuery({
    queryKey: ['account', agentAddress],
    enabled: !!agentAddress,
    queryFn: async () => {
      const r = await fetch(`/api/account/${agentAddress}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Could not load account')
      return j as AccountInfo
    },
  })

  // A remembered address that no longer holds an Agent ID is dropped.
  useEffect(() => {
    if (agentAddress && q.data && !q.data.agentIdHeld) setAgentAddress(null)
  }, [agentAddress, q.data, setAgentAddress])

  const value = useMemo<IdentityCtx>(
    () => ({
      address: agentAddress,
      account: q.data ?? null,
      accountLoading: q.isLoading,
      accountError: q.error ? (q.error as Error).message : null,
      setAgentAddress,
      agentAddress,
      disconnect: () => setAgentAddress(null),
    }),
    [agentAddress, q.data, q.isLoading, q.error, setAgentAddress],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useIdentity() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useIdentity outside IdentityProvider')
  return v
}
