import { keccak256, stringToBytes, type Hex } from 'viem'
import { z } from 'zod'
import { normalizeKey } from './keys'

/**
 * Off-chain metadata is stored as canonical JSON (recursively sorted keys, no whitespace)
 * and anchored on-chain by keccak256(utf8(canonicalJson)). Anyone can recompute the hash.
 * Never put private documents, e-mail addresses or other personal details in metadata.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value))
}

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep)
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      const val = (v as Record<string, unknown>)[k]
      if (val !== undefined) out[k] = sortDeep(val)
    }
    return out
  }
  return v
}

export function hashCanonical(json: string): Hex {
  return keccak256(stringToBytes(json))
}

export function hashMetadata(value: unknown): { json: string; hash: Hex } {
  const json = canonicalJson(value)
  return { json, hash: hashCanonical(json) }
}

const httpsUrl = z
  .string()
  .trim()
  .max(300)
  .url()
  .refine((u) => /^https:\/\//i.test(u), 'Must be an https:// URL')

const optionalUrl = z.union([httpsUrl, z.literal('').transform(() => undefined)]).optional()

const skillList = z
  .array(z.string())
  .max(20)
  .transform((arr, ctx) => {
    const out: string[] = []
    for (const s of arr) {
      const k = normalizeKey(s)
      if (!k) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid skill "${s}"` })
        continue
      }
      if (!out.includes(k)) out.push(k)
    }
    return out
  })

const noEmail = (s: string) => !/[^\s@]+@[^\s@]+\.[^\s@]+/.test(s)

export const profileMetadataSchema = z.object({
  schema: z.literal('skillproof/profile@1'),
  displayName: z.string().trim().min(1).max(60),
  bio: z.string().trim().max(600).refine(noEmail, 'Do not publish e-mail addresses').default(''),
  skills: skillList.default([]),
  avatarUrl: optionalUrl,
  links: z
    .object({
      website: optionalUrl,
      github: optionalUrl,
      x: optionalUrl,
      linkedin: optionalUrl,
    })
    .default({}),
})
export type ProfileMetadata = z.output<typeof profileMetadataSchema>

export const evidenceKinds = ['commit', 'pull-request', 'repository', 'deployment-tx', 'contract', 'demo', 'other'] as const

export const projectMetadataSchema = z.object({
  schema: z.literal('skillproof/project@1'),
  title: z.string().trim().min(1).max(100),
  summary: z.string().trim().max(1000).refine(noEmail, 'Do not publish e-mail addresses').default(''),
  role: z.string().trim().max(80).default(''),
  projectUrl: optionalUrl,
  repositoryUrl: optionalUrl,
  skills: skillList.default([]),
  evidence: z
    .array(
      z.object({
        kind: z.enum(evidenceKinds),
        label: z.string().trim().max(100).default(''),
        // https URL, a 0x tx hash (66 chars) or a 0x contract address (42 chars)
        ref: z
          .string()
          .trim()
          .max(300)
          .refine(
            (r) => /^https:\/\//i.test(r) || /^0x[0-9a-fA-F]{64}$/.test(r) || /^0x[0-9a-fA-F]{40}$/.test(r),
            'Evidence must be an https URL, a 0x transaction hash or a 0x contract address',
          ),
      }),
    )
    .max(20)
    .default([]),
})
export type ProjectMetadata = z.output<typeof projectMetadataSchema>

export const relationships = ['collaborator', 'reviewer', 'teammate', 'mentor', 'client', 'judge', 'other'] as const

export const attestationNoteSchema = z.object({
  schema: z.literal('skillproof/attestation@1'),
  relationship: z.enum(relationships),
  comment: z.string().trim().max(500).refine(noEmail, 'Do not publish e-mail addresses').default(''),
})
export type AttestationNote = z.output<typeof attestationNoteSchema>

export const credentialMetadataSchema = z.object({
  schema: z.literal('skillproof/credential@1'),
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(800).default(''),
  evidenceUrl: optionalUrl,
  criteria: z.string().trim().max(500).default(''),
})
export type CredentialMetadata = z.output<typeof credentialMetadataSchema>

export const metadataSchemas = {
  profile: profileMetadataSchema,
  project: projectMetadataSchema,
  attestation: attestationNoteSchema,
  credential: credentialMetadataSchema,
} as const
export type MetadataKind = keyof typeof metadataSchemas

export const MAX_METADATA_BYTES = 8 * 1024
