'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Address } from 'viem'

export interface AccountInfo {
  address: Address
  agentIdHeld: boolean
  profileId: string | null
  isIssuer: boolean
  issuer: { name: string; active: boolean } | null
  isAdmin: boolean
}

interface IdentityCtx {
  /** The signed-in Agentic Wallet (from the session cookie), or null. */
  address: Address | null
  agentAddress: Address | null
  account: AccountInfo | null
  accountLoading: boolean
  accountError: string | null
  sessionLoading: boolean
  disconnect: () => void
}

const Ctx = createContext<IdentityCtx | null>(null)

/**
 * The connected identity is a session cookie set after the user signs a login message with their
 * Agentic Wallet. The server checks the Agent ID again on every sign-in. The browser keeps no keys.
 */
export function IdentityProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const session = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const r = await fetch('/api/auth/session', { cache: 'no-store' })
      return (await r.json()) as { address: Address | null }
    },
    staleTime: 60_000,
  })
  const address = session.data?.address ?? null

  const account = useQuery({
    queryKey: ['account', address],
    enabled: !!address,
    queryFn: async () => {
      const r = await fetch(`/api/account/${address}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Could not load account')
      return j as AccountInfo
    },
  })

  const value = useMemo<IdentityCtx>(
    () => ({
      address,
      agentAddress: address,
      account: account.data ?? null,
      accountLoading: account.isLoading,
      accountError: account.error ? (account.error as Error).message : null,
      sessionLoading: session.isLoading,
      disconnect: () => {
        void fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
        qc.setQueryData(['session'], { address: null })
        qc.removeQueries({ queryKey: ['account'] })
      },
    }),
    [address, account.data, account.isLoading, account.error, session.isLoading, qc],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useIdentity() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useIdentity outside IdentityProvider')
  return v
}
