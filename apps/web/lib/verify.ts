import 'server-only'
import { keccak256, parseEventLogs, toBytes, type Address, type Hex } from 'viem'
import {
  credentialRegistryAbi,
  projectEvidenceRegistryAbi,
  skillAttestationAbi,
  skillProfileRegistryAbi,
  bytes32ToKey,
} from '@skillproof/shared'
import { client, contracts } from './reads'

export interface DecodedEvent {
  contract: 'SkillProfileRegistry' | 'ProjectEvidenceRegistry' | 'SkillAttestation' | 'CredentialRegistry'
  address: Address
  eventName: string
  args: Record<string, string>
  logIndex: number
}

export interface TxVerification {
  hash: Hex
  found: boolean
  status: 'success' | 'reverted' | 'pending' | 'not-found'
  blockNumber: string | null
  from: Address | null
  to: Address | null
  chainId: number
  events: DecodedEvent[]
  touchesSkillProof: boolean
}

const ROLE_NAMES: Record<string, string> = {
  ['0x' + '0'.repeat(64)]: 'DEFAULT_ADMIN_ROLE',
  [keccak256(toBytes('PAUSER_ROLE'))]: 'PAUSER_ROLE',
  [keccak256(toBytes('ISSUER_ROLE'))]: 'ISSUER_ROLE',
}

function stringify(args: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(args)) {
    if (/role/i.test(k) && typeof v === 'string' && ROLE_NAMES[v.toLowerCase()]) {
      out[k] = ROLE_NAMES[v.toLowerCase()]!
      continue
    }
    if (typeof v === 'string' && /^0x[0-9a-f]{64}$/i.test(v) && /skillKey|credentialType/.test(k)) out[k] = bytes32ToKey(v as Hex)
    else out[k] = typeof v === 'bigint' ? v.toString() : String(v)
  }
  return out
}

export async function verifyTransaction(hash: Hex): Promise<TxVerification> {
  const c = contracts()
  const chainId = await client().getChainId()
  const base: TxVerification = {
    hash,
    found: false,
    status: 'not-found',
    blockNumber: null,
    from: null,
    to: null,
    chainId,
    events: [],
    touchesSkillProof: false,
  }
  const receipt = await client()
    .getTransactionReceipt({ hash })
    .catch(() => null)
  if (!receipt) {
    const tx = await client()
      .getTransaction({ hash })
      .catch(() => null)
    return tx ? { ...base, found: true, status: 'pending', from: tx.from, to: tx.to ?? null } : base
  }
  const map: [Address, DecodedEvent['contract'], readonly unknown[]][] = [
    [c.profileRegistry, 'SkillProfileRegistry', skillProfileRegistryAbi],
    [c.projectRegistry, 'ProjectEvidenceRegistry', projectEvidenceRegistryAbi],
    [c.attestationRegistry, 'SkillAttestation', skillAttestationAbi],
    [c.credentialRegistry, 'CredentialRegistry', credentialRegistryAbi],
  ]
  const events: DecodedEvent[] = []
  for (const [address, name, abi] of map) {
    const logs = receipt.logs.filter((l) => l.address.toLowerCase() === address.toLowerCase())
    if (!logs.length) continue
    const parsed = parseEventLogs({ abi: abi as never, logs })
    for (const p of parsed as unknown as { eventName: string; args: Record<string, unknown>; logIndex: number }[]) {
      events.push({ contract: name, address, eventName: p.eventName, args: stringify(p.args), logIndex: p.logIndex })
    }
  }
  return {
    ...base,
    found: true,
    status: receipt.status,
    blockNumber: receipt.blockNumber.toString(),
    from: receipt.from,
    to: receipt.to,
    events,
    touchesSkillProof: events.length > 0,
  }
}
