/**
 * End-to-end demo against a LOCAL anvil node (chain id 56) that mirrors the REAL Agent ID
 * contract (bytecode + the storage it reads) from BNB Smart Chain mainnet. Nothing is broadcast
 * to mainnet. Two real Agent ID holders are impersonated locally (anvil_impersonateAccount),
 * so the real Agent ID logic gates every action.
 *
 *   register → add project → peer attest → approve issuer → issue credential → verify
 *   + negative checks: non-holder, self-attestation, duplicate, unauthorized issuer
 *
 * Requires: local node on FORK_RPC, mirror (MIRROR_FILE), contracts deployed (DEPLOYMENT_FILE), web app on APP_URL.
 */
import { readFileSync } from 'node:fs'
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  getAddress,
  http,
  parseEther,
  type Address,
  type Hex,
} from 'viem'
import {
  credentialRegistryAbi,
  prepareAction,
  skillAttestationAbi,
  type ContractAddresses,
  type MetadataKind,
  type SkillProofAction,
  bscMainnet as bsc,
} from '@skillproof/shared'

/** Name of the custom error a viem call reverted with (or the short message). */
function revertName(e: unknown): string {
  const err = e as { walk?: (fn: (x: unknown) => boolean) => unknown; shortMessage?: string; message?: string }
  const inner = err.walk?.((x) => !!(x as { data?: { errorName?: string } })?.data?.errorName) as { data?: { errorName?: string } } | null
  return inner?.data?.errorName ?? err.shortMessage ?? String(err.message)
}

const FORK_RPC = process.env.FORK_RPC ?? 'http://127.0.0.1:8545'
const APP = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const DEPLOYMENT_FILE = process.env.DEPLOYMENT_FILE ?? '../../../packages/contracts/deployments/local.json'

const chain = { ...bsc, rpcUrls: { default: { http: [FORK_RPC] } } }
const pub = createPublicClient({ chain, transport: http(FORK_RPC) })
const wallet = createWalletClient({ chain, transport: http(FORK_RPC) })
const test = createTestClient({ chain, mode: 'anvil', transport: http(FORK_RPC) })

const dep = JSON.parse(readFileSync(new URL(DEPLOYMENT_FILE, import.meta.url), 'utf8'))
const contracts: ContractAddresses = {
  profileRegistry: getAddress(dep.skillProfileRegistry),
  projectRegistry: getAddress(dep.projectEvidenceRegistry),
  attestationRegistry: getAddress(dep.skillAttestation),
  credentialRegistry: getAddress(dep.credentialRegistry),
}
const ADMIN = getAddress(dep.admin)
const ORG = getAddress('0x70997970C51812dc3A010C7d01b50e0d17dc79C8') // anvil account #1
const RANDOM = getAddress('0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC') // anvil account #2, no Agent ID

const results: [string, 'PASS' | 'FAIL', string][] = []
function check(name: string, ok: boolean, detail = '') {
  results.push([name, ok ? 'PASS' : 'FAIL', detail])
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

async function meta(kind: MetadataKind, data: Record<string, unknown>) {
  const r = await fetch(`${APP}/api/metadata`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, data }) })
  const j = await r.json()
  if (!r.ok) throw new Error(`metadata rejected: ${JSON.stringify(j)}`)
  return j as { uri: string; hash: Hex }
}

async function send(from: Address, action: SkillProofAction) {
  const call = prepareAction(action, contracts)
  const hash = await wallet.sendTransaction({ account: from, to: call.to, data: call.data, chain })
  const receipt = await pub.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error(`${action.action} reverted (${hash})`)
  return receipt
}

async function expectRevert(name: string, from: Address, action: SkillProofAction, errorName: string) {
  const call = prepareAction(action, contracts)
  try {
    await pub.simulateContract({ account: from, address: call.to, abi: call.abi as never, functionName: call.functionName as never, args: call.args as never })
    check(name, false, 'did not revert')
  } catch (e) {
    const got = revertName(e)
    check(name, got === errorName, `reverted with ${got}`)
  }
}

function holdersFromMirror() {
  const file = process.env.MIRROR_FILE
  if (!file) throw new Error('MIRROR_FILE is required (see scripts/mirror-agent-id.mts)')
  const m = JSON.parse(readFileSync(file, 'utf8')) as { holders: { address: string; label: string }[]; block: number }
  console.log(`Using real Agent ID state mirrored from BNB Smart Chain block ${m.block}`)
  return m.holders.map((h) => ({ address: getAddress(h.address), label: h.label }))
}

