import { describe, expect, it } from 'vitest'
import type { ProviderDiscoveryCandidate } from '@/services/ai/provider-discovery'
import type { ProviderConfig } from '@/services/ai/provider-types'
import {
  discoveredCandidateMatchesProvider,
  projectAiSetup,
  type AiSetupProjectionInput,
} from './ai-setup-projection'

const openai: ProviderConfig = {
  id: 'openai',
  kind: 'openai',
  label: 'OpenAI',
  defaultModel: 'gpt-5',
  enabled: true,
}

const deepseek: ProviderConfig = {
  id: 'deepseek',
  kind: 'deepseek',
  label: 'DeepSeek',
  defaultModel: 'deepseek-chat',
  enabled: true,
}

const verified = {
  status: 'verified' as const,
  model: 'verified-model',
  checkedAt: '2026-07-28T00:00:00.000Z',
}

const candidate: ProviderDiscoveryCandidate = {
  id: `provider-candidate:${'a'.repeat(64)}`,
  source: 'codex',
  sourceLabel: 'Codex',
  kind: 'openai',
  label: 'OpenAI from Codex',
  wireProtocol: 'responses',
  credential: {
    sourceType: 'config-literal',
    reference: 'OPENAI_API_KEY',
    available: true,
    importable: true,
  },
  warnings: [],
}

function input(overrides: Partial<AiSetupProjectionInput> = {}): AiSetupProjectionInput {
  return {
    providersState: 'success',
    providers: [],
    verifications: {},
    bindingsState: 'success',
    discoveryState: 'success',
    candidates: [],
    ...overrides,
  }
}

describe('AI setup projection', () => {
  it('stays checking while provider or binding authority is loading', () => {
    expect(projectAiSetup(input({ providersState: 'pending' })).status).toBe('checking')
    expect(projectAiSetup(input({ bindingsState: 'pending' })).status).toBe('checking')
    expect(projectAiSetup(input({ discoveryState: 'pending' })).status).toBe('checking')
  })

  it('claims ready only for enabled verified providers with full coverage', () => {
    expect(projectAiSetup(input({
      providers: [openai],
      verifications: { openai: verified },
      discoveryState: 'error',
    }))).toMatchObject({ status: 'ready', verifiedProviders: [openai] })

    expect(projectAiSetup(input({
      providers: [{ ...openai, enabled: false }],
      verifications: { openai: verified },
    })).status).toBe('needs-verification')

    expect(projectAiSetup(input({
      providers: [openai],
      verifications: { openai: { status: 'verified' } },
    })).status).toBe('needs-verification')
  })

  it('keeps configured unverified and failed providers actionable', () => {
    expect(projectAiSetup(input({ providers: [openai] }))).toMatchObject({
      status: 'needs-verification',
    })
    expect(projectAiSetup(input({
      providers: [openai],
      verifications: { openai: { status: 'failed' } },
      discoveryState: 'error',
    }))).toMatchObject({ status: 'needs-verification' })
  })

  it('shows only missing capabilities when verified providers have gaps', () => {
    const result = projectAiSetup(input({
      providers: [deepseek],
      verifications: { deepseek: verified },
    }))
    expect(result.status).toBe('needs-capabilities')
    if (result.status !== 'needs-capabilities') return
    expect(result.missing.map((item) => item.task)).toEqual([
      'vision',
      'image-to-webdev',
      'image-generation',
      'image-edit',
    ])
  })

  it('prioritizes explicit import actions when no verified setup exists', () => {
    expect(projectAiSetup(input({
      candidates: [candidate],
    }))).toMatchObject({ status: 'discovered-credentials', candidates: [candidate] })
  })

  it('does not offer a discovered credential as a duplicate configured connection', () => {
    expect(discoveredCandidateMatchesProvider(candidate, openai)).toBe(true)
    expect(projectAiSetup(input({
      providers: [openai],
      candidates: [candidate],
    }))).toMatchObject({ status: 'needs-verification', providers: [openai] })

    expect(discoveredCandidateMatchesProvider(
      { ...candidate, kind: 'openai-compatible', baseUrl: 'https://relay.example/v1/' },
      {
        ...openai,
        kind: 'openai-compatible',
        baseUrl: 'https://relay.example/v1',
        wireProtocol: 'responses',
      },
    )).toBe(true)
  })

  it('offers the provider directory when discovery succeeds without importable credentials', () => {
    expect(projectAiSetup(input()).status).toBe('needs-provider')
  })

  it('surfaces sanitized unavailability only when initial setup is blocked', () => {
    expect(projectAiSetup(input({ providersState: 'error' }))).toEqual({
      status: 'unavailable',
      reason: 'configuration',
    })
    expect(projectAiSetup(input({ discoveryState: 'error' }))).toEqual({
      status: 'unavailable',
      reason: 'discovery',
    })
    expect(projectAiSetup(input({
      providers: [openai],
      verifications: { openai: verified },
      discoveryState: 'error',
    })).status).toBe('ready')
  })
})
