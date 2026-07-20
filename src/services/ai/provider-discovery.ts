import { invoke } from '@tauri-apps/api/core'
import { z } from 'zod'
import { openAIWireProtocolSchema, providerConfigSchema, providerKindSchema, type ProviderConfig } from './provider-types'

const credentialPreviewSchema = z.object({
  sourceType: z.enum(['environment', 'keychain', 'config-literal', 'none']),
  reference: z.string().optional(),
  available: z.boolean(),
  importable: z.boolean(),
}).strict()

export const providerDiscoveryCandidateSchema = z.object({
  id: z.string().min(1), source: z.string().min(1), sourceLabel: z.string().min(1),
  configLocation: z.string().optional(), kind: providerKindSchema, label: z.string().min(1),
  baseUrl: z.string().optional(), wireProtocol: openAIWireProtocolSchema.optional(),
  modelHint: z.string().optional(), credential: credentialPreviewSchema,
  warnings: z.array(z.string()),
}).strict()
export type ProviderDiscoveryCandidate = z.infer<typeof providerDiscoveryCandidateSchema>

export async function discoverProviderCandidates(): Promise<ProviderDiscoveryCandidate[]> {
  const raw = await invoke<unknown>('discover_provider_candidates')
  return z.array(providerDiscoveryCandidateSchema).parse(raw)
}

export async function createProviderDraft(input: {
  kind: string; baseUrl: string; wireProtocol?: 'responses' | 'chat-completions';
  candidateId?: string; providerId?: string; secret?: string
}): Promise<string> {
  const value = await invoke<unknown>('create_provider_draft', { input })
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
