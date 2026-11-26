'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { isHex, type Hex } from 'viem'
import { ACTION_LABELS, AGENT_ID_GATED, explorerTxUrl, type SkillProofAction } from '@skillproof/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { Notice } from '@/components/ui/card'
import { useIdentity } from '@/components/wallet/identity'
import { useToast } from '@/components/toast'
import { deployedContracts, publicEnv, isLocalRpc } from '@/lib/env'
import { publicClient } from '@/lib/public-client'
import { explainError } from '@/lib/errors'
import { toJsonSafe } from '@/lib/utils'

type Phase =
  | { k: 'idle' }
  | { k: 'preparing' }
  | { k: 'agent'; action: SkillProofAction; fee: string | null; to: string; data: Hex; preview: string }
  | { k: 'pending'; hash: Hex }
  | { k: 'confirmed'; hash: Hex; block: bigint }
  | { k: 'detected' }
  | { k: 'reverted'; hash: Hex }
  | { k: 'error'; message: string }

/** Gas cap = simulated estimate + 30%, within the range baw accepts. */
export function gasWithMargin(estimate: bigint): bigint {
  const g = (estimate * 13n) / 10n
  return g < 21_000n ? 21_000n : g > 15_000_000n ? 15_000_000n : g
}

const DETECT_EVERY_MS = 4_000
const DETECT_MAX_TRIES = 150 // about 10 minutes

/**
 * One on-chain write, always through the user's Agent ID wallet:
 * 1. Simulate. 2. Show the `baw` command. 3. The user's agent runs it and approves in the Binance App.
 * 4. The page notices the change on-chain by itself (when `detect` is given), or the user pastes the
 *    transaction hash. 5. Success is shown only after the chain confirms the change.
 */
