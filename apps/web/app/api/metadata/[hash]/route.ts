import { hashCanonical } from '@skillproof/shared'
import type { Hex } from 'viem'
import { metadataStore } from '@/lib/metadata-store'

/** Serve canonical metadata bytes exactly as hashed (immutable, content-addressed). */
export async function GET(_req: Request, { params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params
  const h = hash.toLowerCase().replace(/\.json$/, '') as Hex
  if (!/^0x[0-9a-f]{64}$/.test(h)) return new Response('Bad hash', { status: 400 })
  const raw = await metadataStore().get(h)
  if (raw === null || hashCanonical(raw) !== h) return new Response('Not found', { status: 404 })
  return new Response(raw, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=31536000, immutable',
      'x-skillproof-keccak256': h,
      'access-control-allow-origin': '*',
    },
  })
}
