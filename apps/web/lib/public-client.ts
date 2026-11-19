'use client'

import { createPublicClient, http } from 'viem'
import { bscMainnet } from '@skillproof/shared'
import { publicEnv } from './env'

/** Read-only BNB Smart Chain client used to confirm transactions in the browser. */
export const publicClient = createPublicClient({
  chain: { ...bscMainnet, rpcUrls: { default: { http: [publicEnv.rpcUrl] } } },
  transport: http(publicEnv.rpcUrl, { timeout: 15_000 }),
})
