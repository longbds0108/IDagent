'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { type Address, type Hex } from 'viem'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/card'
import { Textarea } from '@/components/ui/field'
import { useIdentity } from '@/components/wallet/identity'
import { useToast } from '@/components/toast'
import { deployedContracts } from '@/lib/env'
import { getJson } from '@/lib/client-api'
import { bawSignCommand, normalizeSignature, DEFAULT_PREFERENCES, type Preferences } from '@/lib/preferences'

export function usePreferences(address: Address | null | undefined) {
  return useQuery({
    queryKey: ['preferences', address],
    enabled: !!address,
    queryFn: () => getJson<Preferences & { signed: boolean }>(`/api/preferences/${address}`),
  })
}

type Phase = { k: 'idle' } | { k: 'preparing' } | { k: 'sign'; prefs: Preferences; cmd: string } | { k: 'saving' } | { k: 'done' } | { k: 'error'; msg: string }

/**
 * Signs a preferences snapshot (EIP-712) through the Agent ID wallet, then stores it.
 * The user's agent runs `baw sign-message`; the user pastes the signature back.
 * No transaction, no gas.
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
  const { address } = useIdentity()
  const current = usePreferences(address)
  const qc = useQueryClient()
  const toast = useToast()
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
    if (!r.ok) {
      toast({ tone: 'bad', text: j.error ?? 'Could not save.' })
      return setPhase({ k: 'error', msg: j.error ?? 'Could not save.' })
    }
    await qc.invalidateQueries()
    setPhase({ k: 'done' })
    toast({ tone: 'ok', text: `${label}: saved. No transaction sent.` })
    setSig('')
    setRec('')
  }

  async function start() {
    setPhase({ k: 'preparing' })
    // Build on the latest saved version, and keep issuedAt increasing.
    const latest = await getJson<Preferences & { signed: boolean }>(`/api/preferences/${address}`).catch(() => null)
    const base = latest ?? current.data ?? DEFAULT_PREFERENCES(address!)
    const issuedAt = Math.max(Math.floor(Date.now() / 1000), (base.issuedAt || 0) + 1)
    const prefs: Preferences = { ...build(base), account: address!, issuedAt }
    setPhase({ k: 'sign', prefs, cmd: bawSignCommand(prefs, c!.profileRegistry) })
  }

  return (
    <div className="space-y-2.5">
      {phase.k !== 'sign' ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size={compact ? 'sm' : 'md'}
            variant={variant}
            disabled={disabled || phase.k === 'preparing' || phase.k === 'saving' || current.isLoading}
            onClick={start}
          >
            {phase.k === 'preparing' ? 'Preparing…' : phase.k === 'saving' ? 'Saving…' : label}
          </Button>
          {!compact ? <span className="sp-label !normal-case !tracking-normal">Signed message · no transaction · no gas</span> : null}
          {phase.k === 'done' ? <span className="font-mono text-[11px] text-ok">SAVED ✓</span> : null}
        </div>
      ) : null}
      {phase.k === 'error' ? <Notice tone="bad">{phase.msg}</Notice> : null}
      {phase.k === 'sign' ? (
        <div className="box-field space-y-3 p-4 text-[13px]">
          <ol className="list-decimal space-y-1 pl-5 text-ink-2">
            <li>Ask your AI agent to run this and show you the data.</li>
            <li>If it looks right, the agent signs it. Approve in the Binance App if asked.</li>
            <li>Paste the signature below.</li>
          </ol>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all border border-line bg-bg p-3 font-mono text-[11px] text-ink-2">{phase.cmd}</pre>
          <Button size="sm" variant="secondary" onClick={() => navigator.clipboard?.writeText(phase.cmd)}>
            Copy command
          </Button>
          <Textarea
            value={sig}
            onChange={(e) => setSig(e.target.value.trim())}
            placeholder="Signature (0x…)"
            className="min-h-16 font-mono text-[12px]"
            aria-label="Signature"
          />
          <input
            value={rec}
            onChange={(e) => setRec(e.target.value.trim())}
            placeholder="Recovery id (only if the signature is 64 bytes)"
            aria-label="Signature recovery"
            className="box-field h-10 w-full px-3 font-mono text-[12px] focus:border-accent focus:outline-none"
          />
          {sig && !normalized ? <p className="text-[12px] text-bad">Not a valid signature yet.</p> : null}
          <div className="flex gap-2">
            <Button size="sm" disabled={!normalized} onClick={() => normalized && save(phase.prefs, normalized as Hex)}>
              Save
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
