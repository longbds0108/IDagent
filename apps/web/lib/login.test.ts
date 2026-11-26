import { describe, expect, it } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import { agentLoginPrompt, bawLoginCommand, loginSecretHash, verifyLogin, type LoginMessage } from './login'

const CONTRACT = '0xDaf663BF05701b509067cE2341B11FFbc227C9B9' as const
const KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
const account = privateKeyToAccount(KEY)

const msg: LoginMessage = {
  address: account.address,
  nonce: '123456789012345678901234567890',
  issuedAt: 1_795_000_000,
  expiresAt: 1_795_000_300,
}

/** Recover the typed data from the exact command the user copies, as the agent's wallet would. */
function typedDataFromCommand(command: string) {
  const raw = command.match(/--message '([\s\S]*)' --json/)?.[1]
  if (!raw) throw new Error('no --message in command')
  const req = JSON.parse(raw.replace(/'\\''/g, "'"))
  const td = JSON.parse(req.params[1])
  const { EIP712Domain: _d, ...types } = td.types
  return {
    domain: td.domain,
    types,
    primaryType: td.primaryType as string,
    message: {
      address: td.message.address,
      nonce: BigInt(td.message.nonce),
      issuedAt: BigInt(td.message.issuedAt),
      expiresAt: BigInt(td.message.expiresAt),
    },
  }
}

describe('sign-in by signature', () => {
  it('builds an eth_signTypedData_v4 baw command for the login message', () => {
    const cmd = bawLoginCommand(msg, CONTRACT)
    expect(cmd).toMatch(/^baw sign-message preview --binanceChainId 56 --signType EIP712/)
    expect(cmd).toContain('eth_signTypedData_v4')
    expect(cmd).toContain('attested Login')
  })

  it('accepts a signature made from the copied command, and rejects a tampered one', async () => {
    const cmd = bawLoginCommand(msg, CONTRACT)
    const td = typedDataFromCommand(cmd)
    const sig = await account.signTypedData(td)
    expect(await verifyLogin(msg, CONTRACT, sig)).toBe(true)
    // Another nonce or another wallet's signature must not pass.
    expect(await verifyLogin({ ...msg, nonce: '1' }, CONTRACT, sig)).toBe(false)
    const other = privateKeyToAccount('0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6')
    const otherSig = await other.signTypedData(td)
    expect(await verifyLogin(msg, CONTRACT, otherSig)).toBe(false)
  })

  it('accepts a 64-byte signature without a recovery id, in either common form', async () => {
    const td = typedDataFromCommand(bawLoginCommand(msg, CONTRACT))
    const sig = await account.signTypedData(td)
    const r = sig.slice(2, 66)
    const s = sig.slice(66, 130)
    const v = parseInt(sig.slice(130, 132), 16)
    // r‖s only, as a wallet that does not return the recovery id.
    expect(await verifyLogin(msg, CONTRACT, `${r}${s}`)).toBe(true)
    // EIP-2098 compact: the parity bit is folded into the top bit of s.
    const sTop = v === 28 ? (BigInt(`0x${s}`) | (1n << 255n)).toString(16).padStart(64, '0') : s
    expect(await verifyLogin(msg, CONTRACT, `${r}${sTop}`)).toBe(true)
    // A 64-byte value that is not this signature must still fail.
    expect(await verifyLogin(msg, CONTRACT, `0x${'11'.repeat(64)}`)).toBe(false)
  })

  it('carries every step inline, so the agent needs no link to open', () => {
    const hash = 'ab'.repeat(32)
    const prompt = agentLoginPrompt('https://www.attested.top', hash)
    expect(prompt).toContain(`"secretHash":"${hash}"`)
    expect(prompt).toContain('https://www.attested.top/api/auth/challenge')
    expect(prompt).toContain('https://www.attested.top/api/auth/complete')
    expect(prompt).toContain('baw sign-message execute --requestId')
    expect(prompt).toContain('baw sign-message result --requestId')
    expect(prompt).not.toMatch(/0x[0-9a-f]{64}/i) // no private key or signature template
    expect(prompt.length).toBeLessThan(1000)
  })

  it('hashes the browser secret with SHA-256 (the server stores only this hash)', async () => {
    expect(await loginSecretHash('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
