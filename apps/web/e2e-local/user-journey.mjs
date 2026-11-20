/**
 * User journey through the real UI on the LOCAL chain-56 mirror (scripts/demo-local.sh with SKIP_E2E=1).
 * Only Agent ID wallets can connect. Every write follows the app's real flow:
 *   connect address → prepare → simulate → show `baw` command → "agent" sends it → paste tx hash.
 * Preferences are signed with the same EIP-712 typed data that `baw sign-message` shows.
 *
 * Local test accounts (anvil public keys, local only):
 *   W     0x90F7…b906 (anvil #3)  builder, Agent ID "qathree"
 *   X     0x15d3…6A65 (anvil #4)  attester, Agent ID "qafour"
 *   ADMIN 0xf39F…2266 (anvil #0)  protocol admin, Agent ID "qaadmin"
 *   ORG   0x7099…79C8 (anvil #1)  issuer, Agent ID "qaorg"
 *   A     real mainnet holder "kalektor" (impersonated locally)
 *   N     non-holder (anvil #2)
 *
 * Usage: APP=http://localhost:3300 RPC=http://127.0.0.1:8546 SHOTS=/tmp node e2e-local/user-journey.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createHmac } from 'node:crypto'
import { chromium } from '@playwright/test'
import { createTestClient, createWalletClient, defineChain, encodeAbiParameters, http, keccak256, pad, parseEther, toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const APP = process.env.APP ?? 'http://localhost:3300'
const RPC = process.env.RPC ?? 'http://127.0.0.1:8546'
const SHOTS = process.env.SHOTS ?? '/tmp'
const chain = defineChain({ id: 56, name: 'bsc-local', nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } })
const test = createTestClient({ chain, mode: 'anvil', transport: http(RPC) })
const wallet = createWalletClient({ chain, transport: http(RPC) })

const mirror = JSON.parse(readFileSync(new URL('../.data/agent-id-mirror.json', import.meta.url), 'utf8'))
const AGENT_ID = mirror.agentId
const [A, B] = mirror.holders
const DEV = {
  admin: { address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', key: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', label: 'qaadmin' },
  org: { address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', key: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', label: 'qaorg' },
  nonHolder: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
  w: { address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906', key: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6', label: 'qathree' },
  x: { address: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65', key: '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a', label: 'qafour' },
}

// ---------------------------------------------------------------- results
const results = []
const timeline = [] // step start/end in seconds from the start of the recording (VIDEO_DIR/timeline.json)
let videoStart = null
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
  const origin = videoStart ?? t0
  timeline.push({ name, ok: results[results.length - 1].ok, start: (t0 - origin) / 1000, end: (Date.now() - origin) / 1000 })
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

// ---------------------------------------------------------------- pages
const errorsByPersona = {}
const holderOf = new Map() // page -> connected Agent ID wallet address
// ONE_PAGE=1 runs every desktop persona on one shared page, so VIDEO_DIR gets one continuous recording.
// Each persona reconnects its own Agent ID wallet before acting (connect() below).
let sharedPage = null
async function persona(browser, name, { mobile = false } = {}) {
  errorsByPersona[name] = []
  if (process.env.ONE_PAGE && !mobile && sharedPage) return sharedPage
  // VIDEO_DIR=<dir> records the session as a webm clip (for the demo video).
  const video = process.env.VIDEO_DIR ? { dir: process.env.VIDEO_DIR, size: { width: 1400, height: 1000 } } : undefined
  const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1400, height: 1000 }, recordVideo: video })
  if (video && videoStart === null) videoStart = Date.now()
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errorsByPersona[name].push(`${current}: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|Failed to load resource|ERR_CONNECTION_REFUSED|bscscan/i.test(m.text())) errorsByPersona[name].push(`${current}: console: ${m.text().slice(0, 200)}`)
  })
  if (process.env.ONE_PAGE && !mobile) sharedPage = page
  return page
}

// ---------------------------------------------------------------- UI helpers
/** Sign in as an Agent ID wallet: enter the address, take the login prompt, sign its `baw` command, paste the signature. */
async function connect(page, address, signer = defaultSigner) {
  await page.context().clearCookies() // a previous persona's session must not carry over
  await page.goto(`${APP}/dashboard`)
  await page.getByRole('heading', { level: 1, name: 'Connect to start' }).or(page.getByRole('heading', { name: 'Your Agent ID wallet' })).first().waitFor({ timeout: 20_000 })
  await page.getByLabel('Agentic Wallet address').fill(address)
  await page.getByRole('button', { name: 'GET LOGIN PROMPT', exact: true }).click()
  const pre = page.locator('pre', { hasText: 'baw sign-message preview' }).first()
  await pre.waitFor({ timeout: 20_000 })
  const cmd = await pre.innerText()
  const signature = await signer(address, typedDataFromCommand(cmd))
  await page.getByLabel('Signature', { exact: true }).fill(signature)
  await page.getByRole('button', { name: 'SIGN IN', exact: true }).click()
  await page.getByRole('heading', { level: 1, name: 'Dashboard' }).waitFor({ timeout: 20_000 })
  holderOf.set(page, address)
}

