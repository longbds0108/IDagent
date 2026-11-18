'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getAddress, isAddress, type Address } from 'viem'
import { useAccount, useDisconnect } from 'wagmi'
import { useQuery } from '@tanstack/react-query'

export type IdentityMode = 'wallet' | 'agent'

export interface AccountInfo {
  address: Address
  agentIdHeld: boolean
  profileId: string | null
  isIssuer: boolean
  issuer: { name: string; active: boolean } | null
  isAdmin: boolean
}

interface IdentityCtx {
  mode: IdentityMode | null
  address: Address | null
  account: AccountInfo | null
  accountLoading: boolean
  accountError: string | null
  setAgentAddress: (a: string | null) => void
  agentAddress: Address | null
  preferAgent: (v: boolean) => void
  signOut: () => void
}

const Ctx = createContext<IdentityCtx | null>(null)
const KEY = 'skillproof.agentWallet'

/**
 * "Acting identity" for the dashboard. Either a connected browser wallet (signs itself) or an
 * Agentic Wallet address the user typed in (read-only here; writes are prepared as calldata
 * for the user's own AI agent). The agent address is a per-browser convenience in
 * localStorage — it is not a login, grants nothing, and is never sent anywhere but public RPC reads.
 */
export function IdentityProvider({ children }: { children: ReactNode }) {
  const { address: walletAddress, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const [agentAddress, setAgent] = useState<Address | null>(null)
  const [agentPreferred, setAgentPreferred] = useState(false)

  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY)
      if (v && isAddress(v)) {
        setAgent(getAddress(v))
        setAgentPreferred(true)
      }
    } catch {
      /* storage unavailable */
    }
  }, [])

  const setAgentAddress = useCallback((a: string | null) => {
    const v = a && isAddress(a) ? getAddress(a) : null
    setAgent(v)
    setAgentPreferred(!!v)
    try {
      if (v) localStorage.setItem(KEY, v)
      else localStorage.removeItem(KEY)
    } catch {
      /* ignore */
    }
  }, [])

  const mode: IdentityMode | null =
    agentPreferred && agentAddress ? 'agent' : isConnected && walletAddress ? 'wallet' : agentAddress ? 'agent' : null
  const address = mode === 'agent' ? agentAddress : mode === 'wallet' ? (walletAddress ?? null) : null

  const q = useQuery({
    queryKey: ['account', address],
    enabled: !!address,
    queryFn: async () => {
      const r = await fetch(`/api/account/${address}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Failed to load account')
      return j as AccountInfo
    },
  })

  const value = useMemo<IdentityCtx>(
    () => ({
      mode,
      address,
      account: q.data ?? null,
      accountLoading: q.isLoading,
      accountError: q.error ? (q.error as Error).message : null,
      setAgentAddress,
      agentAddress,
      preferAgent: setAgentPreferred,
      signOut: () => {
        if (mode === 'wallet') disconnect()
        else setAgentAddress(null)
      },
    }),
    [mode, address, q.data, q.isLoading, q.error, setAgentAddress, agentAddress, disconnect],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useIdentity() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useIdentity outside IdentityProvider')
  return v
}
