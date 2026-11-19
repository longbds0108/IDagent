'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { IdentityProvider } from '@/components/wallet/identity'
import { ToastProvider } from '@/components/toast'

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, retry: 1 } } }))
  return (
    <QueryClientProvider client={qc}>
      <IdentityProvider>
        <ToastProvider>{children}</ToastProvider>
      </IdentityProvider>
    </QueryClientProvider>
  )
}
