import { z } from 'zod'
import { isAddress, isHex, type Address, type Hex } from 'viem'
import { isValidKeyString, type SkillProofAction } from '@skillproof/shared'

const bigintStr = z.union([z.string().regex(/^\d{1,30}$/), z.number().int().nonnegative()]).transform((v) => BigInt(v))
const hash = z.string().refine((v) => isHex(v) && v.length === 66, 'bytes32 hex expected').transform((v) => v as Hex)
const uri = z.string().min(1).max(256)
const key = z.string().refine(isValidKeyString, 'normalized key expected')
const address = z.string().refine(isAddress, 'address expected').transform((v) => v as Address)

/** Wire format of a SkillProofAction (bigints as decimal strings). */
export const actionSchema: z.ZodType<SkillProofAction, z.ZodTypeDef, unknown> = z.discriminatedUnion('action', [
  z.object({ action: z.literal('createProfile'), agentLabel: z.string().max(64).default(''), metadataURI: uri, metadataHash: hash }),
  z.object({ action: z.literal('updateProfile'), metadataURI: uri, metadataHash: hash }),
  z.object({ action: z.literal('bindAgentLabel'), agentLabel: z.string().min(1).max(64) }),
  z.object({ action: z.literal('addProject'), profileId: bigintStr, metadataURI: uri, evidenceHash: hash }),
  z.object({ action: z.literal('supersedeProject'), projectId: bigintStr, metadataURI: uri, evidenceHash: hash }),
  z.object({ action: z.literal('revokeProject'), projectId: bigintStr }),
  z.object({ action: z.literal('attest'), profileId: bigintStr, projectId: bigintStr, skill: key, metadataHash: hash }),
  z.object({ action: z.literal('revokeAttestation'), attestationId: bigintStr }),
  z.object({
    action: z.literal('issueCredential'),
    profileId: bigintStr,
    credentialType: key,
    metadataURI: uri,
    metadataHash: hash,
    expiresAt: bigintStr.default('0'),
  }),
  z.object({ action: z.literal('revokeCredential'), credentialId: bigintStr }),
  z.object({ action: z.literal('setIssuer'), issuer: address, approved: z.boolean(), name: z.string().max(64), metadataURI: z.string().max(256) }),
]) as never
