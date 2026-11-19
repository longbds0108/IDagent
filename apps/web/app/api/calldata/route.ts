import { z } from 'zod'
import { isAddress, type Address } from 'viem'
import { ACTION_LABELS, AGENT_ID_GATED, bawPreviewCommand, prepareAction } from '@skillproof/shared'
import { actionSchema } from '@/lib/action-schema'
import { deployedContracts } from '@/lib/env'
import { json } from '@/lib/http'

const body = z.object({
  from: z.string().optional(),
  call: z.unknown(),
  gasLimit: z.string().regex(/^\d{5,8}$/).optional(),
})

/**
 * Agent path: returns the exact calldata for a Attested action and the matching
 * `baw contract-call preview` command for the user's own AI agent. This endpoint never signs,
 * never broadcasts and never sees keys, sessions or pairing codes.
 */
export async function POST(req: Request) {
  const c = deployedContracts()
  if (!c) return json({ error: 'Contracts not configured', code: 'NOT_CONFIGURED' }, { status: 503 })
  const parsed = body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return json({ error: 'Invalid request' }, { status: 400 })
  const action = actionSchema.safeParse(parsed.data.call)
  if (!action.success) {
    return json(
      { error: 'Invalid action', issues: action.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
      { status: 400 },
    )
  }
  const call = prepareAction(action.data, c)
  const from = parsed.data.from && isAddress(parsed.data.from) ? (parsed.data.from as Address) : null
  return json({
    action: action.data.action,
    label: ACTION_LABELS[action.data.action],
    requiresAgentId: AGENT_ID_GATED[action.data.action],
    chainId: call.chainId,
    to: call.to,
    data: call.data,
    value: '0',
    baw: from ? { preview: bawPreviewCommand(from, call, parsed.data.gasLimit ? BigInt(parsed.data.gasLimit) : undefined), execute: 'baw contract-call execute --requestId <requestId from preview> --json' } : null,
  })
}
