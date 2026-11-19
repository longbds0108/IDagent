# attested

On-chain builder portfolios anchored to **Agent ID** on **BNB Smart Chain mainnet (chain 56)**.

attested keeps three kinds of claims apart and never merges them into one "verified" badge:

| Label | Proves | Does not prove |
|---|---|---|
| **Self-reported** | The profile owner published it from their Agent ID wallet | That it is accurate |
| **Peer attested** | Another Agent ID holder signed a statement about this skill on this project | That the statement is true |
| **Approved issuer credential** | An admin-approved organization issued it and has not revoked it | Factual infallibility |

Every record links to its BNB Smart Chain transaction and to the exact evidence JSON whose keccak256 hash it anchors.

## Live contracts (chain 56)

| Contract | Address |
|---|---|
| SkillProfileRegistry | [`0xDaf663BF05701b509067cE2341B11FFbc227C9B9`](https://bscscan.com/address/0xDaf663BF05701b509067cE2341B11FFbc227C9B9) |
| ProjectEvidenceRegistry | [`0x2D3d33263DdC5c117ddCC0238DE6C313021a2f7F`](https://bscscan.com/address/0x2D3d33263DdC5c117ddCC0238DE6C313021a2f7F) |
| SkillAttestation | [`0x713B02D4539F1D9EB60123C68cbf0D9fFA83612c`](https://bscscan.com/address/0x713B02D4539F1D9EB60123C68cbf0D9fFA83612c) |
| CredentialRegistry | [`0x209f0E30e1aec3470fF41a8fC67b0351f51a5433`](https://bscscan.com/address/0x209f0E30e1aec3470fF41a8fC67b0351f51a5433) |
| Agent ID (official, read-only) | [`0x60b9262456de011f7d15a54cdd8c48baaa8b022f`](https://bscscan.com/address/0x60b9262456de011f7d15a54cdd8c48baaa8b022f) |

## How Agent ID is used

Agent ID is enforced **inside the contracts**, not just in the UI:

- `createProfile` / `updateProfile` / `addProject` / `supersedeProject` / `attest` require
  `AgentID.balanceOf(msg.sender) > 0`.
- A builder can bind their own `name.ai`. The registry checks `AgentID.ownerOf(keccak256(name)) == msg.sender`.
- One profile per address and per Agent ID token. No self-attestation. One active attestation per issuer, project and skill.
- Agentic Wallet users act through **their own AI agent**: attested prepares calldata and a
  `baw contract-call preview` command, the agent runs it, and the user confirms in the Binance App. No QR codes,
  pairing codes, keys or server sessions. See [`skills/skillproof/SKILL.md`](skills/skillproof/SKILL.md).

Details, verified facts and spec conflicts: [`docs/agent-id-integration.md`](docs/agent-id-integration.md).

## Pages

| # | Page | Route | What it does |
|---|---|---|---|
| 1 | Home | `/` | Product intro, live protocol counters, trust-level explainer |
| 2 | Explore Builders | `/builders` | Search and filter profiles by name, `.ai` or skill |
| 3 | Builder Profile | `/p/[id]` | Public profile, projects, peer attestations, credentials, identity status |
| 4 | Dashboard | `/dashboard` | Profile overview, completeness, recent on-chain activity |
| 5 | My Projects | `/dashboard/projects` | Add, revise (supersede) and revoke project evidence |
| 6 | Endorsements | `/dashboard/endorsements` | Request links, sign attestations, accept / decline received ones, revoke sent ones |
| 7 | Credentials | `/dashboard/credentials` | Received credentials, issuer issuance and revocation, admin issuer allowlist |
| 8 | Verification Center | `/verify` | Decode a tx, check a record, profile or address live on-chain |
| 9 | Reputation | `/reputation` | Opt-in, published formula; Evidence / Peer / Issuer scored separately with history |
| 10 | Organizations | `/organizations` | Approved and removed issuers, what each has issued |
| 11 | Activity | `/activity` | Filterable event feed rebuilt from contract state |
| 12 | Settings | `/dashboard/settings` | Account status, connections, signed privacy preferences |

Accepting or declining an attestation, reputation opt-in and privacy toggles are **owner-signed EIP-712
messages** stored off-chain (Agentic Wallets sign with `baw sign-message`). They change presentation only; the
on-chain records never change and stay visible in Verify and Activity.

## Repository

```
apps/web             Next.js app (Home, Builders, Profile, Dashboard ×4, Verify) + API
packages/contracts   Foundry contracts, tests, deploy scripts, deployments/56.json
packages/shared      ABIs, calldata + baw command builders, metadata schemas, trust labels
skills/skillproof    Skill for Agentic Wallet AI agents
docs/                Architecture, Agent ID integration, deployment, demo outline, submission checklist
```

## Quick start

Requires Node 20+, pnpm 9, Foundry.

```bash
git submodule update --init --recursive
pnpm install
cp .env.example apps/web/.env.local     # mainnet addresses are prefilled
pnpm dev                                # http://localhost:3000
```

## Tests

```bash
pnpm contracts:test                                          # 57 unit + fuzz tests
BSC_MAINNET_RPC_URL=https://bsc-rpc.publicnode.com pnpm contracts:test:fork   # real Agent ID contract on a fork
pnpm test                                                    # shared + web unit tests incl. reputation formula
cd apps/web && pnpm build && npx playwright test             # 22 browser tests (desktop + mobile)
pnpm demo:local                                              # full end-to-end flow, 31 checks (below)
SKIP_E2E=1 KEEP_RUNNING=1 APP_PORT=3300 ANVIL_PORT=8546 pnpm demo:local   # then, in apps/web:
APP=http://localhost:3300 RPC=http://127.0.0.1:8546 pnpm e2e:journey     # 38-step user journey through the real UI
```

`pnpm demo:local` starts a local chain-56 node that mirrors the **real** Agent ID bytecode and the storage slots it
reads for two real holders. It deploys with the production deploy script, starts the app, and runs register →
add project → attest → approve issuer → issue credential → verify → revoke/revise, plus negative cases (non-holder,
foreign `.ai` name, self-attestation, duplicate, unauthorized issuer). Nothing is broadcast to mainnet.

## Security notes

- Non-upgradeable contracts; `AccessControl` + `Pausable`; revocations work while paused.
- Admins cannot edit or delete anyone's profile, project or attestation. Owner permissions are documented in
  [`docs/architecture.md`](docs/architecture.md).
- No personal data on-chain; metadata is validated (https-only links, no e-mail addresses, ≤ 8 KB) and content-addressed.
- Contracts hold no funds and request no token approvals.

## Limitations

- Agent ID is an eligibility signal, **not proof of personhood or uniqueness**.
- Attestations are signed statements, not proof of truth. Credentials prove issuance, not infallibility.
- The `tokenId = keccak256(label)` relation was observed on-chain, not documented. Label binding is optional and fails closed.
- attested is an independent project, not affiliated with or endorsed by Binance or BNB Chain.