async function main() {
  const chainId = await pub.getChainId()
  check('Local node reports chain id 56 (mainnet mirror)', chainId === 56, `chainId=${chainId}`)

  const [A, B] = holdersFromMirror()
  console.log(`Builder A: ${A!.label}.ai ${A!.address}\nBuilder B: ${B!.label}.ai ${B!.address}`)
  for (const who of [A!.address, B!.address, ADMIN, ORG, RANDOM]) {
    await test.impersonateAccount({ address: who })
    await test.setBalance({ address: who, value: parseEther('1') })
  }

  // --- Negative: wallet without Agent ID
  const pm0 = await meta('profile', { displayName: 'Not eligible' })
  await expectRevert('Non-holder cannot create profile', RANDOM, { action: 'createProfile', agentLabel: '', metadataURI: pm0.uri, metadataHash: pm0.hash }, 'NotAgentIdHolder')

  // --- Flow A: profiles
  const pmA = await meta('profile', {
    displayName: 'Demo Builder A',
    bio: 'Local-fork demo profile. Smart contracts and front-ends on BNB Smart Chain.',
    skills: ['Solidity', 'Foundry', 'Next.js', 'UI design'],
    links: { github: 'https://github.com/example-builder-a' },
  })
  await expectRevert('Cannot claim another holder’s .ai name', A!.address, { action: 'createProfile', agentLabel: B!.label, metadataURI: pmA.uri, metadataHash: pmA.hash }, 'AgentLabelNotOwned')
  const rA = await send(A!.address, { action: 'createProfile', agentLabel: A!.label, metadataURI: pmA.uri, metadataHash: pmA.hash })
  check('Builder A creates profile bound to their real .ai name', true, rA.transactionHash)
  const pmB = await meta('profile', { displayName: 'Demo Builder B', bio: 'Reviewer on the demo project.', skills: ['security-review', 'solidity'] })
  await send(B!.address, { action: 'createProfile', agentLabel: B!.label, metadataURI: pmB.uri, metadataHash: pmB.hash })
  const accA = await fetch(`${APP}/api/account/${A!.address}`).then((r) => r.json())
  const accB = await fetch(`${APP}/api/account/${B!.address}`).then((r) => r.json())
  check('API sees both Agent ID holders with profiles', accA.agentIdHeld && accB.agentIdHeld && !!accA.profileId && !!accB.profileId, `A=#${accA.profileId} B=#${accB.profileId}`)
  const pidA = BigInt(accA.profileId)
  const pidB = BigInt(accB.profileId)

  // --- Flow B: project evidence
  const prj = await meta('project', {
    title: 'SkillProof demo dApp',
    role: 'Contracts + frontend',
    summary: 'Four registries gated by Agent ID, plus a verification UI.',
    repositoryUrl: 'https://github.com/example-builder-a/skillproof-demo',
    skills: ['solidity', 'next.js'],
    evidence: [
      { kind: 'pull-request', label: 'Registry contracts', ref: 'https://github.com/example-builder-a/skillproof-demo/pull/1' },
      { kind: 'contract', label: 'SkillProfileRegistry', ref: contracts.profileRegistry },
    ],
  })
  await expectRevert('Builder B cannot add a project to A’s profile', B!.address, { action: 'addProject', profileId: pidA, metadataURI: prj.uri, evidenceHash: prj.hash }, 'NotProfileOwner')
  await send(A!.address, { action: 'addProject', profileId: pidA, metadataURI: prj.uri, evidenceHash: prj.hash })
  const bundle1 = await fetch(`${APP}/api/profile/${pidA}`).then((r) => r.json())
  const project = bundle1.projects[0]
  check('Project recorded as active with verified metadata hash', project?.status === 'active' && project?.meta.status === 'verified', `project #${project?.id}`)
  const projectId = BigInt(project.id)

  // --- Flow C: peer attestation
  const note = await meta('attestation', { relationship: 'reviewer', comment: 'Reviewed the registry contracts and tests.' })
  await expectRevert('Self-attestation fails', A!.address, { action: 'attest', profileId: pidA, projectId, skill: 'solidity', metadataHash: note.hash }, 'SelfAttestation')
  await expectRevert('Non-holder cannot attest', RANDOM, { action: 'attest', profileId: pidA, projectId, skill: 'solidity', metadataHash: note.hash }, 'NotAgentIdHolder')
  const rAtt = await send(B!.address, { action: 'attest', profileId: pidA, projectId, skill: 'solidity', metadataHash: note.hash })
  check('Builder B attests "solidity" on A’s project', true, rAtt.transactionHash)
  await expectRevert('Duplicate active attestation fails', B!.address, { action: 'attest', profileId: pidA, projectId, skill: 'solidity', metadataHash: note.hash }, 'DuplicateActiveAttestation')

  // --- Flow D: credential issuance
  await expectRevert('Unapproved wallet cannot issue credentials', ORG, { action: 'issueCredential', profileId: pidA, credentialType: 'hackathon-finalist', metadataURI: prj.uri, metadataHash: prj.hash, expiresAt: 0n }, 'AccessControlUnauthorizedAccount')
  await send(ADMIN, { action: 'setIssuer', issuer: ORG, approved: true, name: 'Demo Hackathon Org', metadataURI: 'https://example.org' })
  const cm = await meta('credential', { title: 'Finalist, Demo Hackathon 2026', description: 'Local fork demo credential.', criteria: 'Top 10 submissions' })
  const rCred = await send(ORG, { action: 'issueCredential', profileId: pidA, credentialType: 'hackathon-finalist', metadataURI: cm.uri, metadataHash: cm.hash, expiresAt: 0n })
  check('Approved issuer issues credential', true, rCred.transactionHash)

  // --- Flow E: independent verification through the app
  const bundle2 = await fetch(`${APP}/api/profile/${A!.label}.ai`).then((r) => r.json())
  check('Profile resolves by bound .ai name', bundle2.profile?.id === pidA.toString())
  check('One active peer attestation, separate from credentials', bundle2.attestations.filter((a: { active: boolean }) => a.active).length === 1)
  const cred = bundle2.credentials[0]
  check('Credential verifies as valid from approved issuer', cred?.valid === true && cred?.issuer.name === 'Demo Hackathon Org')
  const att = bundle2.attestations[0]
  const tx = await fetch(`${APP}/api/tx?kind=attestation-issued&id=${att.id}&block=${att.issuedBlock}`).then((r) => r.json())
  check('"View transaction" lookup finds the exact attestation tx', tx.hash === rAtt.transactionHash, tx.hash)
  const page = await fetch(`${APP}/verify?q=credential:${cred.id}`).then((r) => r.text())
  check('Verification Center renders the credential as currently valid', page.includes('Currently valid'))
  const txPage = await fetch(`${APP}/verify?q=${rAtt.transactionHash}`).then((r) => r.text())
  check('Verification Center decodes the attestation transaction', txPage.includes('AttestationIssued'))
  const meta1 = await fetch(project.metadataURI.replace(/^https?:\/\/[^/]+/, APP)).then((r) => r.text())
  const { hashCanonical } = await import('@skillproof/shared')
  check('Served metadata re-hashes to the on-chain evidence hash', hashCanonical(meta1) === project.evidenceHash)

  // --- Revocation & revision
  await send(B!.address, { action: 'revokeAttestation', attestationId: BigInt(att.id) })
  const active = await pub.readContract({ address: contracts.attestationRegistry, abi: skillAttestationAbi, functionName: 'isActive', args: [BigInt(att.id)] })
  check('Revoked attestation is not active', active === false)
  const prj2 = await meta('project', { title: 'SkillProof demo dApp (v2)', skills: ['solidity', 'next.js', 'foundry'] })
  await send(A!.address, { action: 'supersedeProject', projectId, metadataURI: prj2.uri, evidenceHash: prj2.hash })
  const bundle3 = await fetch(`${APP}/api/profile/${pidA}`).then((r) => r.json())
  const old = bundle3.projects.find((p: { id: string }) => p.id === projectId.toString())
  check('Revision creates a new record; original evidence hash unchanged', old.status === 'superseded' && old.evidenceHash === project.evidenceHash && bundle3.projects.length === 2)
  await send(ORG, { action: 'revokeCredential', credentialId: BigInt(cred.id) })
  const [valid] = await pub.readContract({ address: contracts.credentialRegistry, abi: credentialRegistryAbi, functionName: 'verifyCredential', args: [BigInt(cred.id)] })
  check('Revoked credential no longer verifies', valid === false)

  const failed = results.filter((r) => r[1] === 'FAIL')
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  console.log(`Open ${APP}/p/${A!.label}.ai and ${APP}/verify?q=credential:${cred.id}`)
  if (failed.length) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
