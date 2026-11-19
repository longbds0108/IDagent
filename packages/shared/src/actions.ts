import { encodeFunctionData, isAddress, isHex, type Abi, type Address, type Hex } from 'viem'
import {
  credentialRegistryAbi,
  projectEvidenceRegistryAbi,
  skillAttestationAbi,
  skillProfileRegistryAbi,
} from './abis'
import { BSC_CHAIN_ID } from './chain'
import { keyToBytes32 } from './keys'

export interface ContractAddresses {
  profileRegistry: Address
  projectRegistry: Address
  attestationRegistry: Address
  credentialRegistry: Address
}

/**
 * Every state-changing attested action, described as data. The same description drives
 * (a) wagmi `writeContract` for injected wallets and (b) calldata for an Agentic Wallet,
 * whose AI agent submits it with `baw contract-call preview` and the user confirms in the
 * Binance App. attested never signs, stores sessions or handles pairing codes.
 */
export type SkillProofAction =
  | { action: 'createProfile'; agentLabel: string; metadataURI: string; metadataHash: Hex }
  | { action: 'updateProfile'; metadataURI: string; metadataHash: Hex }
  | { action: 'bindAgentLabel'; agentLabel: string }
  | { action: 'addProject'; profileId: bigint; metadataURI: string; evidenceHash: Hex }
  | { action: 'supersedeProject'; projectId: bigint; metadataURI: string; evidenceHash: Hex }
  | { action: 'revokeProject'; projectId: bigint }
  | { action: 'attest'; profileId: bigint; projectId: bigint; skill: string; metadataHash: Hex }
  | { action: 'revokeAttestation'; attestationId: bigint }
  | {
      action: 'issueCredential'
      profileId: bigint
      credentialType: string
      metadataURI: string
      metadataHash: Hex
      expiresAt: bigint
    }
  | { action: 'revokeCredential'; credentialId: bigint }
  | { action: 'setIssuer'; issuer: Address; approved: boolean; name: string; metadataURI: string }

export type ActionName = SkillProofAction['action']

/** Which actions require the sender to hold an Agent ID (enforced on-chain). */
export const AGENT_ID_GATED: Record<ActionName, boolean> = {
  createProfile: true,
  updateProfile: true,
  bindAgentLabel: true,
  addProject: true,
  supersedeProject: true,
  revokeProject: false, // creators can always retract
  attest: true,
  revokeAttestation: false, // issuers can always retract
  issueCredential: false, // gated by the admin-managed issuer allowlist instead
  revokeCredential: false,
  setIssuer: false, // admin only
}

export const ACTION_LABELS: Record<ActionName, string> = {
  createProfile: 'Create profile',
  updateProfile: 'Update profile',
  bindAgentLabel: 'Bind .ai name',
  addProject: 'Add project',
  supersedeProject: 'Publish project revision',
  revokeProject: 'Revoke project',
  attest: 'Sign peer attestation',
  revokeAttestation: 'Revoke attestation',
  issueCredential: 'Issue credential',
  revokeCredential: 'Revoke credential',
  setIssuer: 'Update issuer allowlist',
}

export interface PreparedCall {
  chainId: typeof BSC_CHAIN_ID
  to: Address
  data: Hex
  value: 0n
  /** Contract + function for wagmi */
  abi: readonly unknown[]
  functionName: string
  args: readonly unknown[]
}

export function prepareAction(a: SkillProofAction, c: ContractAddresses): PreparedCall {
  const p = (to: Address, abi: readonly unknown[], functionName: string, args: readonly unknown[]): PreparedCall => ({
    chainId: BSC_CHAIN_ID,
    to,
    abi,
    functionName,
    args,
    value: 0n,
    data: encodeFunctionData({ abi: abi as Abi, functionName, args: args as unknown[] }),
  })
  switch (a.action) {
    case 'createProfile':
      return p(c.profileRegistry, skillProfileRegistryAbi, 'createProfile', [a.agentLabel, a.metadataURI, a.metadataHash])
    case 'updateProfile':
      return p(c.profileRegistry, skillProfileRegistryAbi, 'updateProfile', [a.metadataURI, a.metadataHash])
    case 'bindAgentLabel':
      return p(c.profileRegistry, skillProfileRegistryAbi, 'bindAgentLabel', [a.agentLabel])
    case 'addProject':
      return p(c.projectRegistry, projectEvidenceRegistryAbi, 'addProject', [a.profileId, a.metadataURI, a.evidenceHash])
    case 'supersedeProject':
      return p(c.projectRegistry, projectEvidenceRegistryAbi, 'supersedeProject', [
        a.projectId,
        a.metadataURI,
        a.evidenceHash,
      ])
    case 'revokeProject':
      return p(c.projectRegistry, projectEvidenceRegistryAbi, 'revokeProject', [a.projectId])
    case 'attest':
      return p(c.attestationRegistry, skillAttestationAbi, 'attest', [
        a.profileId,
        a.projectId,
        keyToBytes32(a.skill),
        a.metadataHash,
      ])
    case 'revokeAttestation':
      return p(c.attestationRegistry, skillAttestationAbi, 'revokeAttestation', [a.attestationId])
    case 'issueCredential':
      return p(c.credentialRegistry, credentialRegistryAbi, 'issueCredential', [
        a.profileId,
        keyToBytes32(a.credentialType),
        a.metadataURI,
        a.metadataHash,
        a.expiresAt,
      ])
    case 'revokeCredential':
      return p(c.credentialRegistry, credentialRegistryAbi, 'revokeCredential', [a.credentialId])
    case 'setIssuer':
      return p(c.credentialRegistry, credentialRegistryAbi, 'setIssuer', [a.issuer, a.approved, a.name, a.metadataURI])
  }
}

/**
 * Command for the user's own AI agent running the official Binance Agentic Wallet CLI.
 * Requires Developer Mode, enabled by the user in the Binance App. `preview` returns a
 * requestId; the agent shows the preview to the user and only then runs `execute`, and
 * the Binance App may ask for a further confirmation. attested never runs this itself.
 */
export function bawPreviewCommand(from: Address, call: Pick<PreparedCall, 'to' | 'data'>, gasLimit?: bigint): string {
  if (!isAddress(from)) throw new Error('Invalid from address')
  if (!isAddress(call.to) || !isHex(call.data)) throw new Error('Invalid call')
  if (gasLimit !== undefined && (gasLimit < 21_000n || gasLimit > 15_000_000n)) throw new Error('gasLimit out of range')
  return [
    'baw contract-call preview',
    `--binanceChainId ${BSC_CHAIN_ID}`,
    `--from ${from}`,
    `--to ${call.to}`,
    '--value 0',
    `--inputData ${call.data}`,
    // An explicit cap with margin: attested writes block timestamps/numbers, so exact estimates can run out of gas.
    ...(gasLimit !== undefined ? [`--gasLimit ${gasLimit}`] : []),
    '--json',
  ].join(' ')
}
