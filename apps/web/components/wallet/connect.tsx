'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { isAddress } from 'viem'
import { useIdentity } from './identity'
import { agentLoginPrompt, loginSecretHash } from '@/lib/login'
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

const POLL_MS = 2_000
const ROTATE_MS = 10 * 60_000 // a waiting prompt gets a fresh secret after 10 minutes
const BSC_CHAIN_HEX = '0x38'

interface InjectedWallet {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
}

function injectedWallet(): InjectedWallet | null {
  return (globalThis as unknown as { ethereum?: InjectedWallet }).ethereum ?? null
}

function walletErrorText(e: unknown): string {
  const err = e as { code?: number; message?: string }
  if (err.code === 4001) return 'You cancelled the request in your wallet.'
  return err.message || 'Sign-in failed. Try again.'
}

function randomSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

interface PendingPrompt {
  secret: string
  promptText: string
  createdAt: number
}

/** A new secret and the prompt that carries its hash. The secret stays in this browser. */
async function newPrompt(): Promise<PendingPrompt> {
  const secret = randomSecret()
  const secretHash = await loginSecretHash(secret)
  return { secret, promptText: agentLoginPrompt(window.location.origin, secretHash), createdAt: Date.now() }
}

/**
 * Sign in with a browser wallet, or let your AI agent sign in with its Agentic Wallet.
 * The agent prompt is shown at once. When the agent finishes, this page opens the session by itself.
 */
export function ConnectPanel() {
  const qc = useQueryClient()
  const [pending, setPending] = useState<PendingPrompt | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // One prompt per page visit (and a fresh one after expiry or 10 idle minutes).
  useEffect(() => {
    let cancelled = false
    void newPrompt().then((p) => {
      if (!cancelled) setPending(p)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Ask the server whether the agent has signed this prompt. Stop when the session opens.
  useEffect(() => {
    if (!pending) return
    let stopped = false
    const timer = setInterval(async () => {
      const r = await fetch('/api/auth/status', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ secret: pending.secret }),
      })
        .then((x) => x.json())
        .catch(() => null)
      if (stopped || !r) return
      if (r.status === 'signed-in') {
        clearInterval(timer)
        await qc.invalidateQueries({ queryKey: ['session'] })
      } else if (r.status === 'expired') {
        clearInterval(timer)
        setError('That login expired. A new prompt is ready. Copy it again.')
        void newPrompt().then((p) => !stopped && setPending(p))
      } else if (r.status === 'waiting' && Date.now() - pending.createdAt > ROTATE_MS) {
        clearInterval(timer)
        void newPrompt().then((p) => !stopped && setPending(p))
      } else if (r.error) {
        setError(r.error)
      }
    }, POLL_MS)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [pending, qc])

  /**
   * Connect a browser wallet (extension or the Binance App's dApp browser). The wallet signs the login
   * message directly, and the server check opens the session.
   */
  async function connectBrowserWallet() {
    const eth = injectedWallet()
    if (!eth) {
      return setError('No wallet detected. Open this page in the Binance App or install a wallet extension, then reload.')
    }
    setBusy(true)
    setError(null)
    try {
      const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as string[] | undefined
      const addr = accounts?.[0]
      if (!addr || !isAddress(addr)) return setError('The wallet did not share an address.')
      const chain = (await eth.request({ method: 'eth_chainId' })) as string
      if (parseInt(chain, 16) !== 56) {
        try {
          await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BSC_CHAIN_HEX }] })
        } catch {
          return setError('Switch your wallet to BNB Smart Chain (56), then try again.')
        }
      }
      const c = await fetch('/api/auth/challenge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address: addr }),
      })
      const cj = await c.json().catch(() => ({}))
      if (!c.ok) return setError(cj.error ?? 'Could not check this wallet. Try again.')
      const signature = (await eth.request({ method: 'eth_signTypedData_v4', params: [addr, JSON.stringify(cj.typedData)] })) as string
      const v = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ challenge: cj.challenge, signature }),
      })
      const vj = await v.json().catch(() => ({}))
      if (!v.ok) return setError(vj.error ?? 'Sign-in failed. Try again.')
      await qc.invalidateQueries({ queryKey: ['session'] })
    } catch (e) {
      setError(walletErrorText(e))
    } finally {
      setBusy(false)
    }
  }

  async function copyPrompt() {
    if (!pending) return
    try {
      await navigator.clipboard.writeText(pending.promptText)
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
      <p className="mt-4 text-[15px] leading-relaxed text-ink-2">Choose one way to sign in. Both need a wallet with an Agent ID.</p>

      {error ? <p className="mt-4 text-[13px] text-bad">{error}</p> : null}

      <div className="mt-6 space-y-2">
        <button type="button" onClick={connectBrowserWallet} disabled={busy} className="sp-action w-full disabled:opacity-40">
          <span>{busy ? 'CONNECTING…' : 'CONNECT BROWSER WALLET'}</span>
          <span className="sp-action__icon" aria-hidden>
            ↗
          </span>
        </button>
        <p className="text-[12px] leading-relaxed text-ink-3">
          Use a wallet extension or the Binance App&apos;s built-in dApp browser. Your wallet asks you to sign a login message. Nothing is sent on-chain.
        </p>
      </div>

      <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.05em] text-ink-3">Or use your AI agent</p>
      <p className="mt-3 text-[14px] leading-relaxed text-ink-2">
        Copy this prompt and paste it to your AI agent (Binance AI Pro, or any agent with the <code className="font-mono text-peer">baw</code> CLI
        and an Agentic Wallet). It finds your address and signs. This page signs you in when it is done.
      </p>
      <pre
        aria-label="Agent login prompt"
        className="mt-4 max-h-56 overflow-auto whitespace-pre-wrap break-words border border-line bg-bg p-3 font-mono text-[11.5px] text-ink-2"
      >
        {pending ? pending.promptText : 'Preparing your prompt…'}
      </pre>
      <button type="button" onClick={copyPrompt} disabled={!pending} className="sp-action mt-3 w-full disabled:opacity-40">
        <span>{copied ? 'COPIED ✓' : 'COPY PROMPT'}</span>
        <span className="sp-action__icon" aria-hidden>
          ⧉
        </span>
      </button>
      {pending ? (
        <p className="mt-3 font-mono text-[12px] uppercase tracking-[0.04em] text-peer" role="status">
          Waiting for your agent…
        </p>
      ) : null}

      <div className="mt-8 border-t border-line pt-5 text-[13px] leading-relaxed text-ink-3">
        <p>
          Not sure of your address? Ask your AI agent to run <code className="font-mono text-peer">baw wallet address --json</code> and use the
          BSC (56) entry.
        </p>
        <p className="mt-2">We never ask for keys or passwords. The signature only proves this wallet is yours.</p>
      </div>
    </section>
  )
}
