import { describe, expect, it } from 'vitest'
import type { ModelAssignments } from '@/services/ai/model-assignment-types'
import type { ProviderConfig } from '@/services/ai/provider-types'
import { routeExecutionPolicy } from './execution-policy'

const assignments: ModelAssignments = {
  chat: { providerId: 'anthropic', model: 'claude-sonnet' },
  image: { providerId: 'openai', model: 'gpt-image' },
}

const providers: readonly ProviderConfig[] = [
  {
    id: 'anthropic',
    kind: 'anthropic',
    label: 'Anthropic',
    defaultModel: 'claude-sonnet',
    enabled: true,
  },
  {
    id: 'openai',
    kind: 'openai',
    label: 'OpenAI',
    defaultModel: 'gpt-image',
    enabled: true,
  },
]

describe('routeExecutionPolicy', () => {
  const modelCatalog = [
    { providerId:'anthropic', model:'claude-sonnet', slot:'chat' as const, capabilities:['text','reasoning','tools'] as const, quality:.8, cost:.4, speed:.8, region:'global' as const },
    { providerId:'openai', model:'vision-dev', slot:'chat' as const, capabilities:['text','reasoning','vision','tools'] as const, quality:.9, cost:.7, speed:.6, region:'global' as const },
    { providerId:'openai', model:'gpt-image', slot:'image' as const, capabilities:['image-generation','image-edit'] as const, quality:.9, cost:.6, speed:.5, region:'global' as const },
  ]

  it('requires vision for multimodal and image-to-webdev tasks but only prefers it for plain webdev',()=>{
    const multimodal=routeExecutionPolicy({model:{mode:'auto'},thinking:'auto',task:{stage:'understand',multimodal:true,paidAction:'none'},assignments,providers,modelCatalog})
    expect(multimodal.assignment?.model).toBe('vision-dev');expect(multimodal.routeReceipt?.requiredCapabilities).toContain('vision')
    const imageToWebdev=routeExecutionPolicy({model:{mode:'auto'},thinking:'auto',task:{stage:'execute',multimodal:true,paidAction:'none',workload:'image-to-webdev'},assignments,providers,modelCatalog})
    expect(imageToWebdev.routeReceipt?.requiredCapabilities).toEqual(['text','tools','vision'])
    const webdev=routeExecutionPolicy({model:{mode:'auto'},thinking:'auto',task:{stage:'execute',multimodal:false,paidAction:'none',workload:'webdev'},assignments,providers,modelCatalog,routePreferences:{priority:'quality'}})
    expect(webdev.assignment?.model).toBe('vision-dev');expect(webdev.routeReceipt?.preferredCapabilities).toEqual(['vision'])
  })

  it('blocks with an auditable receipt when no model satisfies a required capability',()=>{
    const result=routeExecutionPolicy({model:{mode:'auto'},thinking:'auto',task:{stage:'understand',multimodal:true,paidAction:'none'},assignments,providers,modelCatalog:modelCatalog.filter(model=>!model.capabilities.some(capability=>capability==='vision'))})
    expect(result.status).toBe('blocked');expect(result.routeReceipt).toMatchObject({requiredCapabilities:['text','vision']});expect(result.routeReceipt?.selected).toBeUndefined();expect(result.routeReceipt?.candidates.every(candidate=>!candidate.eligible)).toBe(true)
  })
  it('keeps ordinary planning at medium automatic thinking', () => {
    expect(
      routeExecutionPolicy({
        model: { mode: 'auto' },
        thinking: 'auto',
        task: { stage: 'plan', multimodal: false, paidAction: 'none' },
        assignments,
        providers,
      }),
    ).toMatchObject({
      status: 'ready',
      slot: 'chat',
      assignment: assignments.chat,
      reasoningEffort: 'medium',
      requestedThinking: 'auto',
      thinkingSupport: 'supported',
      degradations: [],
    })
    expect(
      routeExecutionPolicy({
        model: { mode: 'auto' },
        thinking: 'auto',
        task: { stage: 'plan', multimodal: false, paidAction: 'none' },
        assignments,
        providers,
      }).rationaleCodes,
    ).toEqual(['auto-route-chat', 'auto-thinking-medium'])
  })

  it('raises effort only from explicit complexity, ambiguity, DAG, risk and retry signals', () => {
    const result = routeExecutionPolicy({ model: { mode: 'auto' }, thinking: 'auto', task: { stage: 'plan', multimodal: false, paidAction: 'none', effortSignals: { complexity: .9, ambiguity: .8, dagDepth: 9, risk: 'high', retryCount: 1, budgetPressure: .1 } }, assignments, providers })
    expect(result.reasoningEffort).toBe('high')
    expect(result.effortReceipt).toMatchObject({ protocol: 'cutout.effort-decision.v1', selected: 'high', manualOverride: false })
    expect(result.effortReceipt?.score).toBeGreaterThanOrEqual(.68)
  })

  it('keeps a manual effort override separate from model binding', () => {
    const result = routeExecutionPolicy({ model: { mode: 'fixed', slot: 'chat', assignment: assignments.chat! }, thinking: 'low', task: { stage: 'review', multimodal: false, paidAction: 'none', effortSignals: { complexity: 1, ambiguity: 1, dagDepth: 20, risk: 'high', retryCount: 3 } }, assignments, providers })
    expect(result.assignment).toEqual(assignments.chat)
    expect(result.reasoningEffort).toBe('low')
    expect(result.effortReceipt).toMatchObject({ selected: 'low', manualOverride: true })
  })

  it('uses verified compatible reasoning protocol evidence and rejects undeclared compatible thinking', () => {
    const mox = { id: 'mox', kind: 'openai-compatible', label: 'MOX', defaultModel: 'gpt-5.5', enabled: true }
    const verified = routeExecutionPolicy({ model: { mode: 'auto' }, thinking: 'auto', task: { stage: 'plan', multimodal: false, paidAction: 'none' }, assignments: { chat: { providerId: 'mox', model: 'gpt-5.5' } }, providers: [mox], modelCatalog: [{ providerId: 'mox', model: 'gpt-5.5', slot: 'chat', capabilities: ['text', 'reasoning'], reasoningProtocol: 'openai', quality: .9, cost: .5, speed: .7, region: 'global', available: true }] })
    expect(verified).toMatchObject({ status: 'ready', reasoningEffort: 'medium', assignment: { providerId: 'mox', model: 'gpt-5.5', reasoningProtocol: 'openai' } })
    expect(verified.routeReceipt?.effort).toMatchObject({ selected: 'medium', manualOverride: false })
    const undeclared = routeExecutionPolicy({ model: { mode: 'fixed', slot: 'chat', assignment: { providerId: 'mox', model: 'gpt-5.5' } }, thinking: 'auto', task: { stage: 'plan', multimodal: false, paidAction: 'none' }, assignments: {}, providers: [mox] })
    expect(undeclared).toMatchObject({ status: 'degraded', thinkingSupport: 'unsupported', reasoningEffort: undefined })
  })

  it('keeps multimodal understanding on the vision-capable chat slot', () => {
    expect(
      routeExecutionPolicy({
        model: { mode: 'auto' },
        thinking: 'auto',
        task: { stage: 'understand', multimodal: true, paidAction: 'none' },
        assignments,
        providers,
      }),
    ).toMatchObject({ slot: 'chat', reasoningEffort: 'medium' })
  })

  it('routes image generation and image editing paid actions to the image slot', () => {
    for (const paidAction of ['image-generation', 'image-edit'] as const) {
      const result = routeExecutionPolicy({
        model: { mode: 'auto' },
        thinking: 'high',
        task: { stage: 'execute', multimodal: paidAction === 'image-edit', paidAction },
        assignments,
        providers,
      })

      expect(result).toMatchObject({
        status: 'degraded',
        slot: 'image',
        assignment: assignments.image,
        reasoningEffort: undefined,
      })
      expect(result.degradations).toContain('thinking-not-applicable-to-image')
    }
  })

  it('honours a fixed assignment when its slot supports the task', () => {
    const result = routeExecutionPolicy({
      model: { mode: 'fixed', slot: 'chat', assignment: assignments.chat! },
      thinking: 'low',
      task: { stage: 'name', multimodal: true, paidAction: 'none' },
      assignments,
      providers,
    })

    expect(result).toMatchObject({
      status: 'ready',
      slot: 'chat',
      assignment: assignments.chat,
      reasoningEffort: 'low',
    })
  })

  it('falls back to the compatible auto slot for an incompatible fixed assignment', () => {
    const result = routeExecutionPolicy({
      model: { mode: 'fixed', slot: 'chat', assignment: assignments.chat! },
      thinking: 'auto',
      task: {
        stage: 'execute',
        multimodal: false,
        paidAction: 'image-generation',
      },
      assignments,
      providers,
    })

    expect(result).toMatchObject({
      status: 'degraded',
      slot: 'image',
      assignment: assignments.image,
    })
    expect(result.degradations).toContain('fixed-model-incompatible')
  })

  it('does not fabricate thinking support for gateways', () => {
    const gatewayAssignment = {
      providerId: 'gateway',
      model: 'anthropic/claude-sonnet',
    }
    const result = routeExecutionPolicy({
      model: { mode: 'fixed', slot: 'chat', assignment: gatewayAssignment },
      thinking: 'high',
      task: { stage: 'plan', multimodal: false, paidAction: 'none' },
      assignments,
      providers: [
        ...providers,
        {
          id: 'gateway',
          kind: 'gateway',
          label: 'Gateway',
          defaultModel: 'anthropic/claude-sonnet',
          enabled: true,
        },
      ],
    })

    expect(result).toMatchObject({
      status: 'degraded',
      reasoningEffort: undefined,
      thinkingSupport: 'unsupported',
    })
    expect(result.degradations).toContain('thinking-provider-unsupported')
  })

  it('keeps provider-default distinct from router-selected automatic thinking', () => {
    const result = routeExecutionPolicy({
      model: { mode: 'auto' },
      thinking: 'provider-default',
      task: { stage: 'plan', multimodal: false, paidAction: 'none' },
      assignments,
      providers,
    })

    expect(result).toMatchObject({
      status: 'ready',
      requestedThinking: 'provider-default',
      reasoningEffort: undefined,
      thinkingSupport: 'supported',
    })
    expect(result.rationaleCodes).toEqual([
      'auto-route-chat',
      'provider-default-thinking',
    ])
  })

  it('blocks when the required assignment is missing', () => {
    const result = routeExecutionPolicy({
      model: { mode: 'auto' },
      thinking: 'auto',
      task: {
        stage: 'execute',
        multimodal: false,
        paidAction: 'image-generation',
      },
      assignments: { chat: assignments.chat },
      providers,
    })

    expect(result).toMatchObject({
      status: 'blocked',
      slot: 'image',
      assignment: undefined,
      reasoningEffort: undefined,
    })
    expect(result.degradations).toContain('assignment-missing')
  })

  it('blocks disabled or unknown providers instead of pretending they work', () => {
    const result = routeExecutionPolicy({
      model: { mode: 'auto' },
      thinking: 'medium',
      task: { stage: 'plan', multimodal: false, paidAction: 'none' },
      assignments,
      providers: providers.map((provider) =>
        provider.id === 'anthropic' ? { ...provider, enabled: false } : provider,
      ),
    })

    expect(result.status).toBe('blocked')
    expect(result.degradations).toContain('provider-unavailable')
  })

  it('reports provider-unavailable, not assignment-missing, when a configured slot loses every catalog candidate', () => {
    const result = routeExecutionPolicy({
      model: { mode: 'auto' },
      thinking: 'auto',
      task: { stage: 'plan', multimodal: false, paidAction: 'none' },
      assignments,
      providers,
      modelCatalog: modelCatalog.map((descriptor) => ({ ...descriptor, available: false })),
    })

    expect(result.status).toBe('blocked')
    expect(result.degradations).toContain('provider-unavailable')
    expect(result.degradations).not.toContain('assignment-missing')
    expect(result.assignment).toEqual(assignments.chat)
  })
})
