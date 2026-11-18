'use client'

import type { Hex } from 'viem'
import type { MetadataKind } from '@skillproof/shared'

export async function uploadMetadata(kind: MetadataKind, data: Record<string, unknown>): Promise<{ uri: string; hash: Hex }> {
  const r = await fetch('/api/metadata', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind, data }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) {
    const issues = (j.issues as { path: string; message: string }[] | undefined)?.map((i) => `${i.path || 'field'}: ${i.message}`)
    throw new Error(issues?.length ? issues.join(' · ') : (j.error ?? 'Metadata rejected'))
  }
  return { uri: j.uri, hash: j.hash }
}

export async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: 'no-store' })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`)
  return j as T
}
