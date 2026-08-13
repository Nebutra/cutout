import { describe, expect, it } from 'vitest'
import type { PlanningRuntimeEvidence } from '@/services/ai/planning-runtime'
import type { ProviderDiscoveryCandidate } from '@/services/ai/provider-discovery'
import type { ProviderConfig } from '@/services/ai/provider-types'
import { capabilityBindingsSchema } from '@/services/ai/model-capabilities'
import {
  discoveredCandidateMatchesProvider,
  projectAiSetup,
  type AiSetupProjectionInput,
} from './ai-setup-projection'

const openai: ProviderConfig = {
  id: 'openai',
  kind: 'openai',
  label: 'OpenAI',
  baseUrl: 'https://api.openai.com/v1',
  wireProtocol: 'responses',
  defaultModel: 'gpt-5',
  enabled: true,
}

const verified = {
  status: 'verified' as const,
  model: 'gpt-5',
  models: ['gpt-5', 'gpt-image-2'],
  checkedAt: '2026-07-28T00:00:00.000Z',
}

const codex: PlanningRuntimeEvidence = {
  runtimeId: 'codex-system',
  installed: true,
  authenticated: true,
  authClass: 'chatgpt',
  capability: 'proven',
  execution: 'unproven',
  version: '0.200.0',
}

const bindings = capabilityBindingsSchema.parse({
  version: 'model-assignments.v2',
  bindings: {
    text: { providerId: 'openai', model: 'gpt-5' },
    'image-generation': { providerId: 'openai', model: 'gpt-image-2' },
    'image-edit': { providerId: 'openai', model: 'gpt-image-2' },
  },
})

const candidate: ProviderDiscoveryCandidate = {
  id: `provider-candidate:${'a'.repeat(64)}`,
  source: 'codex',
  sourceLabel: 'Codex',
  kind: 'openai',
  label: 'OpenAI from Codex',
  baseUrl: 'https://api.openai.com/v1/',
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
    runtimeState: 'success',
    providersState: 'success',
    providers: [],
    verifications: {},
    bindingsState: 'success',
    discoveryState: 'success',
    candidates: [],
    ...overrides,
  }
}

