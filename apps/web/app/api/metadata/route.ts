import { z } from 'zod'
import { canonicalJson, MAX_METADATA_BYTES, metadataSchemas, type MetadataKind } from '@skillproof/shared'
import { metadataStore, metadataUriFor, publicAppUrl } from '@/lib/metadata-store'
import { isLocalRpc } from '@/lib/env'
import { json } from '@/lib/http'
import { clientKey, rateLimit } from '@/lib/rate-limit'

const body = z.object({
  kind: z.enum(['profile', 'project', 'attestation', 'credential']),
  data: z.record(z.unknown()),
})

const SCHEMA_IDS: Record<MetadataKind, string> = {
  profile: 'skillproof/profile@1',
  project: 'skillproof/project@1',
  attestation: 'skillproof/attestation@1',
  credential: 'skillproof/credential@1',
}

/**
 * Validate, sanitize and canonicalize public metadata, store it content-addressed, and return
 * the URI + keccak256 hash to anchor on-chain. Nothing is written on-chain here.
 */
export async function POST(req: Request) {
  if (!isLocalRpc && /localhost|127\.0\.0\.1/.test(publicAppUrl())) {
    // Never let a localhost URI be anchored on BNB Smart Chain mainnet.
    return json({ error: 'Server misconfigured: set PUBLIC_APP_URL to the public https origin before writing on mainnet.' }, { status: 503 })
  }
  if (!rateLimit(`meta:${clientKey(req)}`, 30, 30)) return json({ error: 'Too many requests' }, { status: 429 })
  const parsed = body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 })
  const { kind, data } = parsed.data
  const result = metadataSchemas[kind].safeParse({ ...data, schema: SCHEMA_IDS[kind] })
  if (!result.success) {
    return json(
      { error: 'Invalid metadata', issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
      { status: 400 },
    )
  }
  const canonical = canonicalJson(result.data)
  if (new TextEncoder().encode(canonical).length > MAX_METADATA_BYTES) {
    return json({ error: `Metadata exceeds ${MAX_METADATA_BYTES} bytes` }, { status: 413 })
  }
  const hash = await metadataStore().put(kind, canonical)
  return json({ kind, hash, uri: metadataUriFor(hash), canonical, data: result.data })
}
