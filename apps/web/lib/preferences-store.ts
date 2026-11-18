import 'server-only'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getAddress, type Address } from 'viem'
import type { SignedPreferences } from './preferences'

/** Latest signed preferences per account (Postgres when DATABASE_URL is set, else filesystem). */
interface PrefStore {
  get(a: Address): Promise<SignedPreferences | null>
  put(p: SignedPreferences): Promise<void>
  all(): Promise<SignedPreferences[]>
}

class FsPrefs implements PrefStore {
  constructor(private dir: string) {}
  private file(a: Address) {
    return join(this.dir, `${getAddress(a).toLowerCase()}.json`)
  }
  async get(a: Address) {
    try {
      return JSON.parse(await readFile(this.file(a), 'utf8')) as SignedPreferences
    } catch {
      return null
    }
  }
  async put(p: SignedPreferences) {
    await mkdir(this.dir, { recursive: true })
    await writeFile(this.file(p.account), JSON.stringify(p))
  }
  async all() {
    const { readdir } = await import('node:fs/promises')
    try {
      const files = (await readdir(this.dir)).filter((f) => f.endsWith('.json'))
      const out = await Promise.all(files.map((f) => readFile(join(this.dir, f), 'utf8').then((t) => JSON.parse(t) as SignedPreferences)))
      return out
    } catch {
      return []
    }
  }
}

class PgPrefs implements PrefStore {
  private pool: import('pg').Pool | null = null
  private ready: Promise<unknown> | null = null
  constructor(private url: string) {}
  private async db() {
    if (!this.pool) {
      const { Pool } = await import('pg')
      this.pool = new Pool({ connectionString: this.url, max: 3 })
    }
    this.ready ??= this.pool.query(
      'create table if not exists account_preferences (account text primary key, json text not null, issued_at bigint not null)',
    )
    await this.ready
    return this.pool
  }
  async get(a: Address) {
    const r = await (await this.db()).query<{ json: string }>('select json from account_preferences where account = $1', [a.toLowerCase()])
    return r.rows[0] ? (JSON.parse(r.rows[0].json) as SignedPreferences) : null
  }
  async put(p: SignedPreferences) {
    await (await this.db()).query(
      `insert into account_preferences (account, json, issued_at) values ($1, $2, $3)
       on conflict (account) do update set json = excluded.json, issued_at = excluded.issued_at
       where account_preferences.issued_at < excluded.issued_at`,
      [p.account.toLowerCase(), JSON.stringify(p), p.issuedAt],
    )
  }
  async all() {
    const r = await (await this.db()).query<{ json: string }>('select json from account_preferences')
    return r.rows.map((x) => JSON.parse(x.json) as SignedPreferences)
  }
}

let store: PrefStore | null = null
export function preferenceStore(): PrefStore {
  store ??= process.env.DATABASE_URL
    ? new PgPrefs(process.env.DATABASE_URL)
    : new FsPrefs(join(process.env.METADATA_DIR ? join(process.env.METADATA_DIR, '..') : join(process.cwd(), '.data'), 'preferences'))
  return store
}
