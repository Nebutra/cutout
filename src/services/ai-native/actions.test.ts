import { beforeEach, describe, expect, it } from 'vitest'
import { compileAssetProductionPlan, beginAssetProduction } from '@/asset-production'
import { getStoreState } from '@/store'
import { createAiNativeSnapshot, parseAiNativeAction } from './actions'

describe('AI Native semantic slice actions', () => {
  beforeEach(() => getStoreState().resetProject())

  it('parses a prototype plan action', () => {
    const action = parseAiNativeAction({
      type: 'plan-prototype',
      brief: '多页面 SaaS 官网',
      model: 'gpt-5.5',
    })

    expect(action).toEqual({
      type: 'plan-prototype',
      brief: '多页面 SaaS 官网',
      model: 'gpt-5.5',
    })
  })

  it('parses DESIGN.md control actions', () => {
    expect(
      parseAiNativeAction({
        type: 'set-design-md',
        name: 'DESIGN.md',
        content: '# System\nUse restrained enterprise UI.',
      }),
    ).toEqual({
      type: 'set-design-md',
      name: 'DESIGN.md',
      content: '# System\nUse restrained enterprise UI.',
    })

    expect(parseAiNativeAction({ type: 'clear-design-md' })).toEqual({
      type: 'clear-design-md',
    })

    expect(
      parseAiNativeAction({
        type: 'import-design-md',
        path: '/tmp/DESIGN.md',
      }),
    ).toEqual({
      type: 'import-design-md',
      path: '/tmp/DESIGN.md',
    })
  })

  it('parses provider drafts with the refined wire-protocol contract', () => {
    expect(parseAiNativeAction({
      type: 'upsert-provider',
      provider: {
        kind: 'openai-compatible',
        label: 'Anthropic relay',
        baseUrl: 'https://relay.example/v1',
        wireProtocol: 'anthropic-messages',
        defaultModel: 'claude-sonnet-4-6',
        enabled: true,
      },
    })).toMatchObject({
      type: 'upsert-provider',
      provider: { wireProtocol: 'anthropic-messages' },
    })

    expect(() => parseAiNativeAction({
      type: 'upsert-provider',
      provider: {
        kind: 'deepseek',
        label: 'Invalid',
        wireProtocol: 'anthropic-messages',
        defaultModel: 'deepseek-chat',
        enabled: true,
      },
    })).toThrow('not supported for deepseek')
  })

  it('parses a semantic slice plan action', () => {
    const action = parseAiNativeAction({
      type: 'plan-semantic-slices',
      brief: '政府官网',
      maxSlices: 8,
      reference: 'mockup',
    })

    expect(action).toEqual({
      type: 'plan-semantic-slices',
      brief: '政府官网',
      maxSlices: 8,
      reference: 'mockup',
    })
  })

  it('parses a semantic slice run action with crossed routes', () => {
    const action = parseAiNativeAction({
      type: 'run-semantic-slices',
      brief: '政府官网',
      maxSlices: 6,
      routes: ['text-to-image', 'image-to-image'],
      validate: true,
      artifactPrefix: 'gov',
    })

    expect(action.type).toBe('run-semantic-slices')
    if (action.type !== 'run-semantic-slices') return
    expect(action.routes).toEqual(['text-to-image', 'image-to-image'])
    expect(action.validate).toBe(true)
    expect(action.artifactPrefix).toBe('gov')
  })

  it('rejects unsupported semantic slice routes', () => {
    expect(() =>
      parseAiNativeAction({
        type: 'run-semantic-slices',
        routes: ['board-collage'],
      }),
    ).toThrow()
  })

  it.each([
    { type: 'set-param', key: 'threshold', value: 240 },
    { type: 'set-params', params: { minArea: 400 } },
    { type: 'reset-params' },
  ])('rejects removed manual parameter action $type', (action) => {
    expect(() => parseAiNativeAction(action)).toThrow()
  })

  it('does not expose internal cutout parameters in snapshots', () => {
    expect(createAiNativeSnapshot(getStoreState())).not.toHaveProperty('params')
  })

  it('exposes authoritative production state to external Agent snapshots', async () => {
    const plan = await compileAssetProductionPlan({
      sourceRevision: { projectRevisionId: 'revision:1', pageArtifacts: [] },
      items: [{
        manifestItemId: 'semantic:hero', pageId: 'semantic-brief', regionId: 'hero',
        route: 'semantic-repair',
      }],
      createdAt: 1,
    })
    getStoreState().setAssetProduction(beginAssetProduction({
      snapshot: getStoreState().assetProduction,
      plan,
      runId: 'semantic:run:1',
      at: 2,
    }))

    expect(createAiNativeSnapshot(getStoreState()).assetProduction).toEqual({
      revision: 2,
      activePlanId: plan.planId,
      activeRunId: 'semantic:run:1',
      run: expect.objectContaining({
        runId: 'semantic:run:1',
        planId: plan.planId,
        status: 'running',
        tasks: [expect.objectContaining({ status: 'queued' })],
      }),
    })
  })
})
