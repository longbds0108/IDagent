import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function shortAddress(a: string, chars = 4) {
  return a.length > 2 + chars * 2 ? `${a.slice(0, 2 + chars)}…${a.slice(-chars)}` : a
}

export function shortHash(h: string) {
  return h.length > 18 ? `${h.slice(0, 10)}…${h.slice(-6)}` : h
}

export function formatDate(unixSeconds: number | string | bigint) {
  const n = Number(unixSeconds)
  if (!n) return '—'
  return new Date(n * 1000).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })
}

/** JSON-safe serialization of bigint-bearing values for API responses. */
export function toJsonSafe<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)))
}
