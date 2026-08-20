import { describe, expect, it } from 'vitest'
import type { ProviderConfig } from './provider-types'
import type { ProviderVerification } from './provider-verification'
import { verifiedTextRouteCandidates } from './text-route-candidates'

const fetchedAt = '2026-08-12T00:00:00.000Z'
const providers: ProviderConfig[] = [
  {
    id: 'mox', kind: 'openai-compatible', label: 'MOX',
    baseUrl: 'https://mox.example/v1', wireProtocol: 'chat-completions',
    catalog: { models: ['gpt-5.5'], fetchedAt }, enabled: true,
  },
  {
    id: 'qwen', kind: 'dashscope', label: 'Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    wireProtocol: 'chat-completions',
    catalog: {
      models: ['qwen-image-3.0-pro', 'qwen-plus', 'qwen3-max'],
      fetchedAt,
    },
    enabled: true,
  },
]
const checkedAt = fetchedAt
const verifications: Record<string, ProviderVerification> = {
  mox: { status: 'verified', checkedAt },
  qwen: { status: 'verified', checkedAt },
}

describe('verified text route candidates', () => {
  it('preserves the configured binding first and excludes image-only catalog rows', () => {
    expect(verifiedTextRouteCandidates({
      preferred: { providerId: 'mox', model: 'gpt-5.5' },
      providers,
      verifications,
    })).toEqual([
      { providerId: 'mox', model: 'gpt-5.5' },
      { providerId: 'qwen', model: 'qwen-plus' },
      { providerId: 'qwen', model: 'qwen3-max' },
    ])
  })

  it('never reorders verified routes for a packaged-E2E-only experiment', () => {
    expect(verifiedTextRouteCandidates({
      preferred: { providerId: 'mox', model: 'gpt-5.5' },
      providers: [
        providers[0]!,
        {
          ...providers[1]!,
          catalog: { models: ['qwen-image-3.0-pro'], fetchedAt },
        },
      ],
      verifications,
    })).toEqual([{ providerId: 'mox', model: 'gpt-5.5' }])
  })

  it('drops a route whose model is absent from the connection catalog', () => {
    // The receipt says the credential works; the catalog is what proves the
    // slug is reachable. Before the split these were the same record, so a
    // stale model survived a catalog refresh that no longer listed it.
    expect(verifiedTextRouteCandidates({
      preferred: { providerId: 'mox', model: 'gpt-retired' },
      providers,
      verifications,
    })).toEqual([
      { providerId: 'mox', model: 'gpt-5.5' },
      { providerId: 'qwen', model: 'qwen-plus' },
      { providerId: 'qwen', model: 'qwen3-max' },
    ])
  })
})
