'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { WagmiProvider, type State } from 'wagmi'
import { wagmiConfig } from '@/lib/wagmi'
import { IdentityProvider } from '@/components/wallet/identity'
import { ToastProvider } from '@/components/toast'

export function Providers({ children, initialState }: { children: ReactNode; initialState?: State }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, retry: 1 } } }))
  return (
    <WagmiProvider config={wagmiConfig} initialState={initialState}>
      <QueryClientProvider client={qc}>
        <IdentityProvider>
          <ToastProvider>{children}</ToastProvider>
        </IdentityProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