export function ActionRunner({
  prepare,
  label,
  variant = 'primary',
  disabled,
  onConfirmed,
  compact,
  detect,
}: {
  prepare: () => Promise<SkillProofAction>
  label?: string
  variant?: 'primary' | 'danger' | 'secondary' | 'accent'
  disabled?: boolean
  onConfirmed?: (hash?: Hex) => void
  compact?: boolean
  /** Resolves true once the change is on-chain. Polled while the agent is working. */
  detect?: () => Promise<boolean>
}) {
  const { address, account } = useIdentity()
  const qc = useQueryClient()
  const router = useRouter()
  const toast = useToast()
  const [phase, setPhase] = useState<Phase>({ k: 'idle' })
  const [pasted, setPasted] = useState('')
  const [copiedCmd, setCopiedCmd] = useState(false)
  const [trackBusy, setTrackBusy] = useState(false)
  const [trackError, setTrackError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const contracts = deployedContracts()
  const detectRef = useRef(detect)
  detectRef.current = detect
  const finishedRef = useRef(false)

  // On a phone the user is at the bottom of the box. Bring the result into view.
  useEffect(() => {
    if (phase.k === 'confirmed' || phase.k === 'detected' || phase.k === 'reverted' || phase.k === 'error') {
      rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [phase.k])

  // Watch the chain while the agent works, so the user does not have to paste anything.
  useEffect(() => {
    if (phase.k !== 'agent' || !detectRef.current) return
    let tries = 0
    let stopped = false
    const timer = setInterval(async () => {
      if (stopped || ++tries > DETECT_MAX_TRIES) return clearInterval(timer)
      try {
        if (await detectRef.current!()) {
          clearInterval(timer)
          if (!stopped) await succeed({ k: 'detected' }, `${name} done.`)
        }
      } catch {
        // A failed poll is retried on the next tick.
      }
    }, DETECT_EVERY_MS)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [phase.k])

  if (!contracts) return <Notice tone="warn">Contracts are not configured.</Notice>
  if (!address) return <Notice>Connect your Agent ID wallet first.</Notice>

  const busy = phase.k === 'preparing' || phase.k === 'pending'
  const name = label ?? 'Continue'

  /** Copy text. Tries the Clipboard API, then the older copy command, which in-app browsers still allow. */
  function copyText(text: string): boolean {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '0'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, text.length)
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false
    }
    document.body.removeChild(ta)
    return ok
  }

  async function copyCommand(text: string) {
    let ok = false
    try {
      await navigator.clipboard.writeText(text)
      ok = true
    } catch {
      ok = copyText(text)
    }
    if (ok) {
      setCopiedCmd(true)
      setTimeout(() => setCopiedCmd(false), 2000)
      return
    }
    // Last resort: select the command so the user can long-press and copy it.
    const el = document.getElementById('attested-command')
    if (el) {
      const range = document.createRange()
      range.selectNodeContents(el)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
    toast({ tone: 'info', text: 'Press and hold the command, then choose Copy.' })
  }

  async function start() {
    finishedRef.current = false
    setPhase({ k: 'preparing' })
    let action: SkillProofAction
    try {
      action = await prepare()
    } catch (e) {
      return setPhase({ k: 'error', message: (e as Error).message })
    }
    const sim = await fetch('/api/simulate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ from: address, call: toJsonSafe(action) }),
    })
      .then((r) => r.json())
      .catch(() => ({ ok: false, error: 'Check failed. Try again.' }))
    if (!sim.ok) return setPhase({ k: 'error', message: sim.error ?? 'This would fail on-chain.' })

    const cd = await fetch('/api/calldata', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        from: address,
        call: toJsonSafe(action),
        gasLimit: sim.gas ? gasWithMargin(BigInt(sim.gas)).toString() : undefined,
      }),
    }).then((r) => r.json())
    if (!cd.baw) return setPhase({ k: 'error', message: cd.error ?? 'Could not prepare the transaction.' })
    setPhase({ k: 'agent', action, fee: sim.feeBnb ?? null, to: cd.to, data: cd.data, preview: cd.baw.preview })
  }

  /** Shared success path: the change is on-chain. Runs once, however it was detected. */
  async function succeed(next: Phase, text: string, hash?: Hex) {
    if (finishedRef.current) return
    finishedRef.current = true
    setPhase(next)
    toast({ tone: 'ok', text, href: hash ? explorerTxUrl(hash, publicEnv.explorerUrl) : undefined, linkLabel: isLocalRpc ? 'Local tx' : 'View tx' })
    void fetch('/api/revalidate', { method: 'POST' }).catch(() => {})
    await qc.invalidateQueries()
    router.refresh()
    onConfirmed?.(hash)
  }

  /** Check a transaction hash the user pasted. Errors stay next to the field, so the box stays on screen. */
  async function track(hash: Hex, expect: { to: string; data: Hex }) {
    finishedRef.current = false
    setTrackError(null)
    setTrackBusy(true)
    try {
      let tx
      try {
        tx = await publicClient.getTransaction({ hash })
      } catch {
        setTrackError('BNB Chain has not seen this transaction yet. Wait a minute, then press Track again.')
        return
      }
      if (
        tx.to?.toLowerCase() !== expect.to.toLowerCase() ||
        tx.from.toLowerCase() !== address?.toLowerCase() ||
        tx.input.toLowerCase() !== expect.data.toLowerCase()
      ) {
        setTrackError('This is a different transaction. Paste the hash of the execute transaction for this action.')
        return
      }
      const r = await publicClient.waitForTransactionReceipt({ hash, timeout: 180_000 })
      if (r.status === 'success') {
        await succeed({ k: 'confirmed', hash, block: r.blockNumber }, `${name} done (block ${r.blockNumber}).`, hash)
      } else {
        setPhase({ k: 'reverted', hash })
        toast({ tone: 'bad', text: `${name} failed. Nothing changed.`, href: explorerTxUrl(hash, publicEnv.explorerUrl), linkLabel: 'View tx' })
      }
    } catch (e) {
      setTrackError(`Not confirmed yet: ${explainError(e)}`)
    } finally {
      setTrackBusy(false)
    }
  }

  return (
    <div ref={rootRef} className="space-y-3">
      {phase.k === 'idle' || phase.k === 'error' || phase.k === 'preparing' ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant={variant} size={compact ? 'sm' : 'md'} disabled={disabled || busy || !account?.agentIdHeld} onClick={start}>
            {phase.k === 'preparing' ? 'Checking…' : name}
          </Button>
        </div>
      ) : null}

      {phase.k === 'error' ? <Notice tone="bad">{phase.message}</Notice> : null}

      {phase.k === 'agent' ? (
        <div className="box-field space-y-4 p-4 text-[13.5px]">
          <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1">
            <dt className="text-ink-3">Action</dt>
            <dd className="font-medium">{ACTION_LABELS[phase.action.action]}</dd>
            <dt className="text-ink-3">Gate</dt>
            <dd>{AGENT_ID_GATED[phase.action.action] ? 'Agent ID required' : 'Owner only'}</dd>
            <dt className="text-ink-3">Fee</dt>
            <dd>{phase.fee ? `≈ ${Number(phase.fee).toFixed(6)} BNB` : '—'}</dd>
          </dl>
          <ol className="list-decimal space-y-1 pl-5 text-ink-2">
            <li>Copy the command below.</li>
            <li>Paste it to your AI agent and approve in the Binance App.</li>
            {detectRef.current ? (
              <li>This page updates by itself when it is done.</li>
            ) : (
              <li>Copy the transaction hash the agent shows after execute, then paste it below.</li>
            )}
          </ol>
          <p className="text-[12.5px] text-ink-3">Needs Developer Mode: Agentic Wallet → Settings in the Binance App.</p>
          <Button size="sm" variant="secondary" onClick={() => copyCommand(phase.preview)}>
            {copiedCmd ? 'Copied ✓' : 'Copy command'}
          </Button>
          <pre
            id="attested-command"
            className="max-h-40 overflow-auto whitespace-pre-wrap break-all border border-line bg-bg p-3 font-mono text-[11.5px] text-ink-2"
          >
            {phase.preview}
          </pre>
          {detectRef.current ? <p className="text-[12.5px] text-ink-3">Already sent it? Paste the transaction hash to check it now.</p> : null}
          <div className="flex flex-wrap gap-2">
            <Input
              value={pasted}
              onChange={(e) => {
                setPasted(e.target.value)
                setTrackError(null)
              }}
              placeholder="0x… transaction hash (66 characters)"
              className="min-w-0 flex-1 font-mono"
              aria-label="Transaction hash"
            />
            {pasted.trim() && !(isHex(pasted.trim()) && pasted.trim().length === 66) ? (
              <p className="w-full text-[12.5px] text-bad">
                Not a transaction hash. It must start with 0x and have 66 characters.
              </p>
            ) : null}
            <Button
              disabled={trackBusy || !(isHex(pasted.trim()) && pasted.trim().length === 66)}
              onClick={() => track(pasted.trim() as Hex, { to: phase.to, data: phase.data })}
            >
              {trackBusy ? 'Checking…' : 'Track'}
            </Button>
            {trackError ? <p className="w-full text-[12.5px] text-bad">{trackError}</p> : null}
            <Button variant="ghost" onClick={() => setPhase({ k: 'idle' })}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {phase.k === 'pending' ? (
        <Notice tone="warn">
          Waiting for confirmation…{' '}
          <a className="font-medium underline" href={explorerTxUrl(phase.hash, publicEnv.explorerUrl)} target="_blank" rel="noreferrer">
            View tx ↗
          </a>
        </Notice>
      ) : null}
      {phase.k === 'detected' ? <Notice tone="ok">Done. The change is on-chain.</Notice> : null}
      {phase.k === 'confirmed' ? (
        <Notice tone="ok">
          Done in block {phase.block.toString()}.{' '}
          <a className="font-medium underline" href={explorerTxUrl(phase.hash, publicEnv.explorerUrl)} target="_blank" rel="noreferrer">
            View tx ↗
          </a>
        </Notice>
      ) : null}
      {phase.k === 'reverted' ? (
        <Notice tone="bad">
          Failed on-chain. Nothing changed.{' '}
          <a className="font-medium underline" href={explorerTxUrl(phase.hash, publicEnv.explorerUrl)} target="_blank" rel="noreferrer">
            View tx ↗
          </a>
        </Notice>
      ) : null}
    </div>
  )
}
