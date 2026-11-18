import { createConfig, http, injected } from 'wagmi'
import { bscMainnet as bsc } from '@skillproof/shared'
import { publicEnv } from './env'

/**
 * Browser wallets only (EIP-1193 / EIP-6963 injected providers). No WalletConnect / QR pairing:
 * the Agent ID hackathon forbids third-party QR or pairing-code logins for Agentic Wallet,
 * and Agentic Wallet users act through their own AI agent instead (see ActionRunner).
 */
export const wagmiConfig = createConfig({
  chains: [bsc],
  connectors: [injected({ shimDisconnect: true })],
  transports: { [bsc.id]: http(publicEnv.rpcUrl) },
  ssr: true,
})

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig
  }
}
