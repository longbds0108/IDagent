# Architecture

```
apps/web            Next.js 15 (App Router) + Tailwind 4 + wagmi/viem
  app/              Home, /builders, /p/[id], /dashboard/*, /verify, API routes
  lib/reads.ts      Server read layer: contracts → typed views; metadata hash verification
  lib/verify.ts     Transaction decoding for the Verification Center
  lib/metadata-store.ts  Content-addressed JSON store (Postgres or filesystem)
  components/action-runner.tsx  Every write: simulate → fee → wallet / agent hand-off → receipt
  scripts/          Local demo: mirror real Agent ID state, end-to-end flow
packages/contracts  Foundry: 4 registries + AgentIdGate, tests, deploy scripts
packages/shared     ABIs, action→calldata encoding, baw command builder, metadata schemas, trust labels
skills/skillproof   SKILL.md for Agentic Wallet AI agents
```

## Data flow for a write

1. The form posts JSON to `POST /api/metadata`. The server validates it (zod: https-only links, no e-mail
   addresses, size ≤ 8 KB, normalized skills), canonicalizes it (sorted keys), stores it under
   `keccak256(canonical)` and returns `{ uri, hash }`.
2. `POST /api/simulate` runs `eth_call` and estimates gas from the acting address and returns a revert reason in
   plain language.
3. Browser wallet: chain must be 56 (switch prompted), user confirms, receipt awaited.
   Agentic Wallet: `POST /api/calldata` → `baw contract-call preview …` for the user's agent; user pastes the tx hash.
4. Success is shown only from a mined receipt with `status == success`.

## Reading and verification

- Contracts expose paginated views (`getProfiles`, `getProjectsOf`, `getReceived`, `getIssued`,
  `verifyCredential`, `getIssuers`). The server reads them directly; list views cache for 15 s, and verification
  views are uncached.
- Every record stores its `createdBlock`/`issuedBlock`/`revokedBlock`, so "View transaction" is one
  single-block log query.
- Metadata is fetched from the local store by hash (or from https/ipfs URIs with SSRF guards) and **re-hashed**.
  Anything that does not match is labelled "does NOT match the on-chain hash".

## Contracts

- `SkillProfileRegistry`: one profile per address; optional verified `.ai` label; versioned metadata pointer.
- `ProjectEvidenceRegistry`: immutable evidence records; `supersedeProject` creates a linked revision; revoke by creator.
- `SkillAttestation`: peer statements keyed by `(issuer, profile, project, skillKey)`; one active per key; revoke by issuer.
- `CredentialRegistry`: AccessControl allowlist via `setIssuer`; credentials with optional expiry; revoke by issuer
  or governance; `verifyCredential` returns `Valid | Revoked | Expired | IssuerInactive`.

All four are non-upgradeable. `Pausable` stops new writes; revocations keep working while paused.

## Owner permissions (disclosed)

| Role | Holder at deployment | Can | Cannot |
|---|---|---|---|
| `DEFAULT_ADMIN_ROLE` (all 4) | deployer `0xF964…6a57` | grant/revoke roles; approve/remove issuers; governance-revoke a credential | edit/delete profiles, projects or attestations; move funds (contracts hold none) |
| `PAUSER_ROLE` (all 4) | deployer | pause/unpause new writes | block revocations |
| `ISSUER_ROLE` (CredentialRegistry) | none yet | issue credentials; revoke own | issue to own profile |

Recommended: transfer `DEFAULT_ADMIN_ROLE` and `PAUSER_ROLE` to a multisig, then renounce from the deployer.
