/**
 * Full user-journey test through the real UI against the LOCAL chain-56 mirror (scripts/demo-local.sh
 * with SKIP_E2E=1). Personas:
 *  - visitor (no wallet)
 *  - W  browser-wallet builder   (anvil #3, given a local Agent ID "qathree")
 *  - X  browser-wallet attester  (anvil #4, local Agent ID "qafour")
 *  - ADMIN browser wallet        (anvil #0 = deployer/admin)
 *  - ORG issuer browser wallet   (anvil #1)
 *  - A  Agentic Wallet user via "agent" (real mainnet holder, impersonated locally)
 *  - N  non-holder in agent mode (anvil #2)
 * Browser wallets are an injected EIP-1193/EIP-6963 mock that forwards to anvil (whose dev accounts can
 * sign). Agent mode copies the exact `baw contract-call preview` calldata the UI shows and sends it from the
 * impersonated holder, then pastes the tx hash back, as a real agent + user would.
 *
 * Usage: node e2e-local/user-journey.mjs   (env: APP, RPC, SHOTS)
 */
import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { createTestClient, createWalletClient, encodeAbiParameters, http, keccak256, pad, parseEther, toHex } from 'viem'

const APP = process.env.APP ?? 'http://localhost:3300'
const RPC = process.env.RPC ?? 'http://127.0.0.1:8546'
const SHOTS = process.env.SHOTS ?? '/tmp'
const chain = { id: 56, name: 'bsc-local', nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } }
const test = createTestClient({ chain, mode: 'anvil', transport: http(RPC) })
const wallet = createWalletClient({ chain, transport: http(RPC) })

const mirror = JSON.parse(readFileSync(new URL('../.data/agent-id-mirror.json', import.meta.url), 'utf8'))
const AGENT_ID = mirror.agentId
const [A, B] = mirror.holders
const DEV = {
  admin: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  org: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  nonHolder: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
  w: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
  x: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
}

// ---------------------------------------------------------------- results
const results = []
let current = ''
async function step(name, fn, page) {
  current = name
  const t0 = Date.now()
  try {
    const note = await fn()
    results.push({ name, ok: true, note: note ?? '', ms: Date.now() - t0 })
    console.log(`✓ ${name}${note ? ` — ${note}` : ''}`)
  } catch (e) {
    const msg = String(e?.message ?? e).split('\n')[0].slice(0, 300)
    results.push({ name, ok: false, note: msg, ms: Date.now() - t0 })
    console.log(`✗ ${name} — ${msg}`)
    if (page) await page.screenshot({ path: `${SHOTS}/fail-${results.length}.png`, fullPage: true }).catch(() => {})
  }
}
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg)
}

// ---------------------------------------------------------------- chain setup
async function giveAgentId(address, label) {
  const tokenId = BigInt(keccak256(toHex(label)))
  const balSlot = keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [address, 3n]))
  const ownSlot = keccak256(encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }], [tokenId, 2n]))
  await test.setStorageAt({ address: AGENT_ID, index: balSlot, value: pad(toHex(1n)) })
  await test.setStorageAt({ address: AGENT_ID, index: ownSlot, value: pad(address) })
}

