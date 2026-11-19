---
name: skillproof
description: Use Attested (on-chain builder portfolio on BNB Smart Chain) from a Binance Agentic Wallet. Create a profile, add project evidence, attest to another builder's skill, or revoke your own records, by preparing calldata with the Attested API and submitting it with `baw contract-call`. Use when the user asks to register on Attested, add a project, endorse/attest a builder, or revoke a Attested record.
---

# Attested for Agentic Wallet agents

Attested contracts live on **BNB Smart Chain mainnet (chain 56)**. Gated actions require the sender to hold an
Agent ID (checked on-chain). You (the agent) never get keys: you prepare calldata and the user confirms every
transaction through the official Agentic Wallet flow.

## Ground rules

- Only use the contract addresses returned by the Attested API and listed below. Never invent addresses.
- Always run `preview` first, show the user the preview (target contract, 0 BNB value, action), and only run
  `execute` after the user agrees. The Binance App may ask for a further confirmation.
- Requires Developer Mode, which only the user can enable in the Binance App (Agentic Wallet → Settings). Check with
  `baw wallet settings --json` (`devMode.enabled`, `devMode.expiresAt`). It lapses after 7 days without use, and enabling is
  refused while the wallet balance is above the Developer Mode balance cap (351804).
- The sender must be the user's Agentic Wallet, which holds the Agent ID. Get it with `baw wallet address --json`
  (the entry with `binanceChainId` "56"). Keep a little BNB there for gas (`baw wallet balance --symbol BNB --binanceChainId 56 --json`).
- Never ask for or handle seed phrases, private keys, QR codes or pairing codes.
- Metadata is public. Do not include e-mail addresses or private details.

## Contracts (chain 56)

| Contract | Address |
|---|---|
| SkillProfileRegistry | `0xDaf663BF05701b509067cE2341B11FFbc227C9B9` |
| ProjectEvidenceRegistry | `0x2D3d33263DdC5c117ddCC0238DE6C313021a2f7F` |
| SkillAttestation | `0x713B02D4539F1D9EB60123C68cbf0D9fFA83612c` |
| CredentialRegistry | `0x209f0E30e1aec3470fF41a8fC67b0351f51a5433` |

## Steps

`$APP` is the Attested site origin. `$ME` is the user's Agentic Wallet address on BSC.

1. **Check state**: `GET $APP/api/account/$ME` → `agentIdHeld`, `profileId`.
2. **Store metadata** (profile, project, attestation note): `POST $APP/api/metadata` with
   `{"kind":"profile"|"project"|"attestation","data":{...}}` → `{ uri, hash }`.
   - profile: `displayName`, `bio`, `skills[]`, `avatarUrl?`, `links{website,github,x,linkedin}?` (https only)
   - project: `title`, `summary`, `role`, `projectUrl?`, `repositoryUrl?`, `skills[]`, `evidence[{kind,label,ref}]`
   - attestation: `relationship` (collaborator|reviewer|teammate|mentor|client|judge|other), `comment`
3. **Dry-run**: `POST $APP/api/simulate` with `{"from":"$ME","call":{...action}}` → `{ ok, feeBnb }` or `{ ok:false, error }`.
   Stop and tell the user if `ok` is false.
4. **Get the command**: `POST $APP/api/calldata` with the same body → `baw.preview`.
5. Run `baw.preview` exactly as returned. It includes `--gasLimit` set to Attested's estimate +30%, because these
   contracts write block timestamps and numbers, so an exact estimate can run out of gas. Show the user `parsedTx` (contract must be the Attested contract, value 0), the simulation result and
   any `risks`. Only on an explicit yes, run `baw contract-call execute --requestId <id> --json`.
   - `BROADCASTED` → you get `txHash`.
   - `PENDING_CONFIRMATION` → the user approves in the Binance App.
   - Errors: 351802 Developer Mode expired · 351803 blocked as high risk (no requestId, stop) · 351805 simulation failed
     (report the message exactly, e.g. a Attested revert such as `DuplicateActiveAttestation`).
6. **Confirm**: open `$APP/verify?q=<txHash>`.

## Accept / decline an attestation, privacy settings (EIP-712, no gas)

1. `GET $APP/api/preferences/$ME`, then modify `acceptedAttestations` / `declinedAttestations` / toggles, and set
   `issuedAt` to now (unix seconds).
2. Sign the typed data shown on the Attested Settings page with
   `baw sign-message preview --binanceChainId 56 --signType EIP712 --message '<eth_signTypedData_v4 request>' --json`,
   show it to the user, then `baw sign-message execute --requestId <id> --json` (if PENDING_CONFIRMATION: user approves in
   the App, then `baw sign-message result --order-id <orderId> --json`).
3. `POST $APP/api/preferences` with the preferences plus `signature`. If `signature` is 64 bytes, append
   `v = 27 + signatureRecovery`. Signatures older than 15 minutes are rejected.

## Actions (`call` objects; ids as decimal strings)

- `{"action":"createProfile","agentLabel":"<label without .ai, or empty>","metadataURI":uri,"metadataHash":hash}`
- `{"action":"updateProfile","metadataURI":uri,"metadataHash":hash}`
- `{"action":"bindAgentLabel","agentLabel":"<label>"}`
- `{"action":"addProject","profileId":"12","metadataURI":uri,"evidenceHash":hash}`
- `{"action":"supersedeProject","projectId":"7","metadataURI":uri,"evidenceHash":hash}`
- `{"action":"revokeProject","projectId":"7"}`
- `{"action":"attest","profileId":"12","projectId":"7","skill":"solidity","metadataHash":hash}`: skill keys are
  lowercase `a-z 0-9 - . + #`, max 32 chars. You cannot attest to yourself, and only one active attestation per
  builder + project + skill.
- `{"action":"revokeAttestation","attestationId":"3"}`

## What to tell the user

A peer attestation proves that their wallet signed the statement, not that it is true. Revocations stay visible in
history. Holding an Agent ID is not proof of personhood.
