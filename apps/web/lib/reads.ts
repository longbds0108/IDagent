import 'server-only'
import {
  createPublicClient,
  getAddress,
  http,
  isAddress,
  parseAbiItem,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem'
import {
  agentIdAbi,
  bscMainnet,
  agentLabelToTokenId,
  attestationNoteSchema,
  bytes32ToKey,
  credentialMetadataSchema,
  credentialRegistryAbi,
  hashCanonical,
  canonicalJson,
  MAX_METADATA_BYTES,
  parseAgentLabel,
  profileMetadataSchema,
  projectEvidenceRegistryAbi,
  projectMetadataSchema,
  skillAttestationAbi,
  skillProfileRegistryAbi,
  type AttestationNote,
  type CredentialMetadata,
  type ProfileMetadata,
  type ProjectMetadata,
} from '@skillproof/shared'
import { deployedContracts, publicEnv, type DeployedContracts } from './env'
import { metadataStore } from './metadata-store'

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

const chain = { ...bscMainnet, rpcUrls: { default: { http: [publicEnv.rpcUrl] } } }

let _client: PublicClient | null = null
export function client(): PublicClient {
  if (!_client) {
    _client = createPublicClient({
      chain,
      transport: http(process.env.BSC_MAINNET_RPC_URL || publicEnv.rpcUrl, { timeout: 15_000, retryCount: 2 }),
      batch: { multicall: true },
    }) as PublicClient
  }
  return _client
}

/** Some public RPCs (incl. bsc-dataseed) reject eth_getLogs, so logs get their own endpoint. */
let _logsClient: PublicClient | null = null
function logsClient(): PublicClient {
  if (!_logsClient) {
    const url = process.env.BSC_LOGS_RPC_URL || process.env.BSC_MAINNET_RPC_URL || publicEnv.rpcUrl
    _logsClient = createPublicClient({ chain, transport: http(url, { timeout: 15_000, retryCount: 2 }) }) as PublicClient
  }
  return _logsClient
}

export function contracts(): DeployedContracts {
  const c = deployedContracts()
  if (!c) throw new NotConfiguredError()
  return c
}

export class NotConfiguredError extends Error {
  constructor() {
    super('attested contracts are not configured (NEXT_PUBLIC_*_REGISTRY env vars).')
  }
}

// ---------------------------------------------------------------------------
// Tiny TTL cache (per server instance). Chain state stays authoritative: TTLs are short and
// verification views bypass the cache.
// ---------------------------------------------------------------------------

const cache = new Map<string, { at: number; value: Promise<unknown> }>()
const refreshing = new Set<string>()
/** Bumped on every invalidation, so a refresh that started before it cannot write old data back. */
let generation = 0
/** Stale values older than this are not served at all: the caller waits for fresh data. */
const MAX_STALE_MS = 10 * 60_000

/**
 * Stale-while-revalidate: within `ttlMs` the cached value is returned as is. After that, the stale
 * value is still returned at once while one background refresh runs, so a visitor never waits for
 * the chain reads that rebuild a list. Only the very first load (or a value older than MAX_STALE_MS)
 * waits. If a refresh fails, the last good value stays in place.
 */
export function swr<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  const age = hit ? Date.now() - hit.at : Infinity
  if (hit && age < ttlMs) return hit.value as Promise<T>
  if (hit && age < MAX_STALE_MS) {
    if (!refreshing.has(key)) {
      refreshing.add(key)
      const gen = generation
      fn()
        .then((v) => {
          if (gen === generation) cache.set(key, { at: Date.now(), value: Promise.resolve(v) })
        })
        .catch(() => {})
        .finally(() => refreshing.delete(key))
    }
    return hit.value as Promise<T>
  }
  const value = fn().catch((e) => {
    cache.delete(key)
    throw e
  })
  cache.set(key, { at: Date.now(), value })
  return value
}
const cached = swr
export function invalidateReads() {
  cache.clear()
  refreshing.clear()
  generation++
}

// ---------------------------------------------------------------------------
// Metadata resolution + integrity check
// ---------------------------------------------------------------------------

