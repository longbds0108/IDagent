'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
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
  | { k: 'reverted'; hash: Hex }
  | { k: 'error'; message: string }

/** Gas cap = simulated estimate + 30%, within the range baw accepts. */
export function gasWithMargin(estimate: bigint): bigint {
  const g = (estimate * 13n) / 10n
  return g < 21_000n ? 21_000n : g > 15_000_000n ? 15_000_000n : g
}

/**
 * One on-chain write, always through the user's Agent ID wallet:
 * 1. Simulate. 2. Show the `baw` command. 3. The user's agent runs it and approves in the Binance App.
 * 4. The user pastes the transaction hash. 5. Success is shown only after an on-chain receipt.
 */
export function ActionRunner({
  prepare,
  label,
  variant = 'primary',
  disabled,
  onConfirmed,
  compact,
}: {
  prepare: () => Promise<SkillProofAction>
  label?: string
  variant?: 'primary' | 'danger' | 'secondary' | 'accent'
  disabled?: boolean
  onConfirmed?: (hash: Hex) => void
  compact?: boolean
}) {
  const { address, account } = useIdentity()
  const qc = useQueryClient()
  const router = useRouter()
  const toast = useToast()
  const [phase, setPhase] = useState<Phase>({ k: 'idle' })
  const [pasted, setPasted] = useState('')
  const contracts = deployedContracts()

  if (!contracts) return <Notice tone="warn">Contracts are not configured.</Notice>
  if (!address) return <Notice>Connect your Agent ID wallet first.</Notice>

  const busy = phase.k === 'preparing' || phase.k === 'pending'
  const name = label ?? 'Continue'

  async function start() {
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

  async function track(hash: Hex, expect: { to: string; data: Hex }) {
    setPhase({ k: 'pending', hash })
    try {
      // Only accept the transaction we prepared, sent from this wallet.
      const tx = await publicClient.getTransaction({ hash })
      if (
        tx.to?.toLowerCase() !== expect.to.toLowerCase() ||
        tx.from.toLowerCase() !== address?.toLowerCase() ||
        tx.input.toLowerCase() !== expect.data.toLowerCase()
      ) {
        return setPhase({ k: 'error', message: 'This transaction is not the one we prepared.' })
      }
      const r = await publicClient.waitForTransactionReceipt({ hash, timeout: 180_000 })
      if (r.status === 'success') {
        setPhase({ k: 'confirmed', hash, block: r.blockNumber })
        toast({
          tone: 'ok',
          text: `${name} done (block ${r.blockNumber}).`,
          href: explorerTxUrl(hash, publicEnv.explorerUrl),
          linkLabel: isLocalRpc ? 'Local tx' : 'View tx',
        })
        await qc.invalidateQueries()
        router.refresh()
        onConfirmed?.(hash)
      } else {
        setPhase({ k: 'reverted', hash })
        toast({ tone: 'bad', text: `${name} failed. Nothing changed.`, href: explorerTxUrl(hash, publicEnv.explorerUrl), linkLabel: 'View tx' })
      }
    } catch (e) {
      setPhase({ k: 'error', message: `Not confirmed yet: ${explainError(e)}` })
    }
  }

  return (
    <div className="space-y-3">
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
            <li>Turn on Developer Mode in the Binance App (Agentic Wallet → Settings).</li>
            <li>Ask your AI agent to run this preview and show you the result.</li>
            <li>If it looks right, the agent runs <code className="font-mono">execute</code>. Approve in the Binance App if asked.</li>
            <li>Paste the transaction hash below.</li>
          </ol>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all border border-line bg-bg p-3 font-mono text-[11.5px] text-ink-2">
            {phase.preview}
          </pre>
          <div className="flex flex-wrap gap-2">
            <Input
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder="0x… transaction hash"
              className="min-w-0 flex-1 font-mono"
              aria-label="Transaction hash"
            />
            <Button
              disabled={!(isHex(pasted.trim()) && pasted.trim().length === 66)}
              onClick={() => track(pasted.trim() as Hex, { to: phase.to, data: phase.data })}
            >
              Track
            </Button>
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
