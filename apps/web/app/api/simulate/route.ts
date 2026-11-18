import { z } from 'zod'
import { formatEther, isAddress, type Address } from 'viem'
import { prepareAction } from '@skillproof/shared'
import { actionSchema } from '@/lib/action-schema'
import { deployedContracts } from '@/lib/env'
import { json } from '@/lib/http'
import { client } from '@/lib/reads'
import { explainError } from '@/lib/errors'
import { clientKey, rateLimit } from '@/lib/rate-limit'

const body = z.object({ from: z.string().refine(isAddress), call: z.unknown() })

/** Dry-run an action from `from` (eth_call + gas estimate). Nothing is signed or sent. */
export async function POST(req: Request) {
  if (!rateLimit(`sim:${clientKey(req)}`, 60, 60)) return json({ error: 'Too many requests' }, { status: 429 })
  const c = deployedContracts()
  if (!c) return json({ error: 'Contracts not configured', code: 'NOT_CONFIGURED' }, { status: 503 })
  const parsed = body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return json({ error: 'Invalid request' }, { status: 400 })
  const action = actionSchema.safeParse(parsed.data.call)
  if (!action.success) return json({ error: 'Invalid action' }, { status: 400 })
  const from = parsed.data.from as Address
  const call = prepareAction(action.data, c)
  try {
    await client().simulateContract({
      account: from,
      address: call.to,
      abi: call.abi as never,
      functionName: call.functionName as never,
      args: call.args as never,
    })
    const [gas, gasPrice] = await Promise.all([
      client().estimateGas({ account: from, to: call.to, data: call.data }),
      client().getGasPrice(),
    ])
    return json({ ok: true, gas: gas.toString(), gasPrice: gasPrice.toString(), feeBnb: formatEther(gas * gasPrice) })
  } catch (e) {
    return json({ ok: false, error: explainError(e) })
  }
}
