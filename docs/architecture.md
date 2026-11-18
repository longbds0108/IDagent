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

## Off-chain signed preferences (phase 2)

`POST /api/preferences` accepts a full preferences snapshot signed with EIP-712
(domain `SkillProof Preferences` v1, chain 56, verifying contract = SkillProfileRegistry):
`reputationOptIn`, `hideFromExplore`, `hideSocialLinks`, `hideAvatar`, `acceptedAttestations[]`,
`declinedAttestations[]`, `issuedAt`. The server verifies the signature with `verifyTypedData`
(EOA, ERC-1271 and ERC-6492), rejects stale or replayed snapshots (`issuedAt` must be within 15 minutes
and newer than the stored one), and only allows responses to attestations made to the signer's own
profile. Storage: Postgres table `account_preferences`, or `.data/preferences` locally.

## Reputation formula v1

Implemented in `apps/web/lib/reputation.ts` (unit-tested) and published on `/reputation`. Three
components are reported separately and never summed:

- **Evidence**: 10 points per active project with hash-verified metadata, plus 2 per evidence reference (max 5). Max 5 projects. Cap 100.
- **Peer**: 20 points × weight per distinct signer. Weight is 1 + 0.25 per extra skill (max +0.5), ×0.5 for reciprocal pairs, ×0.8 for signers without a profile. Declined attestations are excluded. Cap 100.
- **Issuer**: 40 points for the first valid credential per approved issuer, 10 for each further one from the same issuer. Cap 100.

History is replayed in event order (timestamp, then block).

## Activity feed

`/activity` is rebuilt from contract state: every record stores its created, closed and revoked blocks
and timestamps, so no event indexer or derived database is needed. It is cached for 20 s per server
instance.
