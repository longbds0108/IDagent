/** Loads a mirror (see mirror-agent-id.mts) into a local anvil node started with --chain-id 56. */
import { readFileSync } from 'node:fs'
import { createTestClient, http, type Address, type Hex } from 'viem'

const RPC = process.env.FORK_RPC ?? 'http://127.0.0.1:8545'
const m = JSON.parse(readFileSync(process.argv[2]!, 'utf8')) as {
  codes: Record<Address, Hex>
  storage: Record<Address, Record<Hex, Hex>>
}
const test = createTestClient({ mode: 'anvil', transport: http(RPC) })
for (const [address, bytecode] of Object.entries(m.codes)) await test.setCode({ address: address as Address, bytecode })
for (const [address, slots] of Object.entries(m.storage))
  for (const [index, value] of Object.entries(slots)) await test.setStorageAt({ address: address as Address, index: index as Hex, value })
console.log(`applied ${Object.keys(m.codes).length} contracts and ${Object.values(m.storage).reduce((n, s) => n + Object.keys(s).length, 0)} slots`)
