import { invoke } from '@tauri-apps/api/core'
import { z } from 'zod'
import { providerWireProtocolSchema, providerConfigSchema, providerKindSchema, type ProviderConfig, type ProviderWireProtocol } from './provider-types'

const secretMarker = /^(?:sk-)|(?:bearer\s)|(?:api_?key|token|secret|password)=/i
const hasControlCharacter = (value: string) => Array.from(value).some((character) => {
  const code = character.charCodeAt(0)
  return code < 32 || code === 127
})
const sanitizedText = (maximum: number) => z.string().min(1).max(maximum)
  .refine((value) => !hasControlCharacter(value) && !value.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(value) && !secretMarker.test(value), 'Unsafe display metadata is not allowed.')
const sanitizedBaseUrl = z.string().max(2048).refine((value) => {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash
  } catch { return false }
}, 'Unsafe provider endpoint is not allowed.')

const credentialPreviewSchema = z.object({
  sourceType: z.enum(['environment', 'keychain', 'config-literal', 'cc-switch-db', 'none', 'session', 'helper', 'dotenv']),
  reference: sanitizedText(128).optional(),
  available: z.boolean(),
  importable: z.boolean(),
}).strict()

export const providerDiscoveryCandidateSchema = z.object({
  id: z.string().regex(/^provider-candidate:[a-f0-9]{64}$/), source: z.string().regex(/^[a-z0-9-]+$/), sourceLabel: sanitizedText(80),
  agentId: z.string().regex(/^[a-z0-9-]+$/).optional(), schemaId: z.string().regex(/^[a-z0-9-]+$/).optional(),
  configLocation: sanitizedText(160).refine((value) => (value.startsWith('~/') || value.startsWith('$')) && !value.includes('..') && !value.includes('\\'), 'Host paths are not allowed').optional(), kind: providerKindSchema, label: sanitizedText(120),
  baseUrl: sanitizedBaseUrl.optional(), wireProtocol: providerWireProtocolSchema.optional(),
  modelHint: sanitizedText(160).refine((value) => !value.startsWith('/'), 'Host paths are not allowed').optional(), credential: credentialPreviewSchema,
  warnings: z.array(sanitizedText(240)).max(8),
}).strict().superRefine((candidate, context) => {
  if (candidate.credential.importable && (!candidate.credential.available || ['session', 'helper', 'none'].includes(candidate.credential.sourceType))) {
    context.addIssue({ code: 'custom', path: ['credential', 'importable'], message: 'Only available API-key sources are importable.' })
  }
  if (candidate.agentId && !candidate.schemaId) context.addIssue({ code: 'custom', path: ['schemaId'], message: 'Agent candidates require a schema ID.' })
  if (['environment', 'dotenv'].includes(candidate.credential.sourceType) && candidate.credential.reference && !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(candidate.credential.reference)) {
    context.addIssue({ code: 'custom', path: ['credential', 'reference'], message: 'Environment references must be variable names.' })
  }
})
export type ProviderDiscoveryCandidate = z.infer<typeof providerDiscoveryCandidateSchema>

export async function discoverProviderCandidates(): Promise<ProviderDiscoveryCandidate[]> {
  const raw = await invoke<unknown>('discover_provider_candidates')
  return z.array(providerDiscoveryCandidateSchema).parse(raw)
}

const autoConfiguredProviderSchema = z.object({
  provider: providerConfigSchema,
  models: z.array(sanitizedText(300)).min(1),
}).strict()

export type AutoConfiguredProvider = z.infer<typeof autoConfiguredProviderSchema>

export async function autoConfigureProviderCandidate(
  candidateId: string,
): Promise<AutoConfiguredProvider> {
  const input = z.object({
    candidateId: z.string().regex(/^provider-candidate:[a-f0-9]{64}$/),
  }).strict().parse({ candidateId })
  return autoConfiguredProviderSchema.parse(await invoke<unknown>(
    'auto_configure_provider_candidate',
    { input },
  ))
}

export async function createProviderDraft(input: {
  kind: string; baseUrl: string; wireProtocol?: ProviderWireProtocol;
  candidateId?: string; providerId?: string; secret?: string
}): Promise<string> {
  const parsed = z.object({
    kind: providerKindSchema, baseUrl: sanitizedBaseUrl, wireProtocol: providerWireProtocolSchema.optional(),
    candidateId: z.string().regex(/^provider-candidate:[a-f0-9]{64}$/).optional(), providerId: z.string().min(1).max(160).optional(), secret: z.string().min(1).optional(),
  }).strict().superRefine((value, context) => {
    const sources = Number(Boolean(value.candidateId)) + Number(Boolean(value.providerId)) + Number(Boolean(value.secret))
    const local = ['ollama', 'vllm', 'lm-studio'].includes(value.kind)
    if (sources > 1 || (sources === 0 && !local)) context.addIssue({ code: 'custom', message: 'Select exactly one credential source.' })
  }).parse(input)
  const value = await invoke<unknown>('create_provider_draft', { input: parsed })
  return z.object({ draftId: z.string().min(1), expiresInSeconds: z.number().positive() }).parse(value).draftId
}

export async function checkProviderDraft(draftId: string): Promise<string[]> {
  const value = await invoke<unknown>('check_provider_draft', { draftId })
  return z.object({ models: z.array(z.string().min(1)) }).parse(value).models
}

export async function cancelProviderDraft(draftId: string): Promise<void> {
  await invoke('cancel_provider_draft', { draftId })
}

export async function importProviderDraft(input: {
  draftId: string; providerId: string; label: string; defaultModel: string;
  enabled: boolean
}): Promise<ProviderConfig> {
  return providerConfigSchema.parse(await invoke<unknown>('import_provider_draft', { input }))
}
