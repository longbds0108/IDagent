'use client'

import { useQuery } from '@tanstack/react-query'
import { explorerAddressUrl, explorerTxUrl } from '@skillproof/shared'
import { publicEnv } from '@/lib/env'
import { shortAddress } from '@/lib/utils'

const linkCls = 'font-mono text-[10.5px] uppercase tracking-[0.04em] text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-peer hover:decoration-accent'

export function AddressLink({ address, label }: { address: string; label?: string }) {
  return (
    <a href={explorerAddressUrl(address, publicEnv.explorerUrl)} target="_blank" rel="noreferrer" className={`${linkCls} !normal-case`}>
      {label ?? shortAddress(address)}
    </a>
  )
}

/** "View transaction": finds the tx that wrote a record via a single-block log query. */
export function TxLink({ kind, id, block, label = 'View transaction' }: { kind: string; id: string; block: number; label?: string }) {
  const q = useQuery({
    queryKey: ['tx', kind, id, block],
    enabled: block > 0,
    staleTime: Infinity,
    queryFn: async () => {
      const r = await fetch(`/api/tx?kind=${kind}&id=${id}&block=${block}`)
      if (!r.ok) throw new Error('lookup failed')
      return ((await r.json()) as { hash: string | null }).hash
    },
  })
  if (q.data) {
    return (
      <a href={explorerTxUrl(q.data, publicEnv.explorerUrl)} target="_blank" rel="noreferrer" className={linkCls}>
        {label} ↗
      </a>
    )
  }
  return (
    <a
      href={`${publicEnv.explorerUrl}/block/${block}`}
      target="_blank"
      rel="noreferrer"
      className={linkCls}
      title={q.isLoading ? 'Looking up transaction…' : 'Transaction lookup unavailable; opening the block instead'}
    >
      {q.isLoading ? 'Finding transaction…' : `Block ${block} ↗`}
    </a>
  )
}
