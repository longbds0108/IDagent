import { getAddress, isAddress } from 'viem'
import { errorResponse, json } from '@/lib/http'
import { getAccount } from '@/lib/reads'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params
  if (!isAddress(address)) return json({ error: 'Invalid address' }, { status: 400 })
  try {
    return json(await getAccount(getAddress(address)))
  } catch (e) {
    return errorResponse(e)
  }
}
