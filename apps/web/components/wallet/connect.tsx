'use client'

import Link from 'next/link'
import { useState } from 'react'
import { isAddress } from 'viem'
import { useAccount, useChainId, useConnect, useSwitchChain } from 'wagmi'
import { BSC_CHAIN_ID } from '@skillproof/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { Notice } from '@/components/ui/card'
import { shortAddress } from '@/lib/utils'
import { useIdentity } from './identity'

export function MainnetBadge() {
  return (
    <span className="sp-chip sp-chip--net" title="BNB Smart Chain mainnet, chain id 56">
      <i aria-hidden />
      BSC MAINNET · 56
    </span>
  )
}

export function IdentityChip() {
  const { mode, address, account, signOut } = useIdentity()
  const chainId = useChainId()
  const { isConnected } = useAccount()
  if (!address) {
    return (
      <Link href="/dashboard" className="sp-action sp-action--compact">
        <span>CONNECT</span>
        <span className="sp-action__icon" aria-hidden>
          ↗
        </span>
      </Link>
    )
  }
  const wrongChain = mode === 'wallet' && isConnected && chainId !== BSC_CHAIN_ID
  const warn = account?.agentIdHeld === false || wrongChain
  return (
    <span
      className={`sp-chip ${warn ? 'sp-chip--warn' : ''}`}
      title={wrongChain ? 'Wrong network' : account?.agentIdHeld === false ? 'No Agent ID on this address' : 'Agent ID holder'}
    >
      <i aria-hidden />
      <span className="hidden opacity-60 lg:inline">{mode === 'agent' ? 'AGENT' : 'WALLET'}</span>
      <span>{shortAddress(address, 4)}</span>
      <button onClick={signOut} aria-label="Disconnect">
        ✕
      </button>
    </span>
  )
}

/** Two ways in. Neither involves QR codes, pairing codes or server-side sessions. */
export function ConnectPanel() {
  const { connectors, connect, isPending, error } = useConnect()
  const { setAgentAddress } = useIdentity()
  const [agent, setAgent] = useState('')
  const [agentErr, setAgentErr] = useState<string | null>(null)
  const unique = connectors.filter((c, i, arr) => arr.findIndex((x) => x.name === c.name) === i)

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="sp-panel sp-rule flex flex-col p-6 sm:p-8">
        <div className="flex justify-between">
          <span className="sp-label">01 · RECOMMENDED</span>
          <span className="sp-label">AGENTIC WALLET</span>
        </div>
        <h3 className="sp-display mt-10 text-[clamp(2.2rem,4vw,3.4rem)]">Through your AI agent</h3>
        <p className="mt-4 max-w-md text-[14.5px] leading-relaxed text-ink-2">
          Agent IDs live on Binance Agentic Wallets. Enter your Agentic Wallet address to load your profile. For every action
          SkillProof prepares calldata and a <code className="font-mono text-[13px] text-peer">baw contract-call</code> command. Your
          own agent runs it, and you confirm in the Binance App.
        </p>
        <form
          className="mt-auto space-y-3 pt-8"
          onSubmit={(e) => {
            e.preventDefault()
            if (!isAddress(agent.trim())) return setAgentErr('Enter a 0x… BNB Smart Chain address')
            setAgentErr(null)
            setAgentAddress(agent.trim())
          }}
        >
          <Input
            placeholder="0x… your Agentic Wallet address"
            value={agent}
            onChange={(e) => setAgent(e.target.value)}
            aria-label="Agentic Wallet address"
            className="font-mono"
          />
          {agentErr ? <p className="text-[12px] text-bad">{agentErr}</p> : null}
          <Button type="submit" className="w-full" icon>
            Use this address
          </Button>
          <p className="sp-label !normal-case !tracking-normal leading-relaxed">
            Not a login. SkillProof never asks for QR codes, pairing codes, keys or sessions, and cannot act for you.
          </p>
        </form>
      </section>

      <section className="sp-panel sp-rule flex flex-col p-6 sm:p-8">
        <div className="flex justify-between">
          <span className="sp-label">02</span>
          <span className="sp-label">EIP-1193 / EIP-6963</span>
        </div>
        <h3 className="sp-display mt-10 text-[clamp(2.2rem,4vw,3.4rem)]">Browser wallet</h3>
        <p className="mt-4 max-w-md text-[14.5px] leading-relaxed text-ink-2">
          For organizations, admins, or any injected EVM wallet on BNB Smart Chain. Gated actions still need the signing address
          to hold an Agent ID.
        </p>
        <div className="mt-auto space-y-2 pt-8">
          {unique.length === 0 ? (
            <Notice>No browser wallet detected in this browser.</Notice>
          ) : (
            unique.map((c) => (
              <Button
                key={c.uid}
                variant="secondary"
                className="w-full justify-between"
                disabled={isPending}
                onClick={() => connect({ connector: c, chainId: BSC_CHAIN_ID })}
              >
                <span>{c.name === 'Injected' ? 'Browser wallet' : c.name}</span>
                <span aria-hidden>→</span>
              </Button>
            ))
          )}
          {error ? <p className="text-[12px] text-bad">{error.message.split('\n')[0]}</p> : null}
        </div>
      </section>
    </div>
  )
}

export function ChainGuard() {
  const { mode } = useIdentity()
  const chainId = useChainId()
  const { isConnected } = useAccount()
  const { switchChain, isPending } = useSwitchChain()
  if (mode !== 'wallet' || !isConnected || chainId === BSC_CHAIN_ID) return null
  return (
    <Notice tone="bad" className="flex flex-wrap items-center justify-between gap-2">
      <span>Your wallet is on chain {chainId}. SkillProof only writes to BNB Smart Chain mainnet (56).</span>
      <Button size="sm" variant="danger" disabled={isPending} onClick={() => switchChain({ chainId: BSC_CHAIN_ID })}>
        Switch to BNB Smart Chain
      </Button>
    </Notice>
  )
}
