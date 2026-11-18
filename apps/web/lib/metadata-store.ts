import 'server-only'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { hashCanonical, type MetadataKind } from '@skillproof/shared'
import type { Hex } from 'viem'

/**
 * Content-addressed store for canonical metadata JSON. Keys are keccak256(utf8(json)), the
 * same hash anchored on-chain, so a stored blob can always be re-verified and the store can
 * be rebuilt by anyone holding the JSON. Two adapters: Postgres (DATABASE_URL) for
 * production, local filesystem (.data/metadata) for development and demos.
 */
export interface MetadataStore {
  put(kind: MetadataKind, json: string): Promise<Hex>
  get(hash: Hex): Promise<string | null>
}

const HASH_RE = /^0x[0-9a-f]{64}$/

class FsStore implements MetadataStore {
  constructor(private dir: string) {}
  async put(_kind: MetadataKind, json: string) {
    const hash = hashCanonical(json)
    await mkdir(this.dir, { recursive: true })
    await writeFile(join(this.dir, `${hash}.json`), json, { flag: 'w' })
    return hash
  }
  async get(hash: Hex) {
    if (!HASH_RE.test(hash)) return null
    try {
      return await readFile(join(this.dir, `${hash}.json`), 'utf8')
    } catch {
      return null
    }
  }
}

class PgStore implements MetadataStore {
  private ready: Promise<void> | null = null
  private pool: import('pg').Pool | null = null
  constructor(private url: string) {}
  private async db() {
    if (!this.pool) {
      const { Pool } = await import('pg')
      this.pool = new Pool({ connectionString: this.url, max: 3 })
    }
    if (!this.ready) {
      this.ready = this.pool
        .query(
          `create table if not exists metadata_blobs (
             hash text primary key,
             kind text not null,
             json text not null,
             created_at timestamptz not null default now()
           )`,
        )
        .then(() => undefined)
    }
    await this.ready
    return this.pool
  }
  async put(kind: MetadataKind, json: string) {
    const hash = hashCanonical(json)
    const db = await this.db()
    await db.query('insert into metadata_blobs (hash, kind, json) values ($1, $2, $3) on conflict (hash) do nothing', [
      hash,
      kind,
      json,
    ])
    return hash
  }
  async get(hash: Hex) {
    if (!HASH_RE.test(hash)) return null
    const db = await this.db()
    const r = await db.query<{ json: string }>('select json from metadata_blobs where hash = $1', [hash])
    return r.rows[0]?.json ?? null
  }
}

let store: MetadataStore | null = null
export function metadataStore(): MetadataStore {
  if (!store) {
    const url = process.env.DATABASE_URL
    store = url ? new PgStore(url) : new FsStore(process.env.METADATA_DIR || join(process.cwd(), '.data', 'metadata'))
  }
  return store
}

export function publicAppUrl() {
  return (process.env.PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')
}

export function metadataUriFor(hash: Hex) {
  return `${publicAppUrl()}/api/metadata/${hash}`
}
