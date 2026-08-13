import { describe, expect, it } from 'vitest'
import type { ProviderConfig } from './provider-types'
import type { ProviderVerification } from './provider-verification'
import { verifiedTextRouteCandidates } from './text-route-candidates'

const providers: ProviderConfig[] = [
  {
    id: 'mox', kind: 'openai-compatible', label: 'MOX',
    baseUrl: 'https://mox.example/v1', wireProtocol: 'chat-completions',
    defaultModel: 'gpt-5.5', enabled: true,
  },
  {
    id: 'qwen', kind: 'dashscope', label: 'Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    wireProtocol: 'chat-completions', defaultModel: 'qwen-image-3.0-pro', enabled: true,
  },
]
const checkedAt = '2026-08-12T00:00:00.000Z'
const verifications: Record<string, ProviderVerification> = {
  mox: { status: 'verified', model: 'gpt-5.5', models: ['gpt-5.5'], checkedAt },
  qwen: {
    status: 'verified', model: 'qwen-image-3.0-pro',
    models: ['qwen-image-3.0-pro', 'qwen-plus', 'qwen3-max'], checkedAt,
  },
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

  it('makes Qwen-first an exact packaged-E2E experiment rather than a product default', () => {
    expect(verifiedTextRouteCandidates({
      preferred: { providerId: 'mox', model: 'gpt-5.5' },
      providers,
      verifications,
      preferPackagedE2eQwen: true,
    })[0]).toEqual({ providerId: 'qwen', model: 'qwen-plus' })
    expect(verifiedTextRouteCandidates({
      preferred: { providerId: 'mox', model: 'gpt-5.5' },
      providers,
      verifications,
    })[0]).toEqual({ providerId: 'mox', model: 'gpt-5.5' })
  })

  it('does not manufacture a Qwen candidate when qwen-plus lacks catalog evidence', () => {
    expect(verifiedTextRouteCandidates({
      preferred: { providerId: 'mox', model: 'gpt-5.5' },
      providers,
      verifications: {
        ...verifications,
        qwen: {
          status: 'verified', model: 'qwen-image-3.0-pro',
          models: ['qwen-image-3.0-pro'], checkedAt,
        },
      },
      preferPackagedE2eQwen: true,
    })).toEqual([{ providerId: 'mox', model: 'gpt-5.5' }])
  })
})
