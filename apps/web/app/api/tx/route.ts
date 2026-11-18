import { errorResponse, json } from '@/lib/http'
import { findRecordTx, RECORD_EVENTS, type RecordEventKind } from '@/lib/reads'

/** Find the transaction that wrote a record: /api/tx?kind=attestation-issued&id=3&block=123 */
export async function GET(req: Request) {
  const u = new URL(req.url)
  const kind = u.searchParams.get('kind') as RecordEventKind | null
  const id = u.searchParams.get('id')
  const block = u.searchParams.get('block')
  if (!kind || !(kind in RECORD_EVENTS) || !id || !/^\d+$/.test(id) || !block || !/^\d+$/.test(block) || block === '0') {
    return json({ error: 'Invalid query' }, { status: 400 })
  }
  try {
    const hash = await findRecordTx(kind, BigInt(id), BigInt(block))
    return json({ hash }, { headers: hash ? { 'cache-control': 'public, max-age=86400, immutable' } : {} })
  } catch (e) {
    return errorResponse(e)
  }
}
