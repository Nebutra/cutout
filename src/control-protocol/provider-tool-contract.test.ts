import { describe, expect, it } from 'vitest'
import { composerRouteToProviderToolRequest, desktopProviderToolCapabilities, providerToolExecutionPrompt, providerToolPromptMaxLength, providerToolReceiptSchema, providerToolRequestSchema, planProviderTool } from './provider-tool-contract'

const request = providerToolRequestSchema.parse({
  capability: 'generate-image', intent: 'Create the approved hero visual', prompt: 'Render the approved hero visual.', inputArtifactIds: [], approvalPolicy: 'auto',
})
const capability = {
  capability: 'generate-image' as const, providerId: 'provider-1', model: 'image-model', available: true,
}

describe('Provider tool planning', () => {
  it('allows outcome-driven execution only when Host policy permits the Provider', () => {
    expect(planProviderTool(request, capability, { allowProviderExecution: true }, false)).toMatchObject({ status: 'ready', executable: true })
    expect(planProviderTool(request, capability, { allowProviderExecution: false }, false))
      .toMatchObject({ status: 'authorization-required', executable: false })
  })

  it('keeps explicit approval distinct from auto', () => {
    const explicit = { ...request, approvalPolicy: 'explicit' as const }
    expect(planProviderTool(explicit, capability, { allowProviderExecution: true }, false).status).toBe('authorization-required')
    expect(planProviderTool(explicit, capability, { allowProviderExecution: true }, true).status).toBe('ready')
  })

  it('does not claim success without an executor capability', () => {
    expect(planProviderTool(request, undefined, { allowProviderExecution: true }, true)).toMatchObject({
      status: 'capability-required', executable: false,
    })
  })
})

describe('Provider tool boundaries', () => {
  it('keeps audit intent bounded while carrying a larger execution prompt', () => {
    const prompt = 'visual context '.repeat(2_000)
    expect(prompt.length).toBeGreaterThan(20_000)

    const parsed = providerToolRequestSchema.parse({ ...request, prompt })
    expect(parsed.intent).toBe('Create the approved hero visual')
    expect(providerToolExecutionPrompt(parsed)).toBe(prompt)
    expect(() => providerToolRequestSchema.parse({ ...request, prompt: undefined })).toThrow()
    expect(() => providerToolRequestSchema.parse({ ...request, prompt: 'x'.repeat(providerToolPromptMaxLength + 1) })).toThrow()
  })

  it('rejects credentials in requests and receipts', () => {
    expect(() => providerToolRequestSchema.parse({ ...request, intent: 'use Bearer secret-token' })).toThrow('Credential-shaped')
    expect(() => providerToolRequestSchema.parse({ ...request, prompt: 'use Bearer secret-token' })).toThrow('Credential-shaped')
    expect(() => providerToolReceiptSchema.parse({
      receiptId: 'receipt-1', requestId: 'request-1', capability: 'generate-image', providerId: 'provider-1',
      model: 'sk-secret-model-value', status: 'succeeded',
      outputArtifactIds: [], startedAt: 1, completedAt: 2,
    })).toThrow('Credential-shaped')
  })

  it('rejects financial fields in Provider receipts', () => {
    const receipt = {
      receiptId: 'receipt-1', requestId: 'request-1', capability: 'generate-image',
      providerId: 'provider-1', model: 'image-model', status: 'succeeded',
      outputArtifactIds: [], startedAt: 1, completedAt: 2,
    }
    for (const field of ['price', 'charge', 'credit', 'billing'] as const) {
      expect(() => providerToolReceiptSchema.parse({ ...receipt, [field]: 'forbidden' })).toThrow()
    }
  })

  it('maps desktop assignments to a non-secret shared capability declaration', () => {
    const assignment = { providerId: 'provider-1', model: 'image-model' }
    expect(desktopProviderToolCapabilities(
      [{ id: 'provider-1', kind: 'openai', label: 'OpenAI', wireProtocol: 'responses', defaultModel: 'chat', enabled: true }],
      { image: assignment },
      {
        descriptors: [{
          providerId: 'provider-1',
          model: 'image-model',
          capabilities: ['image-generation', 'image-edit'],
          source: 'verified-catalog',
          evidence: [
            { capability: 'image-generation', kind: 'verified', sourceId: 'test' },
            { capability: 'image-edit', kind: 'verified', sourceId: 'test' },
          ],
        }],
      },
    )).toEqual([
      expect.objectContaining({ capability: 'generate-image', providerId: 'provider-1', model: 'image-model', }),
      expect.objectContaining({ capability: 'edit-image', providerId: 'provider-1', model: 'image-model' }),
    ])
  })

  it('advertises no image capability without exact model evidence', () => {
    expect(desktopProviderToolCapabilities(
      [{ id: 'provider-1', kind: 'openai', label: 'OpenAI', wireProtocol: 'responses', defaultModel: 'chat', enabled: true }],
      { image: { providerId: 'provider-1', model: 'image-model' } },
    )).toEqual([])
  })

  it('advertises independently bound generation and edit routes', () => {
    const generation = { providerId: 'provider-1', model: 'generation-model' }
    const edit = { providerId: 'provider-2', model: 'edit-model' }
    expect(desktopProviderToolCapabilities(
      [
        { id: 'provider-1', kind: 'openai', label: 'OpenAI A', wireProtocol: 'responses', defaultModel: 'chat', enabled: true },
        { id: 'provider-2', kind: 'openai-compatible', label: 'OpenAI B', baseUrl: 'https://relay.example/v1', wireProtocol: 'chat-completions', defaultModel: 'chat', enabled: true },
      ],
      { image: generation },
      {
        bindings: { 'image-generation': generation, 'image-edit': edit },
        descriptors: [
          {
            ...generation,
            capabilities: ['image-generation'],
            source: 'verified-catalog',
            evidence: [{ capability: 'image-generation', kind: 'verified', sourceId: 'test' }],
          },
          {
            ...edit,
            capabilities: ['image-edit'],
            source: 'verified-catalog',
            evidence: [{ capability: 'image-edit', kind: 'observed', sourceId: 'test' }],
          },
        ],
      },
    )).toEqual([
      expect.objectContaining({
        capability: 'generate-image',
        providerId: 'provider-1',
        model: 'generation-model',
      }),
      expect.objectContaining({
        capability: 'edit-image',
        providerId: 'provider-2',
        model: 'edit-model',
      }),
    ])
  })

  it('maps the locked composer image route into the shared request contract', () => {
    const prompt = 'Full generated repair context. '.repeat(1_000)
    expect(prompt.length).toBeGreaterThan(20_000)
    const mapped = composerRouteToProviderToolRequest({
      capability: 'edit-image', intent: 'Repair the selected hero material',
      prompt,
      image: { providerId: 'provider-1', model: 'image-model' }, inputArtifactIds: ['material:hero'],
    })
    expect(mapped).toEqual({
      capability: 'edit-image', providerId: 'provider-1', model: 'image-model',
      intent: 'Repair the selected hero material', prompt, inputArtifactIds: ['material:hero'], approvalPolicy: 'auto',
    })
  })
})
