'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { formatEther, isHex, type Hex } from 'viem'
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi'
import {
  ACTION_LABELS,
  AGENT_ID_GATED,
  BSC_CHAIN_ID,
  explorerTxUrl,
  prepareAction,
  type SkillProofAction,
} from '@skillproof/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { Notice } from '@/components/ui/card'
import { useIdentity } from '@/components/wallet/identity'
import { deployedContracts, publicEnv, isLocalRpc } from '@/lib/env'
import { explainError } from '@/lib/errors'
import { toJsonSafe } from '@/lib/utils'

type Phase =
  | { k: 'idle' }
  | { k: 'preparing' }
  | { k: 'review'; action: SkillProofAction; fee: string | null; gas: string | null }
  | { k: 'agent'; action: SkillProofAction; fee: string | null; to: string; data: Hex; preview: string; execute: string }
  | { k: 'signing' }
  | { k: 'pending'; hash: Hex }
  | { k: 'confirmed'; hash: Hex; block: bigint }
  | { k: 'reverted'; hash: Hex }
  | { k: 'error'; message: string }

/**
 * Runs one SkillProof write. Wallet mode: prepare → simulate + fee estimate → wallet prompt →
 * receipt. Agent mode: prepare → simulate → calldata + baw command → user pastes tx hash →
 * receipt. Success is only ever shown from an on-chain receipt.
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
  const { mode, address, account } = useIdentity()
  const chainId = useChainId()
  const { isConnected } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const publicClient = usePublicClient({ chainId: BSC_CHAIN_ID })
  const { writeContractAsync } = useWriteContract()
  const qc = useQueryClient()
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>({ k: 'idle' })
  const [pasted, setPasted] = useState('')
  const contracts = deployedContracts()

  const busy = phase.k === 'preparing' || phase.k === 'signing' || phase.k === 'pending'

  async function track(hash: Hex, expect?: { to: string; data: Hex }) {
    setPhase({ k: 'pending', hash })
    try {
      if (expect) {
        // Agent path: make sure the pasted hash is the transaction we prepared, from this address.
        const tx = await publicClient!.getTransaction({ hash })
        if (
          tx.to?.toLowerCase() !== expect.to.toLowerCase() ||
          tx.from.toLowerCase() !== address?.toLowerCase() ||
          tx.input.toLowerCase() !== expect.data.toLowerCase()
        ) {
          return setPhase({
            k: 'error',
            message: 'That transaction does not match the prepared call (different sender, contract or calldata).',
          })
        }
      }
      const r = await publicClient!.waitForTransactionReceipt({ hash, timeout: 180_000 })
      if (r.status === 'success') {
        setPhase({ k: 'confirmed', hash, block: r.blockNumber })
        await qc.invalidateQueries()
        router.refresh()
        onConfirmed?.(hash)
      } else setPhase({ k: 'reverted', hash })
    } catch (e) {
      setPhase({ k: 'error', message: `Could not confirm transaction yet: ${explainError(e)}` })
    }
  }

  async function start() {
    if (!contracts || !address) return
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
      .catch(() => ({ ok: false, error: 'Simulation request failed' }))
    if (!sim.ok) return setPhase({ k: 'error', message: sim.error ?? 'This transaction would revert.' })

    if (mode === 'agent') {
      const cd = await fetch('/api/calldata', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ from: address, call: toJsonSafe(action) }),
      }).then((r) => r.json())
      if (!cd.baw) return setPhase({ k: 'error', message: cd.error ?? 'Could not prepare calldata' })
      return setPhase({ k: 'agent', action, fee: sim.feeBnb, to: cd.to, data: cd.data, preview: cd.baw.preview, execute: cd.baw.execute })
    }
    setPhase({ k: 'review', action, fee: sim.feeBnb ?? null, gas: sim.gas ?? null })
  }

  async function sign(action: SkillProofAction) {
    if (!contracts) return
    if (chainId !== BSC_CHAIN_ID) {
      try {
        await switchChainAsync({ chainId: BSC_CHAIN_ID })
      } catch (e) {
        return setPhase({ k: 'error', message: `Switch to BNB Smart Chain first. ${explainError(e)}` })
      }
    }
    const call = prepareAction(action, contracts)
    setPhase({ k: 'signing' })
    try {
      const hash = await writeContractAsync({
        chainId: BSC_CHAIN_ID,
        address: call.to,
        abi: call.abi as never,
        functionName: call.functionName as never,
        args: call.args as never,
      })
      await track(hash)
    } catch (e) {
      setPhase({ k: 'error', message: explainError(e) })
    }
  }

  const gated = account && !account.agentIdHeld
  const wrongChain = mode === 'wallet' && isConnected && chainId !== BSC_CHAIN_ID

  if (!contracts) return <Notice tone="warn">Contracts are not configured for this deployment.</Notice>
  if (!address) return <Notice>Connect on the Dashboard to continue.</Notice>

  const title = label

  return (
    <div className="space-y-2.5">
      {phase.k === 'idle' || phase.k === 'error' || phase.k === 'preparing' ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={variant} size={compact ? 'sm' : 'md'} disabled={disabled || busy} onClick={start}>
            {phase.k === 'preparing' ? 'Checking…' : title}
          </Button>
          {!compact ? (
            <span className="text-[12px] text-ink-3">
              {mode === 'agent' ? 'Prepares calldata for your agent' : 'Simulates first, then asks your wallet'}
            </span>
          ) : null}
        </div>
      ) : null}

      {gated && phase.k === 'idle' && !compact ? (
        <Notice tone="warn">This address does not hold an Agent ID, so Agent-ID-gated actions will be rejected on-chain.</Notice>
      ) : null}

      {phase.k === 'error' ? <Notice tone="bad">{phase.message}</Notice> : null}

      {phase.k === 'review' ? (
        <div className="space-y-3 rounded-md border border-line bg-surface-2 p-3.5 text-[13px]">
          <ReviewRows action={phase.action} fee={phase.fee} gas={phase.gas} />
          {wrongChain ? <Notice tone="bad">Your wallet is not on BNB Smart Chain. You will be asked to switch first.</Notice> : null}
          <div className="flex flex-wrap gap-2">
            <Button variant={variant} onClick={() => sign(phase.action)}>
              Confirm in wallet
            </Button>
            <Button variant="ghost" onClick={() => setPhase({ k: 'idle' })}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {phase.k === 'agent' ? (
        <AgentHandoff
          phase={phase}
          pasted={pasted}
          setPasted={setPasted}
          onTrack={(h) => track(h, { to: phase.to, data: phase.data })}
          onCancel={() => setPhase({ k: 'idle' })}
        />
      ) : null}

      {phase.k === 'signing' ? <Notice>Waiting for your wallet. Check the wallet prompt; nothing has been sent yet.</Notice> : null}
      {phase.k === 'pending' ? (
        <Notice tone="warn">
          Submitted, waiting for confirmation on BNB Smart Chain…{' '}
          <TxAnchor hash={phase.hash} />
        </Notice>
      ) : null}
      {phase.k === 'confirmed' ? (
        <Notice tone="ok">
          Confirmed in block {phase.block.toString()}. <TxAnchor hash={phase.hash} />
        </Notice>
      ) : null}
      {phase.k === 'reverted' ? (
        <Notice tone="bad">
          The transaction was mined but reverted. Nothing changed. <TxAnchor hash={phase.hash} />
        </Notice>
      ) : null}
    </div>
  )
}

function TxAnchor({ hash }: { hash: Hex }) {
  return (
    <a className="font-medium underline" href={explorerTxUrl(hash, publicEnv.explorerUrl)} target="_blank" rel="noreferrer">
      {isLocalRpc ? 'Local fork tx' : 'View on BscScan'} ↗
    </a>
  )
}

function ReviewRows({ action, fee, gas }: { action: SkillProofAction; fee: string | null; gas: string | null }) {
  return (
    <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-1">
      <dt className="text-ink-3">Action</dt>
      <dd className="font-medium">{ACTION_LABELS[action.action]}</dd>
      <dt className="text-ink-3">Network</dt>
      <dd>BNB Smart Chain mainnet (56)</dd>
      <dt className="text-ink-3">Agent ID gate</dt>
      <dd>{AGENT_ID_GATED[action.action] ? 'Yes, sender must hold an Agent ID' : 'No'}</dd>
      <dt className="text-ink-3">Simulation</dt>
      <dd className="text-ok">Passes against current chain state</dd>
      <dt className="text-ink-3">Estimated fee</dt>
      <dd>{fee ? `≈ ${Number(fee).toFixed(6)} BNB` : 'unknown'}{gas ? <span className="text-ink-3"> · {gas} gas</span> : null}</dd>
    </dl>
  )
}

function AgentHandoff({
  phase,
  pasted,
  setPasted,
  onTrack,
  onCancel,
}: {
  phase: Extract<Phase, { k: 'agent' }>
  pasted: string
  setPasted: (v: string) => void
  onTrack: (h: Hex) => void
  onCancel: () => void
}) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])
  const valid = isHex(pasted.trim()) && pasted.trim().length === 66
  return (
    <div className="space-y-3 rounded-md border border-line bg-surface-2 p-3.5 text-[13px]">
      <ReviewRows action={phase.action} fee={phase.fee} gas={null} />
      <ol className="list-decimal space-y-1 pl-5 text-ink-2">
        <li>
          Developer Mode must be on: Binance App → Agentic Wallet → Settings. Only you can enable it; it lapses after 7 days without
          use. Your agent can check with <code className="font-mono">baw wallet settings --json</code>.
        </li>
        <li>
          Keep a little BNB in the Agentic Wallet for gas. The address above must match <code className="font-mono">baw wallet address --json</code> on BSC.
        </li>
        <li>Ask your agent to run the preview below and show you the result: contract, 0 BNB value, simulation and any risks.</li>
        <li>
          If it matches, let the agent run <code className="font-mono">baw contract-call execute --requestId …</code>. A status of
          PENDING_CONFIRMATION means approve it in the Binance App.
        </li>
        <li>Paste the resulting txHash here to track confirmation.</li>
      </ol>
      <details className="text-[12px] text-ink-3">
        <summary className="cursor-pointer font-mono uppercase tracking-[0.04em] hover:text-ink">Common errors</summary>
        <ul className="mt-2 space-y-1">
          <li><code className="font-mono">351802</code>: Developer Mode expired. Re-enable it in the Binance App.</li>
          <li><code className="font-mono">351803</code>: the wallet's risk engine blocked the call. Nothing was sent.</li>
          <li><code className="font-mono">351804</code>: wallet balance is above the Developer Mode balance cap.</li>
          <li><code className="font-mono">351805</code>: simulation failed (usually the same revert SkillProof showed above).</li>
        </ul>
      </details>
      <div className="relative">
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded border border-line bg-surface p-2.5 pr-16 font-mono text-[11.5px] leading-relaxed">
          {phase.preview}
        </pre>
        <button
          className="absolute right-2 top-2 rounded border border-line bg-surface-2 px-2 py-0.5 text-[11px]"
          onClick={() => {
            navigator.clipboard?.writeText(phase.preview).then(() => setCopied(true))
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="text-[12px] text-ink-3">
        Target contract <span className="font-mono">{phase.to}</span>. Check that the preview shows this contract and 0 BNB value.
      </p>
      <div className="flex flex-wrap gap-2">
        <Input
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder="0x… transaction hash"
          className="min-w-0 flex-1 font-mono"
          aria-label="Transaction hash"
        />
        <Button disabled={!valid} onClick={() => onTrack(pasted.trim() as Hex)}>
          Track
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

export function formatBnb(wei: bigint) {
  return `${Number(formatEther(wei)).toFixed(6)} BNB`
}
