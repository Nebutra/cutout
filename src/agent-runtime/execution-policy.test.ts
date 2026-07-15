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
  it('routes planning to chat with high automatic thinking', () => {
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
      reasoningEffort: 'high',
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
    ).toEqual(['auto-route-chat', 'auto-thinking-high'])
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
})
