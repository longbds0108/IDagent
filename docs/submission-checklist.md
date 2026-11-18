# Hackathon submission checklist

Submission window: 2026-11-18 08:00 UTC → **2026-12-09 08:00 UTC** (15:00 ICT). Recheck the announcement for changes.

- [x] Contracts deployed on BNB Smart Chain mainnet (chain 56), see `docs/deployment.md`
- [x] Source verified on Sourcify (exact match)
- [ ] **Source verified on BscScan** (required by the rules; needs an Etherscan API key, commands in deployment.md)
- [ ] Public live app URL (deploy `apps/web`; set `PUBLIC_APP_URL`, `DATABASE_URL`)
- [ ] Public GitHub repository (this monorepo)
- [x] Agent ID usage description: `docs/agent-id-integration.md`
- [x] Owner permissions documented: `docs/architecture.md`
- [x] Automated tests: `forge test` (57 unit/fuzz + 4 mainnet-fork), `vitest`, Playwright (14), local end-to-end demo (23 checks)
- [ ] Transfer admin roles to a multisig (recommended before public launch)
- [ ] Approve at least one real organization issuer
- [ ] 2–3 minute demo video (`docs/demo-video.md`)
- [ ] **30+ distinct Agent ID holder addresses interacting with the contracts during the submission period**, from real users
      only, with no bots or farmed volume. Track with `/builders` and the verification page.
- [ ] Submit project name, website, contract addresses and Agent ID usage via the official survey
- [ ] Limitations stated: Agent ID ≠ proof of personhood; attestations are signed statements, not proof of truth
- [ ] Re-confirm eligibility rules directly from Binance before submitting
