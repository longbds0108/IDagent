import 'server-only'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/** Signed, self-contained tokens (no server-side store, so they work across serverless instances). */
function secret(): string {
  const s = process.env.AUTH_SECRET
  if (!s || s.length < 32) throw new Error('AUTH_SECRET (32+ characters) is not set')
  return s
}

export function signToken(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const mac = createHmac('sha256', secret()).update(body).digest('base64url')
  return `${body}.${mac}`
}

export function readToken<T>(token: string): T | null {
  const [body, mac] = token.split('.')
  if (!body || !mac) return null
  const expected = createHmac('sha256', secret()).update(body).digest('base64url')
  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString()) as T
  } catch {
    return null
  }
}

export function newNonce(): string {
  return BigInt(`0x${randomBytes(16).toString('hex')}`).toString()
}

export const SESSION_COOKIE = 'attested_session'
export const SESSION_TTL_S = 7 * 24 * 3600