describe('capability-first AI setup projection', () => {
  it('returns exactly the three workflow capability rows', () => {
    expect(projectAiSetup(input()).rows.map((row) => row.capability)).toEqual([
      'planning',
      'image-generation',
      'image-edit',
    ])
  })

  it('reports ready only when planning and both exact image routes are proven', () => {
    const result = projectAiSetup(input({
      runtime: codex,
      providers: [openai],
      verifications: { openai: verified },
      bindings,
    }))
    expect(result.status).toBe('ready')
    expect(result.rows.map((row) => row.status)).toEqual(['ready', 'ready', 'ready'])
    expect(result.rows[0]?.adapter).toMatchObject({ id: 'codex-system', kind: 'system-runtime' })
    expect(result.rows[1]?.adapter?.label).toContain('gpt-image-2')
  })

  it('uses a verified direct text route when Codex execution is not safely supported', () => {
    const unsupported: PlanningRuntimeEvidence = {
      ...codex,
      capability: 'unsupported',
      reason: 'protocol-unsupported',
    }
    const result = projectAiSetup(input({
      runtime: unsupported,
      providers: [openai],
      verifications: { openai: verified },
      bindings,
    }))
    expect(result.rows[0]).toMatchObject({
      capability: 'planning',
      status: 'ready',
      adapter: { id: 'openai', kind: 'direct-provider' },
    })
  })

  it('does not treat a non-text binding as a planning fallback', () => {
    const visionOnly = capabilityBindingsSchema.parse({
      version: 'model-assignments.v2',
      bindings: { vision: { providerId: 'openai', model: 'gpt-5' } },
    })
    const result = projectAiSetup(input({
      providers: [openai],
      verifications: { openai: verified },
      bindings: visionOnly,
    }))
    expect(result.rows[0]).toMatchObject({
      capability: 'planning',
      status: 'action-required',
    })
  })

  it('keeps planning usable while identifying only missing image capabilities', () => {
    const textOnly = capabilityBindingsSchema.parse({
      version: 'model-assignments.v2',
      bindings: { text: { providerId: 'openai', model: 'gpt-5' } },
    })
    const result = projectAiSetup(input({ runtime: codex, bindings: textOnly }))
    expect(result.status).toBe('action-required')
    expect(result.rows.map((row) => [row.capability, row.status])).toEqual([
      ['planning', 'ready'],
      ['image-generation', 'action-required'],
      ['image-edit', 'action-required'],
    ])
  })

  it('surfaces the stable runtime reason when no planning fallback exists', () => {
    const result = projectAiSetup(input({
      runtime: {
        ...codex,
        capability: 'unsupported',
        reason: 'protocol-unsupported',
      },
    }))
    expect(result.rows[0]).toMatchObject({
      status: 'action-required',
      reason: 'protocol-unsupported',
      nextAction: 'upgrade-runtime',
      evidence: { installed: true, authenticated: true, execution: 'unproven' },
    })
  })

  it('directs an unsupported Codex version to upgrade instead of retrying the same binary', () => {
    const result = projectAiSetup(input({
      runtime: {
        ...codex,
        capability: 'unsupported',
        reason: 'runtime-version-unsupported',
      },
    }))
    expect(result.rows[0]).toMatchObject({
      status: 'action-required',
      reason: 'runtime-version-unsupported',
      nextAction: 'upgrade-runtime',
    })
  })

  it('does not confuse catalog verification with execution proof', () => {
    const result = projectAiSetup(input({
      runtime: codex,
      providers: [openai],
      verifications: { openai: verified },
      bindings,
    }))
    expect(result.rows.every((row) => row.evidence.execution === 'unproven')).toBe(true)
  })

  it('stays checking while a required authority is loading', () => {
    expect(projectAiSetup(input({ runtimeState: 'pending' })).status).toBe('checking')
    expect(projectAiSetup(input({ providersState: 'pending' })).status).toBe('checking')
    expect(projectAiSetup(input({ bindingsState: 'pending' })).status).toBe('checking')
  })

  it('keeps only missing direct image capabilities checking while discovery is pending', () => {
    const result = projectAiSetup(input({ runtime: codex, discoveryState: 'pending' }))
    expect(result.rows.map((row) => [row.capability, row.status])).toEqual([
      ['planning', 'ready'],
      ['image-generation', 'checking'],
      ['image-edit', 'checking'],
    ])
  })

  it('does not block already-proven image routes on pending discovery', () => {
    const result = projectAiSetup(input({
      runtime: codex,
      providers: [openai],
      verifications: { openai: verified },
      bindings,
      discoveryState: 'pending',
    }))
    expect(result.status).toBe('ready')
  })

  it('does not call an unrelated or disabled provider installed evidence', () => {
    const disabled = { ...openai, enabled: false }
    const result = projectAiSetup(input({ providers: [disabled] }))
    expect(result.rows[1]?.evidence.installed).toBe(false)
    expect(result.rows[2]?.evidence.installed).toBe(false)
  })

  it('keeps reviewed importable API-key candidates separate from runtime auth', () => {
    const result = projectAiSetup(input({ candidates: [candidate], runtime: codex }))
    expect(result.importableCandidates).toEqual([candidate])
    expect(result.rows[0].adapter?.id).toBe('codex-system')
  })

  it('does not offer a discovered credential as a duplicate configured connection', () => {
    expect(discoveredCandidateMatchesProvider(candidate, openai)).toBe(true)
    const result = projectAiSetup(input({ providers: [openai], candidates: [candidate] }))
    expect(result.importableCandidates).toEqual([])
    expect(result.automaticCandidates).toEqual([candidate])
  })
})
