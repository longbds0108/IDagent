---
name: skillproof
description: Use SkillProof (on-chain builder portfolio on BNB Smart Chain) from a Binance Agentic Wallet. Create a profile, add project evidence, attest to another builder's skill, or revoke your own records, by preparing calldata with the SkillProof API and submitting it with `baw contract-call`. Use when the user asks to register on SkillProof, add a project, endorse/attest a builder, or revoke a SkillProof record.
---

# SkillProof for Agentic Wallet agents

SkillProof contracts live on **BNB Smart Chain mainnet (chain 56)**. Gated actions require the sender to hold an
Agent ID (checked on-chain). You (the agent) never get keys: you prepare calldata and the user confirms every
transaction through the official Agentic Wallet flow.

## Ground rules

- Only use the contract addresses returned by the SkillProof API and listed below. Never invent addresses.
- Always run `preview` first, show the user the preview (target contract, 0 BNB value, action), and only run
  `execute` after the user agrees. The Binance App may ask for a further confirmation.
- Requires Developer Mode, which only the user can enable in the Binance App. Check with `baw wallet settings --json`
  (`devMode.enabled`).
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

`$APP` is the SkillProof site origin. `$ME` is the user's Agentic Wallet address on BSC.

1. **Check state**: `GET $APP/api/account/$ME` → `agentIdHeld`, `profileId`.
2. **Store metadata** (profile, project, attestation note): `POST $APP/api/metadata` with
   `{"kind":"profile"|"project"|"attestation","data":{...}}` → `{ uri, hash }`.
   - profile: `displayName`, `bio`, `skills[]`, `avatarUrl?`, `links{website,github,x,linkedin}?` (https only)
   - project: `title`, `summary`, `role`, `projectUrl?`, `repositoryUrl?`, `skills[]`, `evidence[{kind,label,ref}]`
   - attestation: `relationship` (collaborator|reviewer|teammate|mentor|client|judge|other), `comment`
3. **Dry-run**: `POST $APP/api/simulate` with `{"from":"$ME","call":{...action}}` → `{ ok, feeBnb }` or `{ ok:false, error }`.
   Stop and tell the user if `ok` is false.
4. **Get the command**: `POST $APP/api/calldata` with the same body → `baw.preview`.
5. Run `baw.preview`, show the result, then on approval `baw contract-call execute --requestId <id> --json`.
6. **Confirm**: open `$APP/verify?q=<txHash>`.

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
