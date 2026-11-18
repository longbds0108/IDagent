/**
 * Captures a faithful, minimal replica of the REAL Agent ID contract from BNB Smart Chain
 * mainnet for local demos: its runtime bytecode plus exactly the storage slots it reads for
 * the demo accounts (discovered with eth_createAccessList at the latest block).
 *
 * Why not a live fork? BSC produces ~2 blocks/s, so a pinned fork block leaves the public
 * nodes' recent-state window within about a minute, and free public RPCs refuse or
 * rate-limit archive reads.
 *
 * Usage: tsx scripts/mirror-agent-id.mts <out.json> [holders=2]
 */
import { writeFileSync } from 'node:fs'
import {
  createPublicClient,
  decodeAbiParameters,
  encodeFunctionData,
  getAddress,
  http,
  toHex,
  type Address,
  type Hex,
} from 'viem'
import { agentIdAbi, agentLabelToTokenId, OFFICIAL_AGENT_ID_ADDRESS, bscMainnet as bsc } from '@skillproof/shared'

const STATE_RPC = process.env.STATE_RPC ?? 'https://bsc-dataseed.bnbchain.org'
const LOGS_RPC = process.env.REMOTE_LOGS_RPC ?? 'https://bsc-rpc.publicnode.com'
const AGENT_ID = getAddress(process.env.AGENT_ID_CONTRACT_ADDRESS ?? OFFICIAL_AGENT_ID_ADDRESS)
const MULTICALL3 = getAddress('0xcA11bde05977b3631167028862bE2a173976CA11')
const MINT_TOPIC = '0x663d34a86c6277aafbd5c6912c96cc5df091e6702ea3ea91b8f378adcbd8a5e5'
const NON_HOLDER = getAddress('0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC')

const state = createPublicClient({ chain: bsc, transport: http(STATE_RPC) })
const logs = createPublicClient({ chain: bsc, transport: http(LOGS_RPC) })

async function accessSlots(data: Hex, block: Hex): Promise<{ address: Address; storageKeys: Hex[] }[]> {
  const r = (await state.request({
    method: 'eth_createAccessList' as never,
    params: [{ to: AGENT_ID, data }, block] as never,
  })) as { accessList: { address: Address; storageKeys: Hex[] }[] }
  return r.accessList
}

async function main() {
  const out = process.argv[2]
  const want = Number(process.argv[3] ?? 2)
  if (!out) throw new Error('usage: mirror-agent-id.mts <out.json> [holders]')
  if ((await state.getChainId()) !== 56) throw new Error('STATE_RPC is not BNB Smart Chain mainnet')

  const head = await state.getBlockNumber()
  const holders: { address: Address; label: string; tokenId: string }[] = []
  for (let to = head; holders.length < want && to > head - 40_000n; to -= 4_000n) {
    const found = (await logs.request({
      method: 'eth_getLogs',
      params: [{ address: AGENT_ID, fromBlock: toHex(to - 3_999n), toBlock: toHex(to), topics: [MINT_TOPIC] }],
    })) as { topics: Hex[]; data: Hex }[]
    for (const l of found.reverse()) {
      const owner = getAddress(`0x${l.topics[2]!.slice(26)}`)
      if (holders.some((h) => h.address === owner)) continue
      const code = await state.getCode({ address: owner })
      if (code && code !== '0x') continue
      const [label] = decodeAbiParameters([{ type: 'string' }], l.data)
      const tokenId = agentLabelToTokenId(label)
      const [bal, own] = await Promise.all([
        state.readContract({ address: AGENT_ID, abi: agentIdAbi, functionName: 'balanceOf', args: [owner] }),
        state.readContract({ address: AGENT_ID, abi: agentIdAbi, functionName: 'ownerOf', args: [tokenId] }).catch(() => null),
      ])
      if (bal > 0n && own === owner) holders.push({ address: owner, label, tokenId: tokenId.toString() })
      if (holders.length >= want) break
    }
  }
  if (holders.length < want) throw new Error('not enough holders found in recent mints')

  const block = toHex(await state.getBlockNumber())
  const calls: Hex[] = [encodeFunctionData({ abi: agentIdAbi, functionName: 'balanceOf', args: [NON_HOLDER] })]
  for (const h of holders) {
    calls.push(encodeFunctionData({ abi: agentIdAbi, functionName: 'balanceOf', args: [h.address] }))
    calls.push(encodeFunctionData({ abi: agentIdAbi, functionName: 'ownerOf', args: [BigInt(h.tokenId)] }))
  }
  const storage: Record<string, Record<string, Hex>> = {}
  for (const data of calls) {
    for (const entry of await accessSlots(data, block)) {
      const a = getAddress(entry.address)
      storage[a] ??= {}
      for (const k of entry.storageKeys) {
        storage[a][k] = (await state.getStorageAt({ address: a, slot: k, blockNumber: BigInt(block) })) ?? '0x0'
      }
    }
  }
  const codes: Record<string, Hex> = {}
  for (const a of [AGENT_ID, MULTICALL3, ...Object.keys(storage).map((x) => getAddress(x))]) {
    codes[a] = (await state.getCode({ address: a, blockNumber: BigInt(block) })) ?? '0x'
  }
  writeFileSync(
    out,
    JSON.stringify({ source: STATE_RPC, chainId: 56, block: Number(block), agentId: AGENT_ID, holders, nonHolder: NON_HOLDER, codes, storage }, null, 2),
  )
  console.log(`mirrored Agent ID at block ${Number(block)}: ${holders.map((h) => `${h.label}.ai`).join(', ')}; ${Object.values(storage).reduce((n, s) => n + Object.keys(s).length, 0)} storage slots`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