// ---------------------------------------------------------------- mock wallet
function mockWallet({ rpc, account, chainId }) {
  let id = 0
  const listeners = {}
  let chain = chainId
  // Behave like a real wallet: expose accounts only after the user approved this site once.
  const permKey = 'qa-wallet-permission:' + account
  const permitted = () => {
    try {
      return localStorage.getItem(permKey) === '1'
    } catch {
      return false
    }
  }
  const emit = (e, v) => (listeners[e] || []).forEach((f) => f(v))
  const send = async (method, params = []) => {
    const r = await fetch(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) })
    const j = await r.json()
    if (j.error) {
      const err = new Error(j.error.message)
      err.code = j.error.code
      err.data = j.error.data
      throw err
    }
    return j.result
  }
  const provider = {
    isMetaMask: false,
    request: async ({ method, params }) => {
      switch (method) {
        case 'eth_requestAccounts':
          try {
            localStorage.setItem(permKey, '1')
          } catch {}
          return [account]
        case 'eth_accounts':
          return permitted() ? [account] : []
        case 'eth_chainId':
          return chain
        case 'net_version':
          return String(parseInt(chain, 16))
        case 'wallet_switchEthereumChain':
          window.__qaSwitchRequests = (window.__qaSwitchRequests || 0) + 1
          chain = params[0].chainId
          emit('chainChanged', chain)
          return null
        case 'wallet_requestPermissions':
        case 'wallet_getPermissions':
          return [{ parentCapability: 'eth_accounts' }]
        case 'wallet_revokePermissions':
          return null
        default:
          if (chain !== '0x38' && (method === 'eth_sendTransaction' || method === 'eth_signTypedData_v4')) {
            const e = new Error('Wrong network in wallet')
            e.code = 4901
            throw e
          }
          return send(method, params)
      }
    },
    on: (e, f) => {
      ;(listeners[e] ||= []).push(f)
    },
    removeListener: (e, f) => {
      listeners[e] = (listeners[e] || []).filter((x) => x !== f)
    },
  }
  window.ethereum = provider
  const info = { uuid: 'qa-wallet-' + account, name: 'QA Wallet', icon: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E', rdns: 'test.qa.wallet' }
  const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info, provider }) }))
  window.addEventListener('eip6963:requestProvider', announce)
  announce()
}

