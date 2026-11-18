import { explorerAddressUrl } from '@skillproof/shared'
import { publicEnv } from '@/lib/env'
import { MetaStatusNote } from './trust'

/** "Inspect evidence": the raw on-chain anchors plus the canonical JSON they commit to. */
export function InspectEvidence({
  contract,
  contractName,
  recordLabel,
  hash,
  uri,
  status,
  raw,
  extra,
}: {
  contract: string
  contractName: string
  recordLabel: string
  hash: string
  uri?: string | null
  status: string
  raw: string | null
  extra?: [string, string][]
}) {
  let pretty: string | null = null
  if (raw) {
    try {
      pretty = JSON.stringify(JSON.parse(raw), null, 2)
    } catch {
      pretty = raw
    }
  }
  return (
    <details className="group text-[12.5px]">
      <summary className="cursor-pointer select-none font-mono text-[10.5px] uppercase tracking-[0.04em] text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-peer">
        Inspect evidence
      </summary>
      <div className="mt-3 space-y-2 border border-line bg-[#120f17] p-4">
        <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1">
          <dt className="text-ink-3">Chain</dt>
          <dd>BNB Smart Chain mainnet (56)</dd>
          <dt className="text-ink-3">Contract</dt>
          <dd className="break-anywhere font-mono">
            <a className="underline decoration-line-strong" href={explorerAddressUrl(contract, publicEnv.explorerUrl)} target="_blank" rel="noreferrer">
              {contractName}
            </a>{' '}
            · {recordLabel}
          </dd>
          <dt className="text-ink-3">keccak256</dt>
          <dd className="break-anywhere font-mono">{hash}</dd>
          {uri ? (
            <>
              <dt className="text-ink-3">Metadata URI</dt>
              <dd className="break-anywhere font-mono">{uri}</dd>
            </>
          ) : null}
          {extra?.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-ink-3">{k}</dt>
              <dd className="break-anywhere font-mono">{v}</dd>
            </div>
          ))}
        </dl>
        <MetaStatusNote status={status} />
        {pretty ? (
          <pre className="max-h-64 overflow-auto border border-line bg-bg p-3 font-mono text-[11.5px] leading-relaxed text-ink-2">{pretty}</pre>
        ) : null}
        <p className="text-ink-3">
          A matching hash proves the JSON above is exactly what was anchored on-chain. It does not prove the content is true.
        </p>
      </div>
    </details>
  )
}
