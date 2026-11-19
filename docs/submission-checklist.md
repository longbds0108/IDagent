# Hackathon submission checklist

Source: the official announcement (re-read 2026-11-18). Submission window: **2026-11-18 08:00 UTC to 2026-12-09 08:00 UTC**
(15:00 ICT). Internal review runs until 12-17, public review until 12-20, and rewards are paid within 14 business days
after that. Only data generated during the submission window counts.

## Required by the rules
- [x] Contracts deployed on BNB Chain (BSC mainnet 56), see `docs/deployment.md`
- [ ] **Source code verified on BscScan.** Needs an Etherscan API key; commands are in deployment.md. Sourcify already
      shows an exact match.
- [ ] **Code publicly open-source**: make github.com/longbds0108/IDagent public
- [x] Owner permissions disclosed (`docs/architecture.md` → "Owner permissions"); put the same on the website
- [x] Agent ID actively used in the product (gates every core write; see `docs/agent-id-integration.md`)
- [ ] Submit via the official form (https://app.binance.com/uni-qr/user-survey/fb26d2bd25e04329b1ba77c7b3811d23) with:
      project name, **website**, contract address(es), Agent ID usage description, **reward receiving address**, and
      any other materials the form asks for
- [ ] One project per team; submitter keeps an active Binance Account

## Needed to qualify for awards
- [ ] **Live website** (deploy `apps/web`; set `PUBLIC_APP_URL` to the domain and `DATABASE_URL` to Postgres)
- [ ] Innovation Award: product live **and at least 30 Agent ID addresses interacting with the contracts during the
      submission window** (real users only)
- [ ] Pioneer Award: ranked by the number of interacting Agent ID holder addresses plus transaction volume or count.
      Only submitted contract addresses count.
- [ ] Optional: Community Promotion. Original X posts with #BinanceWalletHackathon #AgenticWallet, submitted via
      https://app.binance.com/uni-qr/user-survey/ff6832f8d2984af289068c9450a3c98c

## Red lines (immediate disqualification)
- [x] No web QR / pairing-code login for Agentic Wallet, and no server-stored sessions
- [x] The skill (`skills/skillproof/SKILL.md`) never bypasses user confirmation: preview, show, explicit yes, execute
- [x] No asset transfers or approvals: contracts hold no funds, `value` is always 0
- [x] Contracts open-source with owner permissions documented
- [x] Name does not use "Binance"/"BNB" to impersonate; footer states non-affiliation
- [x] Never collects seed phrases, private keys, API secrets or pairing codes
- [x] No promised returns; no trading features
- [x] Not a "look up other people's wallets by name" tool: only names bound by their owner on attested resolve, and
      owners can hide from Explore
- [ ] No volume manipulation or mass account registration. Grow usage only through real builders and attesters.

## Recommended
- [ ] Move `DEFAULT_ADMIN_ROLE` / `PAUSER_ROLE` from the hot deployer wallet to a multisig
- [ ] Approve at least one real organization issuer
- [ ] 2–3 minute demo video (`docs/demo-video.md`)