const errorsByPersona = {}
async function persona(browser, name, { account, chainId = '0x38', mobile = false } = {}) {
  const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1400, height: 1000 } })
  if (account) await ctx.addInitScript(mockWallet, { rpc: RPC, account, chainId })
  const page = await ctx.newPage()
  errorsByPersona[name] = []
  page.on('pageerror', (e) => errorsByPersona[name].push(`${current}: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|Failed to load resource|ERR_CONNECTION_REFUSED|bscscan/i.test(m.text())) errorsByPersona[name].push(`${current}: console: ${m.text().slice(0, 200)}`)
  })
  return page
}

// ---------------------------------------------------------------- UI helpers
const bad = (scope) => scope.locator('.bg-bad-bg').last()

/** Wallet path: click action → wait for review → confirm → wait for on-chain confirmation. */
async function walletAction(page, buttonName, scope = page) {
  const before = await page.locator('.bg-bad-bg').count()
  await scope.getByRole('button', { name: buttonName }).first().click()
  const confirm = scope.getByRole('button', { name: 'Confirm in wallet' })
  const err = page.locator('.bg-bad-bg').nth(before)
  await Promise.race([confirm.waitFor({ timeout: 20_000 }), err.waitFor({ timeout: 20_000 })])
  if (await err.isVisible().catch(() => false)) throw new Error(`blocked: ${(await err.innerText()).slice(0, 200)}`)
  await confirm.click()
  // Inline notice, or the app toast when the triggering control is removed after success (e.g. Revoke).
  const ok = page.getByText(/confirmed in block/i).first()
  await Promise.race([ok.waitFor({ timeout: 30_000 }), err.waitFor({ timeout: 30_000 })])
  if (!(await ok.isVisible().catch(() => false))) throw new Error(`tx failed: ${(await err.innerText()).slice(0, 200)}`)
}

/** Expect an action to be refused before any transaction (simulation / validation error). */
async function expectRefused(page, buttonName, re, scope = page) {
  await scope.getByRole('button', { name: buttonName }).first().click()
  const err = scope.locator('.bg-bad-bg', { hasText: re }).last()
  try {
    await err.waitFor({ timeout: 20_000 })
  } catch {
    const all = await scope.locator('.bg-bad-bg').allInnerTexts()
    throw new Error(`expected ${re} but saw: ${all.join(' | ').slice(0, 200) || 'no error'}`)
  }
  return (await err.innerText()).slice(0, 120)
}

/** Agent path: click → copy the baw preview calldata → "agent" sends it from the holder → paste tx hash → track. */
async function agentAction(page, buttonName, holder, scope = page) {
  await scope.getByRole('button', { name: buttonName }).first().click()
  const pre = scope.locator('pre', { hasText: 'baw contract-call preview' }).first()
  const err = bad(scope)
  await Promise.race([pre.waitFor({ timeout: 20_000 }), err.waitFor({ timeout: 20_000 })])
  if (await err.isVisible().catch(() => false)) throw new Error(`blocked: ${(await err.innerText()).slice(0, 200)}`)
  const cmd = await pre.innerText()
  const to = cmd.match(/--to (0x[0-9a-fA-F]{40})/)?.[1]
  const data = cmd.match(/--inputData (0x[0-9a-fA-F]+)/)?.[1]
  const from = cmd.match(/--from (0x[0-9a-fA-F]{40})/)?.[1]
  expect(to && data && from, 'could not parse baw command')
  expect(from.toLowerCase() === holder.toLowerCase(), 'baw --from is not the acting address')
  expect(/--binanceChainId 56/.test(cmd) && /--value 0/.test(cmd), 'baw command missing chain 56 / value 0')
  const hash = await wallet.sendTransaction({ account: holder, to, data, chain })
  await scope.getByLabel('Transaction hash').fill(hash)
  await scope.getByRole('button', { name: 'Track' }).click()
  await scope.getByText(/Confirmed in block/).first().waitFor({ timeout: 30_000 })
  return hash
}

async function connectBrowserWallet(page) {
  await page.goto(`${APP}/dashboard`)
  await page.getByRole('button', { name: /qa wallet/i }).first().click()
  await page.getByRole('heading', { level: 1, name: 'Dashboard' }).waitFor({ timeout: 15_000 })
  await page.getByText(/READING CHAIN/).waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {})
}

async function useAgentAddress(page, address) {
  await page.goto(`${APP}/dashboard`)
  await page.getByLabel('Agentic Wallet address').fill(address)
  await page.getByRole('button', { name: /Use this address/ }).click()
  await page.getByRole('heading', { level: 1, name: 'Dashboard' }).waitFor({ timeout: 15_000 })
}

const settle = (page, ms = 800) => page.waitForTimeout(ms)

// ================================================================= main
const browser = await chromium.launch()
for (const who of [A.address, B.address, DEV.nonHolder]) {
  await test.impersonateAccount({ address: who })
  await test.setBalance({ address: who, value: parseEther('1') })
}
await giveAgentId(DEV.w, 'qathree')
await giveAgentId(DEV.x, 'qafour')

// ---------------------------------------------------------------- visitor
const v = await persona(browser, 'visitor')
await step('Visitor: home renders with live counters and nav', async () => {
  await v.goto(APP)
  await v.getByRole('heading', { level: 1, name: /Show the work/ }).waitFor()
  expect(await v.getByText('PROFILES', { exact: true }).isVisible(), 'stats missing')
  await v.getByRole('link', { name: 'CREATE YOUR PROFILE' }).first().click()
  await v.waitForURL(/\/dashboard$/)
}, v)
await step('Visitor: every top-nav page opens', async () => {
  const pages = [['BUILDERS', /Builders/], ['ORGS', /issue credentials/], ['ACTIVITY', /that happened/], ['REPUTATION', /can audit/], ['VERIFY', /any record/], ['DASHBOARD', /the record/]]
  for (const [nav, h1] of pages) {
    await v.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: nav, exact: true }).click()
    await v.getByRole('heading', { level: 1, name: h1 }).waitFor({ timeout: 10_000 })
  }
}, v)
await step('Visitor: empty states before any data', async () => {
  await v.goto(`${APP}/builders`)
  await v.getByText(/No profiles yet/).waitFor()
  await v.goto(`${APP}/activity`)
  await v.getByText(/No on-chain activity yet|Demo Hackathon/).first().waitFor()
}, v)
await step('Visitor: verify handles junk, unknown tx and unknown records', async () => {
  await v.goto(`${APP}/verify?q=hello`)
  await v.getByText(/Could not understand/).waitFor()
  await v.goto(`${APP}/verify?q=0x${'1'.repeat(64)}`)
  await v.getByText(/Transaction not found/).waitFor()
  await v.goto(`${APP}/verify?q=credential:99`)
  await v.getByText(/does not exist/).waitFor()
  await v.goto(`${APP}/p/nobody.ai`)
  await v.getByText('Profile not found').waitFor()
}, v)

// ---------------------------------------------------------------- non-holder (agent mode)
const n = await persona(browser, 'nonHolder')
await step('Non-holder: dashboard shows a clear Agent ID error', async () => {
  await useAgentAddress(n, DEV.nonHolder)
  await n.getByText(/No Agent ID found for this address/).waitFor({ timeout: 15_000 })
}, n)
await step('Non-holder: profile creation refused before any transaction', async () => {
  await n.getByLabel('Display name').fill('Not eligible')
  return expectRefused(n, 'Create profile on-chain', /does not hold an Agent ID/)
}, n)

// ---------------------------------------------------------------- W: browser-wallet builder
const w = await persona(browser, 'W', { account: DEV.w })
await step('W: connect browser wallet (EIP-6963) and see holder status', async () => {
  await connectBrowserWallet(w)
  await w.getByText('AGENT ID HOLDER').waitFor({ timeout: 15_000 })
}, w)
await step('W: metadata validation blocks an e-mail in the bio', async () => {
  await w.getByLabel('Display name').fill('QA Builder W')
  await w.getByLabel(/Your Agent ID name/).fill('qathree.ai')
  await w.getByLabel('Bio').fill('Contact me at qa@example.com')
  return expectRefused(w, 'Create profile on-chain', /e-mail/i)
}, w)
await step('W: claiming someone else’s .ai name is refused', async () => {
  await w.getByLabel('Bio').fill('Full-stack builder testing attested.')
  await w.getByLabel(/Your Agent ID name/).fill(`${A.label}.ai`)
  return expectRefused(w, 'Create profile on-chain', /does not own that \.ai name/)
}, w)
await step('W: create profile with own .ai name (wallet signs, receipt confirmed)', async () => {
  await w.getByLabel(/Your Agent ID name/).fill('qathree.ai')
  await w.getByLabel('Skills').fill('Solidity, Next.js, UI Design')
  await w.getByLabel('GitHub').fill('https://github.com/qa-three')
  await walletAction(w, 'Create profile on-chain')
  await settle(w, 1500)
  await w.reload()
  await w.getByText('Your profile').waitFor({ timeout: 15_000 })
}, w)
await step('W: edit profile publishes version 2', async () => {
  await w.getByRole('button', { name: 'Edit profile' }).click()
  await w.getByLabel('Bio').fill('Full-stack builder. Updated bio v2.')
  await walletAction(w, 'Publish profile update')
  await settle(w, 1500)
  await w.reload()
  await w.getByText(/version 2/).waitFor({ timeout: 15_000 })
}, w)
await step('W: invalid evidence reference blocks the project form', async () => {
  await w.goto(`${APP}/dashboard/projects`)
  await w.getByRole('button', { name: '+ Add project' }).click()
  await w.getByLabel('Project title').fill('QA Project One')
  await w.getByLabel('Evidence reference').first().fill('javascript:alert(1)')
  await w.getByText(/Evidence must be an https URL/).waitFor()
  expect(await w.getByRole('button', { name: 'Add project on-chain' }).isDisabled(), 'button should be disabled')
}, w)
await step('W: add project with evidence', async () => {
  await w.getByLabel('Evidence reference').first().fill('https://github.com/qa-three/one/pull/1')
  await w.getByLabel('Your role').fill('Lead dev')
  await w.getByLabel('Summary').fill('First QA project.')
  await w.getByLabel('Skills demonstrated').fill('solidity, next.js')
  await walletAction(w, 'Add project on-chain')
  await settle(w, 1500)
  await w.reload()
  await w.getByRole('heading', { name: 'QA Project One' }).waitFor({ timeout: 15_000 })
}, w)
await step('W: revise project keeps the original record in history', async () => {
  await w.getByRole('button', { name: 'Revise' }).first().click()
  await w.getByLabel('Project title').last().fill('QA Project One (v2)')
  const form = w.locator('.sp-panel', { hasText: 'Revise project #' })
  await walletAction(w, /Publish revision of project/, form)
  await settle(w, 1500)
  await w.reload()
  await w.getByRole('heading', { name: 'QA Project One (v2)' }).waitFor({ timeout: 15_000 })
  await w.getByText('Superseded').first().waitFor()
}, w)
await step('W: add then revoke a second project', async () => {
  await w.getByRole('button', { name: '+ Add project' }).click()
  await w.getByLabel('Project title').first().fill('Throwaway project')
  await walletAction(w, 'Add project on-chain')
  await settle(w, 1500)
  await w.reload()
  const card = w.locator('article', { hasText: 'Throwaway project' })
  await card.waitFor({ timeout: 15_000 })
  await walletAction(w, 'Revoke', card)
  await settle(w, 1500)
  await w.reload()
  await w.locator('article', { hasText: 'Throwaway project' }).getByText('Revoked', { exact: true }).first().waitFor({ timeout: 15_000 })
}, w)
let requestLink = ''
await step('W: generate an attestation request link', async () => {
  await w.goto(`${APP}/dashboard/endorsements`)
  const opt = w.locator('#rq-project option', { hasText: 'QA Project One (v2)' })
  await opt.waitFor({ state: 'attached', timeout: 15_000 })
  await w.locator('#rq-project').selectOption(await opt.getAttribute('value'))
  await w.locator('#rq-skill').fill('Solidity')
  requestLink = await w.getByLabel('Request link').inputValue()
  expect(/profile=\d+&project=\d+&skill=solidity/.test(requestLink), `bad link ${requestLink}`)
  return requestLink.replace(APP, '')
}, w)
await step('W: cannot attest to own profile', async () => {
  await w.goto(requestLink)
  await w.getByText(/cannot attest to your own profile/).waitFor({ timeout: 15_000 })
  expect(await w.getByRole('button', { name: 'Sign attestation on-chain' }).isDisabled(), 'self-attest button should be disabled')
}, w)

// ---------------------------------------------------------------- X: browser-wallet attester
const x = await persona(browser, 'X', { account: DEV.x })
let attestationTx = ''
await step('X: opens request link and signs a peer attestation', async () => {
  await connectBrowserWallet(x)
  await x.goto(requestLink)
  await x.getByText(/Attesting for/).waitFor({ timeout: 15_000 })
  await x.getByLabel('Your relationship to this work').selectOption('reviewer')
  await x.getByLabel(/What you witnessed/).fill('Reviewed the contracts line by line.')
  await walletAction(x, 'Sign attestation on-chain')
  attestationTx = (await x.getByRole('link', { name: /View on BscScan|Local fork tx/ }).first().getAttribute('href')) ?? ''
}, x)
await step('X: duplicate attestation is prevented', async () => {
  await x.goto(requestLink)
  await x.getByText(/already have active attestation/).waitFor({ timeout: 15_000 })
}, x)
await step('X: second skill on same project is allowed', async () => {
  await x.goto(requestLink.replace('skill=solidity', 'skill=next.js'))
  await x.getByText(/Attesting for/).waitFor({ timeout: 15_000 })
  await walletAction(x, 'Sign attestation on-chain')
}, x)

// ---------------------------------------------------------------- A: Agentic Wallet user via agent
const a = await persona(browser, 'A')
await step('A (agent mode): create profile via baw calldata + pasted tx hash', async () => {
  await useAgentAddress(a, A.address)
  await a.getByText('AGENT ID HOLDER').waitFor({ timeout: 15_000 })
  await a.getByLabel('Display name').fill('Agent Builder A')
  await a.getByLabel(/Your Agent ID name/).fill(`${A.label}.ai`)
  await a.getByLabel('Skills').fill('rust, security-review, solidity')
  await agentAction(a, 'Create profile on-chain', A.address)
}, a)
await step('A (agent mode): pasting a tx that does not match is rejected', async () => {
  await a.goto(`${APP}/dashboard/projects`)
  await a.getByRole('button', { name: '+ Add project' }).click()
  await a.getByLabel('Project title').fill('Agent project')
  await a.getByRole('button', { name: 'Add project on-chain' }).click()
  await a.locator('pre', { hasText: 'baw contract-call preview' }).waitFor({ timeout: 20_000 })
  const wrong = await wallet.sendTransaction({ account: A.address, to: DEV.admin, value: 1n, chain })
  await a.getByLabel('Transaction hash').fill(wrong)
  await a.getByRole('button', { name: 'Track' }).click()
  await a.getByText(/does not match the prepared call/).waitFor({ timeout: 15_000 })
}, a)
await step('A (agent mode): attest to W’s project', async () => {
  await a.goto(requestLink)
  await a.getByText(/Attesting for/).waitFor({ timeout: 15_000 })
  await agentAction(a, 'Sign attestation on-chain', A.address)
}, a)

// ---------------------------------------------------------------- W responds (EIP-712)
await step('W: settings opt-in to reputation (EIP-712 signature saved)', async () => {
  await w.goto(`${APP}/dashboard/settings`)
  await w.getByText('Show my reputation').click()
  await w.getByRole('button', { name: 'Sign & save preferences' }).click()
  await w.getByText('SAVED ✓').waitFor({ timeout: 20_000 })
}, w)
await step('W: accept one attestation and decline another', async () => {
  await w.goto(`${APP}/dashboard/endorsements`)
  const received = w.locator('.sp-panel', { hasText: 'Received' }).first()
  const rowX = received.locator('li', { hasText: 'next.js' }).first()
  await rowX.waitFor({ timeout: 15_000 })
  await rowX.getByRole('button', { name: 'Accept' }).click()
  await w.getByText(/Accept: signed preferences saved/).waitFor({ timeout: 20_000 })
  await rowX.getByText('Acknowledged by builder').waitFor({ timeout: 15_000 })
  await settle(w)
  await w.reload()
  const rowA = w.locator('li', { hasText: `${A.label}.ai` }).first()
  await rowA.waitFor({ timeout: 15_000 })
  await rowA.getByRole('button', { name: 'Decline' }).click()
  await w.getByText(/Decline: signed preferences saved/).waitFor({ timeout: 20_000 })
  await rowA.getByText('Declined by builder').waitFor({ timeout: 15_000 })
}, w)

// ---------------------------------------------------------------- admin + issuer
const admin = await persona(browser, 'admin', { account: DEV.admin })
await step('Admin: approve an organization issuer from the dashboard', async () => {
  await connectBrowserWallet(admin)
  await admin.goto(`${APP}/dashboard/credentials`)
  await admin.getByText(/Issuer allowlist/).waitFor({ timeout: 15_000 })
  await admin.getByLabel('Issuer wallet').fill(DEV.org)
  await admin.getByLabel('Organization name').fill('QA Org')
  await walletAction(admin, 'Approve issuer')
}, admin)
const org = await persona(browser, 'org', { account: DEV.org })
await step('Org: past expiry is blocked in the issue form', async () => {
  await connectBrowserWallet(org)
  await org.goto(`${APP}/dashboard/credentials`)
  await org.getByText(/Issue a credential as QA Org/).waitFor({ timeout: 15_000 })
  await org.getByLabel('Subject profile').fill('qathree.ai')
  await org.getByText(/Issuing to/).waitFor({ timeout: 15_000 })
  await org.getByLabel('Credential type').fill('Hackathon Winner')
  await org.getByLabel('Title').fill('Winner, QA Hackathon')
  await org.getByLabel('Expires (optional)').fill('2020-01-01')
  await org.getByText('Must be in the future').waitFor()
}, org)
await step('Org: issue a credential, then issue and revoke a second one', async () => {
  await org.getByLabel('Expires (optional)').fill('')
  await walletAction(org, 'Issue credential on-chain')
  await settle(org)
  await org.reload()
  await org.getByLabel('Subject profile').fill('qathree.ai')
  await org.getByText(/Issuing to/).waitFor({ timeout: 15_000 })
  await org.getByLabel('Credential type').fill('temp-badge')
  await org.getByLabel('Title').fill('Temporary badge')
  await walletAction(org, 'Issue credential on-chain')
  await settle(org, 1500)
  await org.reload()
  const card = org.locator('article', { hasText: 'Temporary badge' }).last()
  await card.waitFor({ timeout: 15_000 })
  await walletAction(org, 'Revoke', card)
}, org)

// ---------------------------------------------------------------- wrong network
const wrong = await persona(browser, 'wrongChain', { account: DEV.w, chainId: '0x61' })
await step('Wrong network: wallet on BSC testnet is moved to chain 56 before any write', async () => {
  await wrong.goto(`${APP}/dashboard`)
  await wrong.getByRole('button', { name: /qa wallet/i }).first().click()
  await wrong.getByRole('heading', { level: 1, name: 'Dashboard' }).waitFor({ timeout: 15_000 })
  const guard = wrong.getByText(/attested only writes to BNB Smart Chain mainnet/)
  if (await guard.isVisible().catch(() => false)) {
    await wrong.getByRole('button', { name: 'Switch to BNB Smart Chain' }).click()
    await guard.waitFor({ state: 'detached', timeout: 15_000 })
  }
  const switches = await wrong.evaluate(() => window.__qaSwitchRequests || 0)
  const chainId = await wrong.evaluate(() => window.ethereum.request({ method: 'eth_chainId' }))
  expect(switches > 0 && chainId === '0x38', `switch requests=${switches} chain=${chainId}`)
  return `switch requested ${switches}×, wallet now on ${chainId}`
}, wrong)

// ---------------------------------------------------------------- public views after activity
await step('Public profile: trust sections, accepted tag, declined hidden', async () => {
  await v.goto(`${APP}/p/qathree.ai`)
  await v.getByRole('heading', { level: 1, name: 'QA Builder W' }).waitFor({ timeout: 15_000 })
  await v.getByText('Acknowledged by builder').first().waitFor()
  await v.getByText(/declined by the builder/).waitFor()
  expect((await v.locator('li', { hasText: `${A.label}.ai` }).count()) === 0, 'declined attestation still listed')
  await v.getByRole('heading', { name: 'Winner, QA Hackathon' }).waitFor()
  await v.getByRole('heading', { name: 'Temporary badge' }).waitFor()
}, v)
await step('Public profile: "View transaction" resolves to a tx', async () => {
  const link = v.getByRole('link', { name: /Creation tx/ })
  await link.waitFor()
  await v.waitForFunction(() => [...document.querySelectorAll('a')].some((x) => /\/tx\/0x[0-9a-f]{64}/.test(x.href)), null, { timeout: 15_000 })
}, v)
await step('Builders: both builders listed and skill filter works', async () => {
  await v.goto(`${APP}/builders`)
  await v.getByText('QA Builder W').waitFor({ timeout: 15_000 })
  await v.getByText('Agent Builder A').waitFor()
  await v.goto(`${APP}/builders?skill=rust`)
  await v.getByText('Agent Builder A').waitFor()
  expect((await v.getByText('QA Builder W').count()) === 0, 'skill filter did not exclude W')
}, v)
await step('Reputation: W listed (opted in), breakdown excludes declined', async () => {
  await v.goto(`${APP}/reputation`)
  await v.getByText('QA Builder W').waitFor({ timeout: 15_000 })
  expect((await v.getByText('Agent Builder A').count()) === 0, 'non-opted-in builder listed')
  await v.getByRole('link', { name: /Breakdown/ }).first().click()
  await v.getByText(/declined by the builder/).waitFor({ timeout: 15_000 })
  await v.getByText('0x15d3…6A65').first().waitFor()
}, v)
await step('Activity: filters by type, action and query', async () => {
  await v.goto(`${APP}/activity`)
  await v.getByText(/attested “solidity”/).first().waitFor({ timeout: 15_000 })
  await v.goto(`${APP}/activity?type=credential&action=revoked`)
  await v.getByText(/Temporary badge.*was revoked/).waitFor()
  expect((await v.getByText(/attested/).count()) === 0, 'type filter leaked attestations')
  // X never created a profile, so attested shows the address, not a name (no name→wallet lookups).
  await v.goto(`${APP}/activity?q=${DEV.x}`)
  await v.getByText(/0x15d3…6A65 attested/).first().waitFor()
}, v)
await step('Organizations: QA Org listed with counts and detail page', async () => {
  await v.goto(`${APP}/organizations`)
  await v.getByText('QA Org').first().click()
  await v.getByRole('heading', { level: 1, name: 'QA Org' }).waitFor({ timeout: 15_000 })
  await v.getByText('Winner, QA Hackathon').first().waitFor()
}, v)
await step('Verify: attestation shows builder response, credential status, tx decode', async () => {
  await v.goto(`${APP}/verify?q=attestation:2`)
  await v.getByText(/accepted \(owner-signed, off-chain\)/).waitFor({ timeout: 15_000 })
  await v.goto(`${APP}/verify?q=credential:1`)
  await v.getByText(/Currently valid: issued by an approved organization/).waitFor()
  await v.goto(`${APP}/verify?q=credential:2`)
  await v.getByText(/Not currently valid/).waitFor()
  const hash = attestationTx.match(/0x[0-9a-fA-F]{64}/)?.[0]
  if (hash) {
    await v.goto(`${APP}/verify?q=${hash}`)
    await v.getByText('AttestationIssued').waitFor()
  }
  await v.goto(`${APP}/verify?q=${DEV.w}`)
  await v.getByText(/Holds an Agent ID/).waitFor()
}, v)
await step('W: hide from Explore and hide social links take effect', async () => {
  await w.goto(`${APP}/dashboard/settings`)
  await w.getByText('Hide me from Explore').click()
  await w.getByText('Hide social links').click()
  await w.getByRole('button', { name: 'Sign & save preferences' }).click()
  await w.getByText('SAVED ✓').waitFor({ timeout: 20_000 })
  await settle(w, 500)
  await v.goto(`${APP}/builders`)
  await v.getByText('Agent Builder A').waitFor({ timeout: 15_000 })
  expect((await v.getByText('QA Builder W').count()) === 0, 'hidden builder still listed')
  await v.goto(`${APP}/p/qathree.ai`)
  await v.getByRole('heading', { level: 1, name: 'QA Builder W' }).waitFor()
  expect((await v.getByRole('link', { name: /^github ↗$/i }).count()) === 0, 'social link still shown')
}, v)

// ---------------------------------------------------------------- mobile pass
const m = await persona(browser, 'mobile', { mobile: true })
await step('Mobile: key pages have no horizontal overflow', async () => {
  const bad = []
  for (const u of ['/', '/builders', '/p/qathree.ai', '/activity', '/reputation', '/organizations', '/verify?q=credential:1', '/dashboard']) {
    await m.goto(APP + u)
    await settle(m, 600)
    const o = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    if (o > 1) bad.push(`${u} (+${o}px)`)
  }
  expect(bad.length === 0, `overflow on ${bad.join(', ')}`)
}, m)

// ---------------------------------------------------------------- report
await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} user-journey steps passed`)
for (const [p, errs] of Object.entries(errorsByPersona)) if (errs.length) console.log(`console/page errors for ${p}:\n  ${[...new Set(errs)].slice(0, 8).join('\n  ')}`)
process.exit(failed.length ? 1 : 0)
