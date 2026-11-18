import { errorResponse, json } from '@/lib/http'
import { getIssuers } from '@/lib/reads'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return json({ issuers: await getIssuers() })
  } catch (e) {
    return errorResponse(e)
  }
}
