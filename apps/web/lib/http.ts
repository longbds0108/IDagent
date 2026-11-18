import 'server-only'
import { NextResponse } from 'next/server'
import { toJsonSafe } from './utils'
import { NotConfiguredError } from './reads'

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(toJsonSafe(data), init)
}

export function errorResponse(e: unknown) {
  if (e instanceof NotConfiguredError) return json({ error: e.message, code: 'NOT_CONFIGURED' }, { status: 503 })
  console.error(e)
  return json({ error: 'Upstream RPC error. Try again shortly.' }, { status: 502 })
}