export type MetaStatus = 'verified' | 'mismatch' | 'unavailable' | 'invalid' | 'none'

export interface MetaResult<T> {
  data: T | null
  status: MetaStatus
  /** The canonical JSON whose keccak256 matched the on-chain hash (when verified). */
  raw: string | null
}

function isSafeExternalUrl(uri: string) {
  try {
    const u = new URL(uri)
    if (u.protocol !== 'https:') return false
    const h = u.hostname
    if (h === 'localhost' || /^[\d.]+$/.test(h) || h.includes(':') || h.endsWith('.local') || h.endsWith('.internal'))
      return false
    return true
  } catch {
    return false
  }
}

async function fetchText(uri: string): Promise<string | null> {
  let url = uri
  if (uri.startsWith('ipfs://')) url = `https://ipfs.io/ipfs/${uri.slice(7)}`
  if (!isSafeExternalUrl(url)) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), redirect: 'error', cache: 'no-store' })
    if (!res.ok) return null
    const text = await res.text()
    return text.length > MAX_METADATA_BYTES * 2 ? null : text
  } catch {
    return null
  }
}

async function resolveMetadata<T>(
  schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } },
  hash: Hex,
  uri: string | null,
): Promise<MetaResult<T>> {
  if (/^0x0{64}$/.test(hash)) return { data: null, status: 'none', raw: null }
  let raw = await metadataStore().get(hash.toLowerCase() as Hex)
  if (raw === null && uri) {
    const text = await fetchText(uri)
    if (text !== null) {
      if (hashCanonical(text) === hash) raw = text
      else {
        try {
          const canon = canonicalJson(JSON.parse(text))
          if (hashCanonical(canon) === hash) raw = canon
          else return { data: null, status: 'mismatch', raw: null }
        } catch {
          return { data: null, status: 'mismatch', raw: null }
        }
      }
    }
  }
  if (raw === null) return { data: null, status: 'unavailable', raw: null }
  if (hashCanonical(raw) !== hash.toLowerCase()) return { data: null, status: 'mismatch', raw: null }
  try {
    const parsed = schema.safeParse(JSON.parse(raw))
    return parsed.success ? { data: parsed.data, status: 'verified', raw } : { data: null, status: 'invalid', raw }
  } catch {
    return { data: null, status: 'invalid', raw }
  }
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export interface ProfileView {
  id: string
  owner: Address
  agentLabel: string
  agentIdTokenId: string
  metadataURI: string
  metadataHash: Hex
  version: number
  createdAt: number
  updatedAt: number
  createdBlock: number
  updatedBlock: number
  meta: MetaResult<ProfileMetadata>
  agentIdHeld: boolean
}

export const PROJECT_STATUS = ['none', 'active', 'superseded', 'revoked'] as const
export type ProjectStatus = (typeof PROJECT_STATUS)[number]

export interface ProjectView {
  id: string
  profileId: string
  creator: Address
  metadataURI: string
  evidenceHash: Hex
  status: ProjectStatus
  supersedes: string
  supersededBy: string
  createdAt: number
  createdBlock: number
  closedAt: number
  closedBlock: number
  meta: MetaResult<ProjectMetadata>
}

export interface AttestationView {
  id: string
  issuer: Address
  issuerProfileId: string | null
  issuerLabel: string | null
  issuerName: string | null
  subjectProfileId: string
  projectId: string
  skill: string
  metadataHash: Hex
  revoked: boolean
  active: boolean
  issuedAt: number
  issuedBlock: number
  revokedAt: number
  revokedBlock: number
  note: MetaResult<AttestationNote>
}

export const CREDENTIAL_STATUS = ['none', 'valid', 'revoked', 'expired', 'issuer-inactive'] as const
export type CredentialStatus = (typeof CREDENTIAL_STATUS)[number]

export interface IssuerView {
  address: Address
  name: string
  metadataURI: string
  active: boolean
  approvedAt: number
  removedAt: number
}

export interface CredentialView {
  id: string
  issuer: IssuerView
  subjectProfileId: string
  credentialType: string
  metadataURI: string
  metadataHash: Hex
  issuedAt: number
  issuedBlock: number
  expiresAt: number
  revoked: boolean
  revokedBy: Address | null
  revokedAt: number
  revokedBlock: number
  status: CredentialStatus
  valid: boolean
  meta: MetaResult<CredentialMetadata>
}

const ZERO = '0x0000000000000000000000000000000000000000'

export async function isAgentIdHolder(address: Address): Promise<boolean> {
  try {
    const bal = await client().readContract({
      address: publicEnv.agentId,
      abi: agentIdAbi,
      functionName: 'balanceOf',
      args: [address],
    })
    return bal > 0n
  } catch {
    return false
  }
}

type RawProfile = {
  owner: Address
  agentIdTokenId: bigint
  agentLabel: string
  metadataURI: string
  metadataHash: Hex
  version: number
  createdAt: bigint
  updatedAt: bigint
  createdBlock: bigint
  updatedBlock: bigint
}

async function toProfileView(id: bigint, p: RawProfile): Promise<ProfileView> {
  const [meta, agentIdHeld] = await Promise.all([
    resolveMetadata(profileMetadataSchema, p.metadataHash, p.metadataURI),
    isAgentIdHolder(p.owner),
  ])
  return {
    id: id.toString(),
    owner: p.owner,
    agentLabel: p.agentLabel,
    agentIdTokenId: p.agentIdTokenId.toString(),
    metadataURI: p.metadataURI,
    metadataHash: p.metadataHash,
    version: Number(p.version),
    createdAt: Number(p.createdAt),
    updatedAt: Number(p.updatedAt),
    createdBlock: Number(p.createdBlock),
    updatedBlock: Number(p.updatedBlock),
    meta,
    agentIdHeld,
  }
}

export async function getProfile(id: bigint): Promise<ProfileView | null> {
  if (id <= 0n) return null
  try {
    const p = (await client().readContract({
      address: contracts().profileRegistry,
      abi: skillProfileRegistryAbi,
      functionName: 'getProfile',
      args: [id],
    })) as RawProfile
    return toProfileView(id, p)
  } catch (e) {
    if (e instanceof NotConfiguredError) throw e
    return null
  }
}

export async function profileIdOf(address: Address): Promise<bigint> {
  return client().readContract({
    address: contracts().profileRegistry,
    abi: skillProfileRegistryAbi,
    functionName: 'profileOf',
    args: [address],
  })
}

/**
 * Resolve a public profile URL segment: a numeric id, a SkillProof-bound `<label>.ai` name,
 * or the owner's address. Only labels the owner bound to attested are resolvable, so this
 * is not a general Agent-ID-name-to-wallet lookup.
 */
export async function resolveProfileId(param: string): Promise<bigint | null> {
  const s = decodeURIComponent(param).trim()
  if (/^\d{1,12}$/.test(s)) return BigInt(s)
  if (isAddress(s)) {
    const id = await profileIdOf(getAddress(s))
    return id === 0n ? null : id
  }
  const label = parseAgentLabel(s)
  if (!label) return null
  const id = await client().readContract({
    address: contracts().profileRegistry,
    abi: skillProfileRegistryAbi,
    functionName: 'profileOfAgentId',
    args: [agentLabelToTokenId(label)],
  })
  return id === 0n ? null : id
}

export async function profileCount(): Promise<bigint> {
  return client().readContract({
    address: contracts().profileRegistry,
    abi: skillProfileRegistryAbi,
    functionName: 'profileCount',
  })
}

export async function listProfiles(): Promise<ProfileView[]> {
  return cached('profiles', 15_000, async () => {
    const total = await profileCount()
    const out: ProfileView[] = []
    const PAGE = 100n
    for (let offset = 0n; offset < total; offset += PAGE) {
      const page = (await client().readContract({
        address: contracts().profileRegistry,
        abi: skillProfileRegistryAbi,
        functionName: 'getProfiles',
        args: [offset, PAGE],
      })) as readonly RawProfile[]
      const views = await Promise.all(page.map((p, i) => toProfileView(offset + BigInt(i) + 1n, p)))
      out.push(...views)
    }
    return out
  })
}

type RawProject = {
  profileId: bigint
  creator: Address
  metadataURI: string
  evidenceHash: Hex
  status: number
  supersedes: bigint
  supersededBy: bigint
  createdAt: bigint
  createdBlock: bigint
  closedAt: bigint
  closedBlock: bigint
}

async function toProjectView(id: bigint, p: RawProject): Promise<ProjectView> {
  return {
    id: id.toString(),
    profileId: p.profileId.toString(),
    creator: p.creator,
    metadataURI: p.metadataURI,
    evidenceHash: p.evidenceHash,
    status: PROJECT_STATUS[p.status] ?? 'none',
    supersedes: p.supersedes.toString(),
    supersededBy: p.supersededBy.toString(),
    createdAt: Number(p.createdAt),
    createdBlock: Number(p.createdBlock),
    closedAt: Number(p.closedAt),
    closedBlock: Number(p.closedBlock),
    meta: await resolveMetadata(projectMetadataSchema, p.evidenceHash, p.metadataURI),
  }
}

export async function getProjectsOf(profileId: bigint): Promise<ProjectView[]> {
  const [ids, items] = (await client().readContract({
    address: contracts().projectRegistry,
    abi: projectEvidenceRegistryAbi,
    functionName: 'getProjectsOf',
    args: [profileId],
  })) as readonly [readonly bigint[], readonly RawProject[]]
  return Promise.all(ids.map((id, i) => toProjectView(id, items[i]!)))
}

export async function getProject(id: bigint): Promise<ProjectView | null> {
  try {
    const p = (await client().readContract({
      address: contracts().projectRegistry,
      abi: projectEvidenceRegistryAbi,
      functionName: 'getProject',
      args: [id],
    })) as RawProject
    return toProjectView(id, p)
  } catch (e) {
    if (e instanceof NotConfiguredError) throw e
    return null
  }
}

type RawAttestation = {
  issuer: Address
  subjectProfileId: bigint
  projectId: bigint
  skillKey: Hex
  metadataHash: Hex
  revoked: boolean
  issuedAt: bigint
  issuedBlock: bigint
  revokedAt: bigint
  revokedBlock: bigint
}

async function issuerIdentity(issuer: Address) {
  return cached(`issuer-id:${issuer}`, 30_000, async () => {
    const pid = await profileIdOf(issuer)
    if (pid === 0n) return { profileId: null, label: null, name: null }
    const p = await getProfile(pid)
    return {
      profileId: pid.toString(),
      label: p?.agentLabel || null,
      name: p?.meta.data?.displayName ?? null,
    }
  })
}

async function toAttestationView(id: bigint, a: RawAttestation): Promise<AttestationView> {
  const [who, note] = await Promise.all([
    issuerIdentity(a.issuer),
    resolveMetadata(attestationNoteSchema, a.metadataHash, null),
  ])
  return {
    id: id.toString(),
    issuer: a.issuer,
    issuerProfileId: who.profileId,
    issuerLabel: who.label,
    issuerName: who.name,
    subjectProfileId: a.subjectProfileId.toString(),
    projectId: a.projectId.toString(),
    skill: bytes32ToKey(a.skillKey),
    metadataHash: a.metadataHash,
    revoked: a.revoked,
    active: !a.revoked,
    issuedAt: Number(a.issuedAt),
    issuedBlock: Number(a.issuedBlock),
    revokedAt: Number(a.revokedAt),
    revokedBlock: Number(a.revokedBlock),
    note,
  }
}

async function pageAll(
  fn: 'getReceived' | 'getIssued',
  arg: bigint | Address,
): Promise<{ ids: bigint[]; items: RawAttestation[] }> {
  const ids: bigint[] = []
  const items: RawAttestation[] = []
  const PAGE = 200n
  for (let offset = 0n; ; offset += PAGE) {
    const [pIds, pItems] = (await client().readContract({
      address: contracts().attestationRegistry,
      abi: skillAttestationAbi,
      functionName: fn,
      args: [arg as never, offset, PAGE],
    })) as readonly [readonly bigint[], readonly RawAttestation[]]
    ids.push(...pIds)
    items.push(...pItems)
    if (BigInt(pIds.length) < PAGE) break
  }
  return { ids, items }
}

export async function getAttestationsReceived(profileId: bigint): Promise<AttestationView[]> {
  const { ids, items } = await pageAll('getReceived', profileId)
  return Promise.all(ids.map((id, i) => toAttestationView(id, items[i]!)))
}

export async function getAttestationsIssued(issuer: Address): Promise<AttestationView[]> {
  const { ids, items } = await pageAll('getIssued', issuer)
  return Promise.all(ids.map((id, i) => toAttestationView(id, items[i]!)))
}

export async function getAttestation(id: bigint): Promise<AttestationView | null> {
  try {
    const a = (await client().readContract({
      address: contracts().attestationRegistry,
      abi: skillAttestationAbi,
      functionName: 'getAttestation',
      args: [id],
    })) as RawAttestation
    return toAttestationView(id, a)
  } catch (e) {
    if (e instanceof NotConfiguredError) throw e
    return null
  }
}

type RawIssuer = { name: string; metadataURI: string; active: boolean; approvedAt: bigint; removedAt: bigint }
type RawCredential = {
  issuer: Address
  subjectProfileId: bigint
  credentialType: Hex
  metadataURI: string
  metadataHash: Hex
  issuedAt: bigint
  issuedBlock: bigint
  expiresAt: bigint
  revoked: boolean
  revokedBy: Address
  revokedAt: bigint
  revokedBlock: bigint
}

function toIssuerView(address: Address, i: RawIssuer): IssuerView {
  return {
    address,
    name: i.name,
    metadataURI: i.metadataURI,
    active: i.active,
    approvedAt: Number(i.approvedAt),
    removedAt: Number(i.removedAt),
  }
}

export async function getCredential(id: bigint): Promise<CredentialView | null> {
  try {
    const [valid, status, c, issuer] = (await client().readContract({
      address: contracts().credentialRegistry,
      abi: credentialRegistryAbi,
      functionName: 'verifyCredential',
      args: [id],
    })) as readonly [boolean, number, RawCredential, RawIssuer]
    return {
      id: id.toString(),
      issuer: toIssuerView(c.issuer, issuer),
      subjectProfileId: c.subjectProfileId.toString(),
      credentialType: bytes32ToKey(c.credentialType),
      metadataURI: c.metadataURI,
      metadataHash: c.metadataHash,
      issuedAt: Number(c.issuedAt),
      issuedBlock: Number(c.issuedBlock),
      expiresAt: Number(c.expiresAt),
      revoked: c.revoked,
      revokedBy: c.revokedBy === ZERO ? null : c.revokedBy,
      revokedAt: Number(c.revokedAt),
      revokedBlock: Number(c.revokedBlock),
      status: CREDENTIAL_STATUS[status] ?? 'none',
      valid,
      meta: await resolveMetadata(credentialMetadataSchema, c.metadataHash, c.metadataURI),
    }
  } catch (e) {
    if (e instanceof NotConfiguredError) throw e
    return null
  }
}

export async function getCredentialsOf(profileId: bigint): Promise<CredentialView[]> {
  const ids = await client().readContract({
    address: contracts().credentialRegistry,
    abi: credentialRegistryAbi,
    functionName: 'credentialIdsOf',
    args: [profileId],
  })
  const all = await Promise.all(ids.map((id) => getCredential(id)))
  return all.filter((c): c is CredentialView => c !== null)
}

export async function getCredentialsIssuedBy(issuer: Address): Promise<CredentialView[]> {
  const ids = await client().readContract({
    address: contracts().credentialRegistry,
    abi: credentialRegistryAbi,
    functionName: 'credentialIdsIssuedBy',
    args: [issuer],
  })
  const all = await Promise.all(ids.map((id) => getCredential(id)))
  return all.filter((c): c is CredentialView => c !== null)
}

export async function getIssuers(): Promise<IssuerView[]> {
  const [addrs, infos] = (await client().readContract({
    address: contracts().credentialRegistry,
    abi: credentialRegistryAbi,
    functionName: 'getIssuers',
  })) as readonly [readonly Address[], readonly RawIssuer[]]
  return addrs.map((a, i) => toIssuerView(a, infos[i]!))
}

export interface AccountView {
  address: Address
  agentIdHeld: boolean
  profileId: string | null
  isIssuer: boolean
  issuer: IssuerView | null
  isAdmin: boolean
}

export async function getAccount(address: Address): Promise<AccountView> {
  const c = contracts()
  const DEFAULT_ADMIN_ROLE = `0x${'0'.repeat(64)}` as Hex
  const [agentIdHeld, pid, isIssuer, issuer, isAdmin] = await Promise.all([
    isAgentIdHolder(address),
    profileIdOf(address),
    client().readContract({ address: c.credentialRegistry, abi: credentialRegistryAbi, functionName: 'isIssuer', args: [address] }),
    client().readContract({ address: c.credentialRegistry, abi: credentialRegistryAbi, functionName: 'getIssuer', args: [address] }),
    client().readContract({
      address: c.credentialRegistry,
      abi: credentialRegistryAbi,
      functionName: 'hasRole',
      args: [DEFAULT_ADMIN_ROLE, address],
    }),
  ])
  const iv = issuer as RawIssuer
  return {
    address,
    agentIdHeld,
    profileId: pid === 0n ? null : pid.toString(),
    isIssuer,
    issuer: iv.approvedAt > 0n ? toIssuerView(address, iv) : null,
    isAdmin,
  }
}

// ---------------------------------------------------------------------------
// Transaction lookup: every record stores the block it was written in, so the transaction is
// found with a single-block log query (cheap, and supported by most public RPCs).
// ---------------------------------------------------------------------------

export const RECORD_EVENTS = {
  'profile-created': {
    contract: 'profileRegistry',
    event: parseAbiItem(
      'event ProfileCreated(uint256 indexed profileId, address indexed owner, uint256 indexed agentIdTokenId, string agentLabel, string metadataURI, bytes32 metadataHash)',
    ),
    arg: 'profileId',
  },
  'profile-updated': {
    contract: 'profileRegistry',
    event: parseAbiItem(
      'event ProfileMetadataUpdated(uint256 indexed profileId, address indexed owner, string metadataURI, bytes32 metadataHash, uint32 version)',
    ),
    arg: 'profileId',
  },
  'project-added': {
    contract: 'projectRegistry',
    event: parseAbiItem(
      'event ProjectAdded(uint256 indexed projectId, uint256 indexed profileId, address indexed creator, string metadataURI, bytes32 evidenceHash)',
    ),
    arg: 'projectId',
  },
  'project-revoked': {
    contract: 'projectRegistry',
    event: parseAbiItem('event ProjectRevoked(uint256 indexed projectId, uint256 indexed profileId, address indexed creator)'),
    arg: 'projectId',
  },
  'project-superseded': {
    contract: 'projectRegistry',
    event: parseAbiItem(
      'event ProjectSuperseded(uint256 indexed oldProjectId, uint256 indexed newProjectId, uint256 indexed profileId)',
    ),
    arg: 'oldProjectId',
  },
  'attestation-issued': {
    contract: 'attestationRegistry',
    event: parseAbiItem(
      'event AttestationIssued(uint256 indexed attestationId, address indexed issuer, uint256 indexed subjectProfileId, uint256 projectId, bytes32 skillKey, bytes32 metadataHash)',
    ),
    arg: 'attestationId',
  },
  'attestation-revoked': {
    contract: 'attestationRegistry',
    event: parseAbiItem(
      'event AttestationRevoked(uint256 indexed attestationId, address indexed issuer, uint256 indexed subjectProfileId)',
    ),
    arg: 'attestationId',
  },
  'credential-issued': {
    contract: 'credentialRegistry',
    event: parseAbiItem(
      'event CredentialIssued(uint256 indexed credentialId, address indexed issuer, uint256 indexed subjectProfileId, bytes32 credentialType, string metadataURI, bytes32 metadataHash, uint64 expiresAt)',
    ),
    arg: 'credentialId',
  },
  'credential-revoked': {
    contract: 'credentialRegistry',
    event: parseAbiItem(
      'event CredentialRevoked(uint256 indexed credentialId, address indexed revokedBy, uint256 indexed subjectProfileId)',
    ),
    arg: 'credentialId',
  },
} as const
export type RecordEventKind = keyof typeof RECORD_EVENTS

const txCache = new Map<string, Hex>()
export async function findRecordTx(kind: RecordEventKind, id: bigint, block: bigint): Promise<Hex | null> {
  const key = `${kind}:${id}:${block}`
  const hit = txCache.get(key)
  if (hit) return hit
  const spec = RECORD_EVENTS[kind]
  const logs = await logsClient().getLogs({
    address: contracts()[spec.contract],
    event: spec.event,
    args: { [spec.arg]: id } as never,
    fromBlock: block,
    toBlock: block,
  })
  const tx = logs[0]?.transactionHash ?? null
  if (tx) txCache.set(key, tx) // immutable once mined
  return tx
}

// ---------------------------------------------------------------------------
// Builder summaries for Explore / Home (lightweight, cached briefly)
// ---------------------------------------------------------------------------

export interface BuilderSummary {
  profile: ProfileView
  activeProjects: number
  /** active peer attestations per skill */
  peerSkills: Record<string, number>
  activePeer: number
  validCredentials: number
}

export async function listBuilderSummaries(): Promise<BuilderSummary[]> {
  return cached('summaries', 15_000, async () => {
    const profiles = await listProfiles()
    const c = contracts()
    return Promise.all(
      profiles.map(async (profile) => {
        const pid = BigInt(profile.id)
        const [[, projectItems], received, credIds] = await Promise.all([
          client().readContract({
            address: c.projectRegistry,
            abi: projectEvidenceRegistryAbi,
            functionName: 'getProjectsOf',
            args: [pid],
          }) as Promise<readonly [readonly bigint[], readonly RawProject[]]>,
          pageAll('getReceived', pid),
          client().readContract({ address: c.credentialRegistry, abi: credentialRegistryAbi, functionName: 'credentialIdsOf', args: [pid] }),
        ])
        const statuses = await Promise.all(
          credIds.map((id) =>
            client().readContract({ address: c.credentialRegistry, abi: credentialRegistryAbi, functionName: 'credentialStatus', args: [id] }),
          ),
        )
        const peerSkills: Record<string, number> = {}
        let activePeer = 0
        for (const a of received.items) {
          if (a.revoked) continue
          activePeer++
          const k = bytes32ToKey(a.skillKey)
          peerSkills[k] = (peerSkills[k] ?? 0) + 1
        }
        return {
          profile,
          activeProjects: projectItems.filter((p) => p.status === 1).length,
          peerSkills,
          activePeer,
          validCredentials: statuses.filter((s) => s === 1).length,
        }
      }),
    )
  })
}

// ---------------------------------------------------------------------------
// Protocol-wide counters for the landing page (read live from the contracts)
// ---------------------------------------------------------------------------

export interface ProtocolStats {
  profiles: number
  projects: number
  attestations: number
  credentials: number
  issuers: number
}

export async function protocolStats(): Promise<ProtocolStats> {
  return cached('stats', 15_000, async () => {
    const c = contracts()
    const [profiles, projects, attestations, credentials, issuers] = await Promise.all([
      client().readContract({ address: c.profileRegistry, abi: skillProfileRegistryAbi, functionName: 'profileCount' }),
      client().readContract({ address: c.projectRegistry, abi: projectEvidenceRegistryAbi, functionName: 'projectCount' }),
      client().readContract({ address: c.attestationRegistry, abi: skillAttestationAbi, functionName: 'attestationCount' }),
      client().readContract({ address: c.credentialRegistry, abi: credentialRegistryAbi, functionName: 'credentialCount' }),
      getIssuers(),
    ])
    return {
      profiles: Number(profiles),
      projects: Number(projects),
      attestations: Number(attestations),
      credentials: Number(credentials),
      issuers: issuers.filter((i) => i.active).length,
    }
  })
}
