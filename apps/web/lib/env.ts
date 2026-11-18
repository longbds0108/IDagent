import type { Address } from 'viem'
import { getAddress, isAddress } from 'viem'
import { BSC_CHAIN_ID, DEFAULT_EXPLORER_URL, DEFAULT_RPC_URL, OFFICIAL_AGENT_ID_ADDRESS } from '@skillproof/shared'

function addr(v: string | undefined): Address | null {
  return v && isAddress(v) ? getAddress(v) : null
}

/** Public (client-safe) configuration. NEXT_PUBLIC_* values are inlined at build time. */
export const publicEnv = {
  chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? BSC_CHAIN_ID),
  rpcUrl: process.env.NEXT_PUBLIC_BSC_RPC_URL || DEFAULT_RPC_URL,
  explorerUrl: process.env.NEXT_PUBLIC_EXPLORER_URL || DEFAULT_EXPLORER_URL,
  agentId: addr(process.env.NEXT_PUBLIC_AGENT_ID_ADDRESS) ?? getAddress(OFFICIAL_AGENT_ID_ADDRESS),
  contracts: {
    profileRegistry: addr(process.env.NEXT_PUBLIC_PROFILE_REGISTRY),
    projectRegistry: addr(process.env.NEXT_PUBLIC_PROJECT_REGISTRY),
    attestationRegistry: addr(process.env.NEXT_PUBLIC_ATTESTATION_REGISTRY),
    credentialRegistry: addr(process.env.NEXT_PUBLIC_CREDENTIAL_REGISTRY),
  },
  deployBlock: BigInt(process.env.NEXT_PUBLIC_DEPLOY_BLOCK || '0'),
}

export type DeployedContracts = {
  profileRegistry: Address
  projectRegistry: Address
  attestationRegistry: Address
  credentialRegistry: Address
}

export function deployedContracts(): DeployedContracts | null {
  const c = publicEnv.contracts
  if (!c.profileRegistry || !c.projectRegistry || !c.attestationRegistry || !c.credentialRegistry) return null
  return c as DeployedContracts
}

/** True when the RPC points at a local node (e.g. an anvil fork used for the demo). */
export const isLocalRpc = /localhost|127\.0\.0\.1/.test(publicEnv.rpcUrl)

if (publicEnv.chainId !== BSC_CHAIN_ID) {
  throw new Error(`SkillProof only supports BNB Smart Chain mainnet (56); NEXT_PUBLIC_CHAIN_ID=${publicEnv.chainId}`)
}
