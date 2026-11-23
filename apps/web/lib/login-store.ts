import 'server-only'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Address } from 'viem'

/**
 * A sign-in waiting for the Agentic Wallet. `pid` is public and goes into the prompt. The browser keeps
 * a secret whose SHA-256 is stored here, so the agent can finish the sign-in but cannot open the session.
 */
export interface PendingLogin {
  pid: string
  secretHash: string
  address: Address
  expiresAt: number
  approved: boolean
}

interface LoginStore {
  put(row: PendingLogin): Promise<void>
  get(pid: string): Promise<PendingLogin | null>
  approve(pid: string): Promise<void>
  remove(pid: string): Promise<void>
}

const PID_RE = /^[0-9a-f]{32}$/

class FsLogins implements LoginStore {
  constructor(private dir: string) {}
  private file(pid: string) {
    if (!PID_RE.test(pid)) throw new Error('invalid login id')
    return join(this.dir, `${pid}.json`)
  }
  async put(row: PendingLogin) {
    await mkdir(this.dir, { recursive: true })
    await writeFile(this.file(row.pid), JSON.stringify(row))
  }
  async get(pid: string) {
    if (!PID_RE.test(pid)) return null
    try {
      return JSON.parse(await readFile(this.file(pid), 'utf8')) as PendingLogin
    } catch {
      return null
    }
  }
  async approve(pid: string) {
    const row = await this.get(pid)
    if (row) await writeFile(this.file(pid), JSON.stringify({ ...row, approved: true }))
  }
  async remove(pid: string) {
    if (PID_RE.test(pid)) await rm(this.file(pid), { force: true })
  }
}

class PgLogins implements LoginStore {
  private pool: import('pg').Pool | null = null
  private ready: Promise<unknown> | null = null
  constructor(private url: string) {}
  private async db() {
    if (!this.pool) {
      const { Pool } = await import('pg')
      this.pool = new Pool({ connectionString: this.url, max: 3 })
    }
    this.ready ??= this.pool.query(
      `create table if not exists pending_logins (
         pid text primary key,
         secret_hash text not null,
         address text not null,
         expires_at bigint not null,
         approved boolean not null default false
       )`,
    )
    await this.ready
    return this.pool
  }
  async put(row: PendingLogin) {
    const db = await this.db()
    await db.query('delete from pending_logins where expires_at < $1', [Math.floor(Date.now() / 1000)])
    await db.query('insert into pending_logins (pid, secret_hash, address, expires_at, approved) values ($1, $2, $3, $4, false)', [
      row.pid,
      row.secretHash,
      row.address.toLowerCase(),
      row.expiresAt,
    ])
  }
  async get(pid: string) {
    if (!PID_RE.test(pid)) return null
    const r = await (await this.db()).query<{ pid: string; secret_hash: string; address: string; expires_at: string; approved: boolean }>(
      'select pid, secret_hash, address, expires_at, approved from pending_logins where pid = $1',
      [pid],
    )
    const x = r.rows[0]
    return x ? { pid: x.pid, secretHash: x.secret_hash, address: x.address as Address, expiresAt: Number(x.expires_at), approved: x.approved } : null
  }
  async approve(pid: string) {
    if (PID_RE.test(pid)) await (await this.db()).query('update pending_logins set approved = true where pid = $1', [pid])
  }
  async remove(pid: string) {
    if (PID_RE.test(pid)) await (await this.db()).query('delete from pending_logins where pid = $1', [pid])
  }
}

let store: LoginStore | null = null
/** Postgres when DATABASE_URL is set (production), else files under .data/logins (local demos). */
export function loginStore(): LoginStore {
  store ??= process.env.DATABASE_URL
    ? new PgLogins(process.env.DATABASE_URL)
    : new FsLogins(process.env.LOGIN_DIR || join(process.cwd(), '.data', 'logins'))
  return store
}
