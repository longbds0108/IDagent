import { getAddress, isAddress } from 'viem'
import { errorResponse, json } from '@/lib/http'
import { getAttestationsIssued, getCredentialsIssuedBy } from '@/lib/reads'

export const dynamic = 'force-dynamic'

/** Attestations signed and credentials issued by an address. */
export async function GET(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params
  if (!isAddress(address)) return json({ error: 'Invalid address' }, { status: 400 })
  try {
    const a = getAddress(address)
    const [attestations, credentials] = await Promise.all([getAttestationsIssued(a), getCredentialsIssuedBy(a)])
    return json({ attestations, credentials })
  } catch (e) {
    return errorResponse(e)
  }
}
