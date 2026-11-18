'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { type Address, type Hex } from 'viem'
import { useChainId, useSignTypedData, useSwitchChain } from 'wagmi'
import { BSC_CHAIN_ID } from '@skillproof/shared'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/card'
import { Textarea } from '@/components/ui/field'
import { useIdentity } from '@/components/wallet/identity'
import { deployedContracts } from '@/lib/env'
import { explainError } from '@/lib/errors'
import { getJson } from '@/lib/client-api'
import {
  bawSignCommand,
  normalizeSignature,
  DEFAULT_PREFERENCES,
  PREFERENCE_TYPES,
  preferenceDomain,
  preferenceMessage,
  type Preferences,
} from '@/lib/preferences'

export function usePreferences(address: Address | null | undefined) {
  return useQuery({
    queryKey: ['preferences', address],
    enabled: !!address,
    queryFn: () => getJson<Preferences & { signed: boolean }>(`/api/preferences/${address}`),
  })
}

type Phase = { k: 'idle' } | { k: 'signing' } | { k: 'agent'; prefs: Preferences; cmd: string } | { k: 'saving' } | { k: 'done' } | { k: 'error'; msg: string }

/**
 * Signs a full preferences snapshot (EIP-712) with the acting identity and stores it.
 * Browser wallet: eth_signTypedData_v4. Agentic Wallet: `baw sign-message` command, signature pasted back.
 * Nothing is sent on-chain and no gas is spent.
 */
export function PreferenceSigner({
  build,
  label,
  variant = 'primary',
  compact,
  disabled,
}: {
  build: (current: Preferences) => Omit<Preferences, 'issuedAt' | 'account'>
  label: string
  variant?: 'primary' | 'secondary' | 'danger'
  compact?: boolean
  disabled?: boolean
}) {
  const { address, mode } = useIdentity()
  const current = usePreferences(address)
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const { signTypedDataAsync } = useSignTypedData()
  const qc = useQueryClient()
  const [phase, setPhase] = useState<Phase>({ k: 'idle' })
  const [sig, setSig] = useState('')
  const [rec, setRec] = useState('')
  const normalized = normalizeSignature(sig, rec)
  const c = deployedContracts()
  if (!address || !c) return null

  async function save(prefs: Preferences, signature: Hex) {
    setPhase({ k: 'saving' })
    const r = await fetch('/api/preferences', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...prefs, signature }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) return setPhase({ k: 'error', msg: j.error ?? 'Could not save preferences' })
    await qc.invalidateQueries()
    setPhase({ k: 'done' })
    setSig('')
  }

  async function start() {
    const base = current.data ?? DEFAULT_PREFERENCES(address!)
    const prefs: Preferences = { ...build(base), account: address!, issuedAt: Math.floor(Date.now() / 1000) }
    if (mode === 'agent') return setPhase({ k: 'agent', prefs, cmd: bawSignCommand(prefs, c!.profileRegistry) })
    try {
      setPhase({ k: 'signing' })
      if (chainId !== BSC_CHAIN_ID) await switchChainAsync({ chainId: BSC_CHAIN_ID })
      const signature = await signTypedDataAsync({
        domain: preferenceDomain(c!.profileRegistry),
        types: PREFERENCE_TYPES,
        primaryType: 'Preferences',
        message: preferenceMessage(prefs),
      })
      await save(prefs, signature)
    } catch (e) {
      setPhase({ k: 'error', msg: explainError(e) })
    }
  }

  return (
    <div className="space-y-2.5">
      {phase.k !== 'agent' ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button size={compact ? 'sm' : 'md'} variant={variant} disabled={disabled || phase.k === 'signing' || phase.k === 'saving' || current.isLoading} onClick={start}>
            {phase.k === 'signing' ? 'Check your wallet…' : phase.k === 'saving' ? 'Saving…' : label}
          </Button>
          {!compact ? <span className="sp-label !normal-case !tracking-normal">Signed message (EIP-712) · no transaction, no gas</span> : null}
          {phase.k === 'done' ? <span className="font-mono text-[11px] text-ok">SAVED ✓</span> : null}
        </div>
      ) : null}
      {phase.k === 'error' ? <Notice tone="bad">{phase.msg}</Notice> : null}
      {phase.k === 'agent' ? (
        <div className="space-y-3 border border-line bg-[#120f17] p-4 text-[13px]">
          <ol className="list-decimal space-y-1 pl-5 text-ink-2">
            <li>Developer Mode must be on in the Binance App (check with <code className="font-mono">baw wallet settings --json</code>).</li>
            <li>Ask your AI agent to run this preview and show you the typed data.</li>
            <li>
              If it matches, let it run <code className="font-mono">baw sign-message execute --requestId …</code>. If the status is
              PENDING_CONFIRMATION, approve in the Binance App, then <code className="font-mono">baw sign-message result --order-id …</code>.
            </li>
            <li>Paste <code className="font-mono">signature</code> (and <code className="font-mono">signatureRecovery</code> if it is separate) within 15 minutes.</li>
          </ol>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all border border-line bg-bg p-3 font-mono text-[11px] text-ink-2">{phase.cmd}</pre>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => navigator.clipboard?.writeText(phase.cmd)}>
              Copy command
            </Button>
          </div>
          <Textarea value={sig} onChange={(e) => setSig(e.target.value.trim())} placeholder="signature (0x…)" className="min-h-16 font-mono text-[12px]" aria-label="Signature" />
          <input
            value={rec}
            onChange={(e) => setRec(e.target.value.trim())}
            placeholder="signatureRecovery, e.g. 01 (only if the signature is 64 bytes)"
            aria-label="Signature recovery"
            className="h-10 w-full border border-line-strong bg-bg px-3 font-mono text-[12px] focus:border-accent focus:outline-none"
          />
          {sig && !normalized ? <p className="text-[12px] text-bad">Not a valid signature yet. A 64-byte signature needs signatureRecovery.</p> : null}
          <div className="flex gap-2">
            <Button size="sm" disabled={!normalized} onClick={() => normalized && save(phase.prefs, normalized as Hex)}>
              Save signed preferences
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPhase({ k: 'idle' })}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