/**
 * A is a real mainnet holder that exists here only as an impersonated address, so there is no key to sign with.
 * The harness mints the same signed session cookie the server issues after a successful sign-in (same AUTH_SECRET).
 */
const AUTH_SECRET = process.env.AUTH_SECRET ?? 'local-only-demo-secret-0123456789abcdef'
async function connectBySession(page, address) {
  const body = Buffer.from(JSON.stringify({ kind: 'session', address, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')
  const mac = createHmac('sha256', AUTH_SECRET).update(body).digest('base64url')
  await page.context().clearCookies()
  await page.context().addCookies([{ name: 'attested_session', value: `${body}.${mac}`, url: APP, httpOnly: true, sameSite: 'Lax' }])
  await page.goto(`${APP}/dashboard`)
  await page.getByRole('heading', { level: 1, name: 'Dashboard' }).waitFor({ timeout: 20_000 })
  holderOf.set(page, address)
}

/** Recover the EIP-712 data from the copied `baw sign-message` command. */
function typedDataFromCommand(cmd) {
  const raw = cmd.match(/--message '([\s\S]*)' --json/)?.[1]
  expect(raw, 'no typed data in login command')
  const req = JSON.parse(raw.replace(/'\\''/g, "'"))
  const td = JSON.parse(req.params[1])
  const { EIP712Domain: _domain, ...types } = td.types
  return {
    domain: td.domain,
    types,
    primaryType: td.primaryType,
    message: {
      address: td.message.address,
      nonce: BigInt(td.message.nonce),
      issuedAt: BigInt(td.message.issuedAt),
      expiresAt: BigInt(td.message.expiresAt),
    },
  }
}
/** The local node signs for its unlocked test accounts (anvil), as the holder's agent wallet would. */
async function defaultSigner(address, td) {
  return wallet.signTypedData({ account: address, ...td })
}

/** Agent path: click → copy the baw preview → the holder sends exactly that call → paste tx hash → track. */
async function agentAction(page, buttonName, holder, scope = page) {
  await scope.getByRole('button', { name: buttonName }).first().click()
  const pre = scope.locator('pre', { hasText: 'baw contract-call preview' }).first()
  const err = scope.locator('.bg-bad-bg').last()
  await Promise.race([pre.waitFor({ timeout: 25_000 }), err.waitFor({ timeout: 25_000 })])
  if (!(await pre.isVisible().catch(() => false))) throw new Error(`blocked: ${(await err.innerText()).slice(0, 200)}`)
  const cmd = await pre.innerText()
  const to = cmd.match(/--to (0x[0-9a-fA-F]{40})/)?.[1]
  const data = cmd.match(/--inputData (0x[0-9a-fA-F]+)/)?.[1]
  const from = cmd.match(/--from (0x[0-9a-fA-F]{40})/)?.[1]
  expect(to && data && from, 'could not parse baw command')
  expect(from.toLowerCase() === holder.toLowerCase(), 'baw --from is not the connected wallet')
  expect(/--binanceChainId 56/.test(cmd) && /--value 0/.test(cmd), 'baw command missing chain 56 / value 0')
  expect(/--gasLimit \d+/.test(cmd), 'baw command missing a gas cap')
  const gas = BigInt(cmd.match(/--gasLimit (\d+)/)[1])
  const hash = await wallet.sendTransaction({ account: holder, to, data, gas, chain })
  await scope.getByLabel('Transaction hash').fill(hash)
  await scope.getByRole('button', { name: 'Track' }).click()
  // Inline notice, or the toast when the form unmounts after success (e.g. a new profile).
  await page.getByText(/Done in block|done \(block/).first().waitFor({ timeout: 40_000 })
  return hash
}
const walletAction = (page, buttonName, scope = page) => agentAction(page, buttonName, holderOf.get(page), scope)

/** Sign the typed data that `baw sign-message` shows, then paste the signature into the app. */
async function signPreference(scope, holderKey) {
  const pre = scope.locator('pre', { hasText: 'baw sign-message preview' }).first()
  await pre.waitFor({ timeout: 20_000 })
  const cmd = await pre.innerText()
  const raw = cmd.match(/--message '([\s\S]*)' --json/)?.[1]
  expect(raw, 'no typed data in command')
  const req = JSON.parse(raw.replace(/'\\''/g, "'"))
  const td = JSON.parse(req.params[1])
  const { EIP712Domain: _domain, ...types } = td.types
  const message = {
    ...td.message,
    issuedAt: BigInt(td.message.issuedAt),
    acceptedAttestations: td.message.acceptedAttestations.map(BigInt),
    declinedAttestations: td.message.declinedAttestations.map(BigInt),
  }
  const sig = await privateKeyToAccount(holderKey).signTypedData({ domain: td.domain, types, primaryType: td.primaryType, message })
  await scope.getByLabel('Signature', { exact: true }).fill(sig)
  await scope.getByRole('button', { name: 'Save', exact: true }).click()
}

/** Expect the app to refuse before anything is sent. */
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

const settle = (page, ms = 800) => page.waitForTimeout(ms)

// ================================================================= main
const browser = await chromium.launch()
for (const who of [A.address, B.address, DEV.nonHolder, DEV.w.address, DEV.x.address, DEV.admin.address, DEV.org.address]) {
  await test.impersonateAccount({ address: who })
  await test.setBalance({ address: who, value: parseEther('1') })
}
await giveAgentId(DEV.w.address, DEV.w.label)
await giveAgentId(DEV.x.address, DEV.x.label)
await giveAgentId(DEV.admin.address, DEV.admin.label)
await giveAgentId(DEV.org.address, DEV.org.label)

// ---------------------------------------------------------------- visitor
const v = await persona(browser, 'visitor')
await step('Visitor: home loads with live counters and menu', async () => {
  await v.goto(APP)
  await v.getByRole('heading', { level: 1, name: /Show the work/ }).waitFor()
  expect(await v.getByText('PROFILES', { exact: true }).isVisible(), 'stats missing')
}, v)
await step('Visitor: every menu page opens', async () => {
  await v.goto(`${APP}/builders`)
  const pages = [
    ['BUILDERS', /Builders/],
    ['ORGS', /Organizations|issue credentials/],
    ['ACTIVITY', /that happened/],
    ['REPUTATION', /can audit/],
    ['VERIFY', /any record/],
    ['DASHBOARD', /Connect to start|Dashboard/],
  ]
  for (const [nav, h1] of pages) {
    await v.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: nav, exact: true }).click()
    await v.getByRole('heading', { level: 1, name: h1 }).waitFor({ timeout: 10_000 })
  }
}, v)
await step('Visitor: verify handles junk, unknown tx and unknown records', async () => {
  await v.goto(`${APP}/verify?q=hello`)
  await v.getByText(/Could not understand/).waitFor()
  await v.goto(`${APP}/verify?q=0x${'1'.repeat(64)}`)
  await v.getByText(/Transaction not found/).first().waitFor()
  await v.goto(`${APP}/verify?q=credential:99`)
  await v.getByText(/does not exist/).waitFor()
  await v.goto(`${APP}/p/nobody.ai`)
  await v.getByText('Profile not found').waitFor()
}, v)
await step('Visitor: dashboard shows only the Agent ID connect box', async () => {
  await v.goto(`${APP}/dashboard`)
  await v.getByRole('heading', { name: 'Your Agent ID wallet' }).waitFor()
  expect((await v.getByRole('button', { name: /browser wallet|metamask|injected/i }).count()) === 0, 'browser wallet option still shown')
}, v)

// ---------------------------------------------------------------- non-holder
const n = await persona(browser, 'nonHolder')
await step('Non-holder: connect is refused with a clear message', async () => {
  await n.goto(`${APP}/dashboard`)
  await n.getByLabel('Agentic Wallet address').fill(DEV.nonHolder)
  await n.getByRole('button', { name: 'GET LOGIN PROMPT', exact: true }).click()
  await n.getByText(/This wallet has no Agent ID/).waitFor({ timeout: 20_000 })
  expect((await n.getByRole('heading', { level: 1, name: 'Dashboard' }).count()) === 0, 'non-holder got into the dashboard')
}, n)

// ---------------------------------------------------------------- W: builder
const w = await persona(browser, 'W')
await step('W: connect Agent ID wallet', async () => {
  await connect(w, DEV.w.address)
  await w.getByText('AGENT ID', { exact: true }).first().waitFor({ timeout: 15_000 })
}, w)
await step('W: bio with an e-mail is blocked', async () => {
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
await step('W: create profile with own .ai name (agent confirms, receipt on-chain)', async () => {
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
  await w.getByLabel('Bio').fill('Full-stack builder. Version 2.')
  await walletAction(w, 'Publish profile update')
  await settle(w, 1500)
  await w.reload()
  await w.getByText(/version 2/).waitFor({ timeout: 15_000 })
}, w)
await step('W: invalid evidence link disables the project form', async () => {
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
await step('W: revise project keeps the original in history', async () => {
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
await step('W: make an attestation request link', async () => {
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
  expect(await w.getByRole('button', { name: 'Sign attestation on-chain' }).isDisabled(), 'self-attest button should be blocked')
}, w)

// ---------------------------------------------------------------- X: attester
const x = await persona(browser, 'X')
let attestationTx = ''
await step('X: connect and sign a peer attestation from the request link', async () => {
  await connect(x, DEV.x.address)
  await x.goto(requestLink)
  await x.getByText(/Attesting for/).waitFor({ timeout: 15_000 })
  await x.getByLabel('Your relationship to this work').selectOption('reviewer')
  await x.getByLabel(/What you witnessed/).fill('Reviewed the contracts line by line.')
  attestationTx = await walletAction(x, 'Sign attestation on-chain')
}, x)
await step('X: duplicate attestation is blocked', async () => {
  await x.goto(requestLink)
  await x.getByText(/already have active attestation/).waitFor({ timeout: 15_000 })
}, x)
await step('X: second skill on the same project is allowed', async () => {
  await x.goto(requestLink.replace('skill=solidity', 'skill=next.js'))
  await x.getByText(/Attesting for/).waitFor({ timeout: 15_000 })
  await walletAction(x, 'Sign attestation on-chain')
}, x)

// ---------------------------------------------------------------- A: real mainnet holder
const a = await persona(browser, 'A')
await step('A: connect and create profile through the agent', async () => {
  await connectBySession(a, A.address)
  await a.getByLabel('Display name').fill('Agent Builder A')
  await a.getByLabel(/Your Agent ID name/).fill(`${A.label}.ai`)
  await a.getByLabel('Skills').fill('rust, security-review, solidity')
  await walletAction(a, 'Create profile on-chain')
}, a)
await step('A: a transaction that is not the prepared one is rejected', async () => {
  await a.goto(`${APP}/dashboard/projects`)
  await a.getByRole('button', { name: '+ Add project' }).click()
  await a.getByLabel('Project title').fill('Agent project')
  await a.getByRole('button', { name: 'Add project on-chain' }).click()
  await a.locator('pre', { hasText: 'baw contract-call preview' }).waitFor({ timeout: 25_000 })
  const wrong = await wallet.sendTransaction({ account: A.address, to: DEV.admin.address, value: 1n, chain })
  await a.getByLabel('Transaction hash').fill(wrong)
  await a.getByRole('button', { name: 'Track' }).click()
  await a.getByText(/not the one we prepared/).waitFor({ timeout: 20_000 })
}, a)
await step('A: attest to W’s project', async () => {
  await a.goto(requestLink)
  await a.getByText(/Attesting for/).waitFor({ timeout: 15_000 })
  await walletAction(a, 'Sign attestation on-chain')
}, a)

// ---------------------------------------------------------------- W: preferences (EIP-712 via baw)
await connect(w, DEV.w.address)
await step('W: opt in to reputation (signed with baw sign-message)', async () => {
  await w.goto(`${APP}/dashboard/settings`)
  await w.getByText('Show my reputation').click()
  await w.getByRole('button', { name: 'Sign & save preferences' }).click()
  await signPreference(w, DEV.w.key)
  await w.getByText('SAVED ✓').waitFor({ timeout: 20_000 })
}, w)
await step('W: accept one attestation and decline another', async () => {
  await w.goto(`${APP}/dashboard/endorsements`)
  const received = w.locator('.sp-panel', { hasText: 'Received' }).first()
  const rowX = received.locator('li', { hasText: 'next.js' }).first()
  await rowX.waitFor({ timeout: 15_000 })
  await rowX.getByRole('button', { name: 'Accept' }).click()
  await signPreference(rowX, DEV.w.key)
  await w.getByText(/Accept: saved/).waitFor({ timeout: 20_000 })
  await settle(w)
  await w.reload()
  const rowA = w.locator('li', { hasText: `${A.label}.ai` }).first()
  await rowA.waitFor({ timeout: 15_000 })
  await rowA.getByRole('button', { name: 'Decline' }).click()
  await signPreference(rowA, DEV.w.key)
  await w.getByText(/Decline: saved/).waitFor({ timeout: 20_000 })
}, w)

// ---------------------------------------------------------------- admin + issuer
const admin = await persona(browser, 'admin')
await step('Admin: connect and approve an organization issuer', async () => {
  await connect(admin, DEV.admin.address)
  await admin.goto(`${APP}/dashboard/credentials`)
  await admin.getByText(/Issuer allowlist/).waitFor({ timeout: 15_000 })
  await admin.getByLabel('Issuer wallet').fill(DEV.org.address)
  await admin.getByLabel('Organization name').fill('QA Org')
  await walletAction(admin, 'Approve issuer')
}, admin)
const org = await persona(browser, 'org')
await step('Org: connect and see the past-expiry check', async () => {
  await connect(org, DEV.org.address)
  await org.goto(`${APP}/dashboard/credentials`)
  await org.getByText(/Issue a credential as QA Org/).waitFor({ timeout: 15_000 })
  await org.getByLabel('Subject profile').fill('qathree.ai')
  await org.getByText(/Issuing to/).waitFor({ timeout: 15_000 })
  await org.getByLabel('Credential type').fill('Hackathon Winner')
  await org.getByLabel('Title').fill('Winner, QA Hackathon')
  await org.getByLabel('Expires (optional)').fill('2020-01-01')
  await org.getByText('Must be in the future').waitFor()
}, org)
await step('Org: issue a credential, then issue and revoke another', async () => {
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

// ---------------------------------------------------------------- public views
await step('Public profile: trust sections, accepted tag, declined hidden', async () => {
  await v.goto(`${APP}/p/qathree.ai`)
  await v.getByRole('heading', { level: 1, name: 'QA Builder W' }).waitFor({ timeout: 15_000 })
  await v.getByText('Acknowledged by builder').first().waitFor()
  await v.getByText(/declined by the builder/).waitFor()
  if (await v.locator('li', { hasText: `${A.label}.ai` }).count()) throw new Error('declined attestation still listed')
  await v.getByRole('heading', { name: 'Winner, QA Hackathon' }).waitFor()
  await v.getByRole('heading', { name: 'Temporary badge' }).waitFor()
}, v)
await step('Public profile: "View tx" resolves to a transaction', async () => {
  await v.waitForFunction(() => [...document.querySelectorAll('a')].some((x) => /\/tx\/0x[0-9a-f]{64}/.test(x.href)), null, { timeout: 15_000 })
}, v)
await step('Builders: builders listed and skill filter works', async () => {
  await v.goto(`${APP}/builders`)
  await v.getByText('QA Builder W').first().waitFor({ timeout: 15_000 })
  await v.getByText('Agent Builder A').first().waitFor()
  await v.goto(`${APP}/builders?skill=rust`)
  await v.getByText('Agent Builder A').first().waitFor()
  expect((await v.getByText('QA Builder W').count()) === 0, 'skill filter did not exclude W')
}, v)
await step('Reputation: opted-in builder listed; declined excluded', async () => {
  await v.goto(`${APP}/reputation`)
  await v.getByText('QA Builder W').first().waitFor({ timeout: 15_000 })
  await v.waitForLoadState('networkidle') // let the page hydrate before clicking the link
  expect((await v.getByText('Agent Builder A').count()) === 0, 'non-opted-in builder listed')
  // Follow the breakdown link's own href (a click right after hydration is racy in this harness).
  const breakdownHref = await v.getByRole('link', { name: /Breakdown/ }).first().getAttribute('href')
  expect(breakdownHref?.startsWith('/reputation?profile='), 'breakdown link has the wrong target')
  await v.goto(`${APP}${breakdownHref}`)
  await v.getByText(/declined by the builder/).waitFor({ timeout: 15_000 })
}, v)
await step('Activity: filters by type, action and query', async () => {
  await v.goto(`${APP}/activity`)
  await v.getByText(/attested “solidity”/).first().waitFor({ timeout: 15_000 })
  await v.goto(`${APP}/activity?type=credential&action=revoked`)
  // The server caches the activity feed for 20 s, so reload until the newest revocation shows.
  for (let i = 0; i < 20 && !(await v.getByText(/Temporary badge.*was revoked/).count()); i++) {
    await settle(v, 1500)
    await v.reload()
  }
  await v.getByText(/Temporary badge.*was revoked/).waitFor()
  expect((await v.locator('ol li', { hasText: 'attested' }).count()) === 0, 'type filter leaked attestations')
  await v.goto(`${APP}/activity?q=${DEV.x.address}`)
  await v.getByText(/0x15d3…6A65 attested/).first().waitFor()
}, v)
await step('Organizations: QA Org listed and its detail page opens', async () => {
  await v.goto(`${APP}/organizations`)
  await v.getByText('QA Org').first().click()
  await v.getByRole('heading', { level: 1, name: 'QA Org' }).waitFor({ timeout: 15_000 })
  await v.getByRole('heading', { name: 'Winner, QA Hackathon' }).first().waitFor()
}, v)
await step('Verify: builder response, credential status, tx decode, address', async () => {
  await v.goto(`${APP}/verify?q=attestation:2`)
  await v.getByText(/accepted \(owner-signed, off-chain\)/).first().waitFor({ timeout: 15_000 })
  await v.goto(`${APP}/verify?q=attestation:3`)
  await v.getByText(/declined \(owner-signed, off-chain\)/).first().waitFor({ timeout: 15_000 })
  await v.goto(`${APP}/verify?q=credential:1`)
  await v.getByText(/Currently valid: issued by an approved organization/).first().waitFor()
  await v.goto(`${APP}/verify?q=credential:2`)
  await v.getByText(/Not currently valid/).first().waitFor()
  await v.goto(`${APP}/verify?q=${DEV.w.address}`)
  await v.getByText(/Holds an Agent ID/).first().waitFor()
  if (attestationTx) {
    await v.goto(`${APP}/verify?q=${attestationTx}`)
    await v.getByText('AttestationIssued').waitFor()
  }
}, v)
await connect(w, DEV.w.address)
await step('W: hide from Explore and social links take effect', async () => {
  await w.goto(`${APP}/dashboard/settings`)
  await w.getByText('Hide me from Explore').click()
  await w.getByText('Hide social links').click()
  await w.getByRole('button', { name: 'Sign & save preferences' }).click()
  await signPreference(w, DEV.w.key)
  await w.getByText('SAVED ✓').waitFor({ timeout: 20_000 })
  await settle(w, 500)
  await v.goto(`${APP}/builders`)
  await v.getByText('Agent Builder A').first().waitFor({ timeout: 15_000 })
  expect((await v.getByText('QA Builder W').count()) === 0, 'hidden builder still listed')
  await v.goto(`${APP}/p/qathree.ai`)
  await v.getByRole('heading', { level: 1, name: 'QA Builder W' }).waitFor()
  expect((await v.getByRole('link', { name: /^github ↗$/i }).count()) === 0, 'social link still shown')
}, v)
await step('W: disconnect returns to the connect box', async () => {
  await w.goto(`${APP}/dashboard/settings`)
  // Two buttons share this name (header chip and this card); the card is last in the DOM.
  await w.getByRole('button', { name: 'Disconnect', exact: true }).last().click()
  await w.getByRole('heading', { name: 'Your Agent ID wallet' }).waitFor({ timeout: 15_000 })
}, w)

// ---------------------------------------------------------------- mobile
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
if (process.env.VIDEO_DIR) writeFileSync(`${process.env.VIDEO_DIR}/timeline.json`, JSON.stringify(timeline, null, 2))
for (const [p, errs] of Object.entries(errorsByPersona)) if (errs.length) console.log(`console/page errors for ${p}:\n  ${[...new Set(errs)].slice(0, 8).join('\n  ')}`)
process.exit(failed.length ? 1 : 0)
