'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { isAddress } from 'viem'
import { useIdentity } from './identity'
import { shortAddress } from '@/lib/utils'

export function MainnetBadge() {
  return (
    <span className="sp-chip sp-chip--net" title="BNB Smart Chain mainnet, chain id 56">
      <i aria-hidden />
      BSC · 56
    </span>
  )
}

export function IdentityChip() {
  const { address, account, disconnect } = useIdentity()
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
  return (
    <span className="sp-chip" title={account?.agentIdHeld ? 'Agent ID wallet' : 'Checking…'}>
      <i aria-hidden />
      <span>{shortAddress(address, 4)}</span>
      <button onClick={disconnect} aria-label="Disconnect">
        ✕
      </button>
    </span>
  )
}

interface Prompt {
  address: string
  challenge: string
  prompt: string
  expiresAt: number
}

const SIGNATURE_RE = /^(0x)?[0-9a-fA-F]{128}([0-9a-fA-F]{2})?$/

/**
 * Sign in with the Agentic Wallet, in two steps:
 * 1. Enter the wallet address. The app checks the Agent ID and gives you a prompt to copy.
 * 2. Send the prompt to your AI agent. It signs, you paste the signature, and the app starts a session.
 */
export function ConnectPanel() {
  const qc = useQueryClient()
  const [prompt, setPrompt] = useState<Prompt | null>(null)
  const [value, setValue] = useState('')
  const [sig, setSig] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const validSig = SIGNATURE_RE.test(sig)

  async function getPrompt(e: React.FormEvent) {
    e.preventDefault()
    const addr = value.trim()
    if (!isAddress(addr)) return setError('Enter a valid 0x address.')
    setBusy(true)
    setError(null)
    try {
      const r = await fetch('/api/auth/challenge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address: addr }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) return setError(j.error ?? 'Could not check this wallet. Try again.')
      setPrompt({ address: addr, challenge: j.challenge, prompt: j.prompt, expiresAt: j.expiresAt })
    } catch {
      setError('Could not check this wallet. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function signIn() {
    if (!prompt || !validSig) return
    setBusy(true)
    setError(null)
    try {
      const r = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ challenge: prompt.challenge, signature: sig }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        setError(j.error ?? 'Sign-in failed. Try again.')
        if (r.status === 400 && /expired/i.test(j.error ?? '')) setPrompt(null)
        return
      }
      await qc.invalidateQueries({ queryKey: ['session'] })
    } catch {
      setError('Sign-in failed. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function copyPrompt() {
    if (!prompt) return
    try {
      await navigator.clipboard.writeText(prompt.prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Copy failed. Select the text and copy it by hand.')
    }
  }

  return (
    <section className="sp-panel mx-auto max-w-2xl p-6 sm:p-8">
      <p className="sp-label">CONNECT</p>
      <h2 className="sp-display mt-4 text-[clamp(2rem,4vw,3rem)]">Your Agent ID wallet</h2>

      {!prompt ? (
        <>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-2">
            You need two things: the Binance App with an Agentic Wallet and an Agent ID, and an AI agent with the{' '}
            <code className="font-mono text-peer">baw</code> CLI installed.
          </p>
          <p className="mt-3 text-[14px] leading-relaxed text-ink-2">Step 1: paste your wallet address.</p>
          <form className="mt-8 space-y-3" onSubmit={getPrompt}>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0x… your wallet address"
              aria-label="Agentic Wallet address"
              className="box-field h-12 w-full px-4 font-mono text-[14px] focus:border-accent focus:outline-none"
            />
            {error ? <p className="text-[13px] text-bad">{error}</p> : null}
            <button type="submit" disabled={busy || !value.trim()} className="sp-action w-full disabled:opacity-40">
              <span>{busy ? 'CHECKING…' : 'GET LOGIN PROMPT'}</span>
              <span className="sp-action__icon" aria-hidden>
                ↗
              </span>
            </button>
          </form>
        </>
      ) : (
        <>
          <p className="mt-4 text-[14px] leading-relaxed text-ink-2">Step 2: send this prompt to your AI agent.</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-[14px] leading-relaxed text-ink-2">
            <li>Copy the prompt below.</li>
            <li>Send it to your AI agent. Approve the request in the Binance App if it asks.</li>
            <li>Copy the signature the agent sends back and paste it under Step 3.</li>
          </ol>
          <pre className="mt-5 max-h-44 overflow-auto whitespace-pre-wrap break-all border border-line bg-bg p-3 font-mono text-[11.5px] text-ink-2">
            {prompt.prompt}
          </pre>
          <button type="button" onClick={copyPrompt} className="sp-action mt-3 w-full">
            <span>{copied ? 'COPIED ✓' : 'COPY PROMPT'}</span>
            <span className="sp-action__icon" aria-hidden>
              ⧉
            </span>
          </button>

          <div className="mt-6 space-y-3">
            <p className="text-[14px] leading-relaxed text-ink-2">Step 3: paste the signature.</p>
            <textarea
              value={sig}
              onChange={(e) => setSig(e.target.value.trim())}
              placeholder="0x… signature"
              aria-label="Signature"
              className="box-field min-h-16 w-full px-4 py-3 font-mono text-[12px] focus:border-accent focus:outline-none"
            />
            {sig && !validSig ? <p className="text-[12px] text-bad">This does not look like a full signature. Copy the whole value from the agent.</p> : null}
            {error ? <p className="text-[13px] text-bad">{error}</p> : null}
            <div className="flex gap-3">
              <button type="button" onClick={signIn} disabled={!validSig || busy} className="sp-action flex-1 disabled:opacity-40">
                <span>{busy ? 'SIGNING IN…' : 'SIGN IN'}</span>
                <span className="sp-action__icon" aria-hidden>
                  ↗
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPrompt(null)
                  setSig('')
                  setError(null)
                }}
                className="sp-action sp-action--compact"
              >
                <span>BACK</span>
              </button>
            </div>
          </div>
        </>
      )}

      <div className="mt-8 border-t border-line pt-5 text-[13px] leading-relaxed text-ink-3">
        <p>
          Not sure of your address? Ask your AI agent to run <code className="font-mono text-peer">baw wallet address --json</code> and use
          the BSC (56) entry.
        </p>
        <p className="mt-2">We never ask for keys or passwords. The signature only proves this wallet is yours.</p>
      </div>
    </section>
  )
}
