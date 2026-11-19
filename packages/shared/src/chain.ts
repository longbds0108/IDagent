import { defineChain } from 'viem'

/** BNB Smart Chain mainnet is the ONLY supported network for Attested writes. */
export const BSC_CHAIN_ID = 56 as const
export const BSC_CHAIN_ID_HEX = '0x38' as const
export const DEFAULT_RPC_URL = 'https://bsc-dataseed.bnbchain.org'
export const DEFAULT_EXPLORER_URL = 'https://bscscan.com'

/**
 * Official Agent ID contract on BNB Smart Chain (chain 56), as published in the Binance
 * Agent ID Hackathon announcement. Verified on-chain 2026-11-18: name "SPACE ID Agent ID",
 * symbol "AI", ERC-165 reports ERC-721 (not ERC721Enumerable). Re-verify before deployment.
 */
export const OFFICIAL_AGENT_ID_ADDRESS = '0x60b9262456de011f7d15a54cdd8c48baaa8b022f' as const

export function explorerTxUrl(hash: string, base = DEFAULT_EXPLORER_URL) {
  return `${base.replace(/\/$/, '')}/tx/${hash}`
}
export function explorerAddressUrl(address: string, base = DEFAULT_EXPLORER_URL) {
  return `${base.replace(/\/$/, '')}/address/${address}`
}
export function explorerBlockUrl(block: bigint | number, base = DEFAULT_EXPLORER_URL) {
  return `${base.replace(/\/$/, '')}/block/${block.toString()}`
}


/** BNB Smart Chain mainnet definition (kept local to avoid bundling every viem chain). */
export const bscMainnet = defineChain({
  id: BSC_CHAIN_ID,
  name: 'BNB Smart Chain',
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  rpcUrls: { default: { http: [DEFAULT_RPC_URL] } },
  blockExplorers: { default: { name: 'BscScan', url: DEFAULT_EXPLORER_URL } },
  contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11', blockCreated: 15921452 } },
})
