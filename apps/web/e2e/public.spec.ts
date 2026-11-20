import { expect, test } from '@playwright/test'

test.describe('public pages work without a wallet', () => {
  test('home explains the three trust levels and has no generic "Verified" badge', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /Show the work/ })).toBeVisible()
    for (const label of ['Self-reported', 'Peer attested', 'Approved issuer credential']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible()
    }
    await expect(page.locator('text=/^Verified$/')).toHaveCount(0)
    await expect(page.getByText('BSC MAINNET · CHAIN 56 · GAS IN BNB')).toBeAttached()
  })

  test('explore builders renders and filters', async ({ page }) => {
    await page.goto('/builders?skill=solidity')
    await expect(page.getByRole('heading', { level: 1, name: /Builders/ })).toBeVisible()
  })

  test('verification center decodes a attested deployment transaction', async ({ page }) => {
    const tx = process.env.E2E_VERIFY_TX
    test.skip(!tx, 'set E2E_VERIFY_TX to a attested transaction hash')
    await page.goto(`/verify?q=${tx}`)
    await expect(page.getByText(/Executed successfully/)).toBeVisible()
    const scan = page.getByRole('link', { name: /BscScan/ }).first()
    await expect(scan).toHaveAttribute('href', new RegExp(`^https://bscscan\\.com/tx/${tx}$`, 'i'))
  })

  test('verification center rejects nonsense clearly', async ({ page }) => {
    await page.goto('/verify?q=hello%20world')
    await expect(page.getByText(/Could not understand/)).toBeVisible()
  })

  test('unknown profile is a clean 404', async ({ page }) => {
    const res = await page.goto('/p/999999999')
    expect(res?.status()).toBe(404)
    await expect(page.getByText('Profile not found')).toBeVisible()
  })
})

test.describe('phase-2 pages', () => {
  test('organizations directory explains issuer approval', async ({ page }) => {
    await page.goto('/organizations')
    await expect(page.getByRole('heading', { level: 1, name: /issue credentials/ })).toBeVisible()
    await expect(page.getByText('APPROVED NOW')).toBeVisible()
  })

  test('activity feed renders with filters', async ({ page }) => {
    await page.goto('/activity?type=attestation')
    await expect(page.getByRole('heading', { level: 1, name: /that happened/ })).toBeVisible()
    await expect(page.getByRole('link', { name: 'ATTESTATIONS', exact: true })).toBeVisible()
  })

  test('reputation publishes its formula and never a single combined score', async ({ page }) => {
    await page.goto('/reputation')
    await expect(page.getByRole('heading', { level: 1, name: /can audit/ })).toBeVisible()
    for (const c of ['EVIDENCE', 'PEER', 'ISSUER']) await expect(page.getByText(c, { exact: true }).first()).toBeVisible()
    await expect(page.getByText(/Each part is shown on its own/).first()).toBeVisible()
  })

  test('/settings routes to the dashboard settings tab', async ({ page }) => {
    await page.goto('/settings')
    await expect(page).toHaveURL(/\/dashboard\/settings$/)
  })
})

test.describe('dashboard connection', () => {
  test('only one way in: the Agent ID wallet field, no browser wallet option', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: 'Your Agent ID wallet' })).toBeVisible()
    await expect(page.getByRole('button', { name: /browser wallet/i })).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText(/scan (the )?QR|pairing code:/i)
  })

  test('a wallet without Agent ID cannot connect', async ({ page }) => {
    await page.goto('/dashboard')
    await page.getByLabel('Agentic Wallet address').fill('0x000000000000000000000000000000000000dEaD')
    await page.getByRole('button', { name: 'GET LOGIN PROMPT', exact: true }).click()
    await expect(page.getByText(/This wallet has no Agent ID/)).toBeVisible({ timeout: 20_000 })
  })
})
