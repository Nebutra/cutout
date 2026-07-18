import { describe, expect, it } from 'vitest'
import { composerRouteToPaidToolRequest, desktopPaidToolCapabilities, paidToolExecutionPrompt, paidToolPromptMaxLength, paidToolReceiptSchema, paidToolRequestSchema, planPaidTool } from './paid-tool-contract'

const request = paidToolRequestSchema.parse({
  capability: 'generate-image', intent: 'Create the approved hero visual', inputArtifactIds: [],
  budgetCeiling: { currency: 'USD', amount: 0.25, credits: 2 }, approvalPolicy: 'auto-within-budget',
})
const capability = {
  capability: 'generate-image' as const, providerId: 'provider-1', model: 'image-model', available: true,
  estimatedCost: { currency: 'USD', amount: 0.12, credits: 1 },
}

describe('paid tool planning', () => {
  it('allows outcome-driven auto execution only inside the host policy and request budget', () => {
    expect(planPaidTool(request, capability, { allowPaid: true }, false)).toMatchObject({ status: 'ready', executable: true })
    expect(planPaidTool(request, { ...capability, estimatedCost: { currency: 'USD', amount: 0.3 } }, { allowPaid: true }, false))
      .toMatchObject({ status: 'budget-exceeded', executable: false })
    expect(planPaidTool(request, capability, { allowPaid: false }, false))
      .toMatchObject({ status: 'authorization-required', executable: false })
  })

  it('keeps explicit approval distinct from auto-within-budget', () => {
    const explicit = { ...request, approvalPolicy: 'explicit' as const }
    expect(planPaidTool(explicit, capability, { allowPaid: true }, false).status).toBe('authorization-required')
    expect(planPaidTool(explicit, capability, { allowPaid: true }, true).status).toBe('ready')
  })

  it('does not claim success without an executor capability', () => {
    expect(planPaidTool(request, undefined, { allowPaid: true }, true)).toMatchObject({
      status: 'capability-required', executable: false,
    })
  })
})

describe('paid tool boundaries', () => {
  it('keeps audit intent bounded while carrying a larger execution prompt', () => {
    const prompt = 'visual context '.repeat(2_000)
    expect(prompt.length).toBeGreaterThan(20_000)

    const parsed = paidToolRequestSchema.parse({ ...request, prompt })
    expect(parsed.intent).toBe('Create the approved hero visual')
    expect(paidToolExecutionPrompt(parsed)).toBe(prompt)
    expect(paidToolExecutionPrompt(request)).toBe(request.intent)
    expect(() => paidToolRequestSchema.parse({ ...request, prompt: 'x'.repeat(paidToolPromptMaxLength + 1) })).toThrow()
  })

  it('rejects credentials in requests and receipts', () => {
    expect(() => paidToolRequestSchema.parse({ ...request, intent: 'use Bearer secret-token' })).toThrow('Credential-shaped')
    expect(() => paidToolRequestSchema.parse({ ...request, prompt: 'use Bearer secret-token' })).toThrow('Credential-shaped')
    expect(() => paidToolReceiptSchema.parse({
      receiptId: 'receipt-1', requestId: 'request-1', capability: 'generate-image', providerId: 'provider-1',
      model: 'sk-secret-model-value', status: 'succeeded', charged: { currency: 'USD', amount: 0.1 },
      outputArtifactIds: [], startedAt: 1, completedAt: 2,
    })).toThrow('Credential-shaped')
  })

  it('maps desktop assignments to a non-secret shared capability declaration', () => {
    expect(desktopPaidToolCapabilities(
      [{ id: 'provider-1', kind: 'openai', label: 'OpenAI', defaultModel: 'chat', enabled: true }],
      { image: { providerId: 'provider-1', model: 'image-model' } },
      { 'generate-image': { currency: 'USD', amount: 0.1 } },
    )).toEqual([
      expect.objectContaining({ capability: 'generate-image', providerId: 'provider-1', model: 'image-model', estimatedCost: { currency: 'USD', amount: 0.1 } }),
      expect.objectContaining({ capability: 'edit-image', providerId: 'provider-1', model: 'image-model' }),
    ])
  })

  it('maps the locked composer image route into the shared request contract', () => {
    const prompt = 'Full generated repair context. '.repeat(1_000)
    expect(prompt.length).toBeGreaterThan(20_000)
    const mapped = composerRouteToPaidToolRequest({
      capability: 'edit-image', intent: 'Repair the selected hero material',
      prompt,
      image: { providerId: 'provider-1', model: 'image-model' }, inputArtifactIds: ['material:hero'],
      budgetCeiling: { currency: 'USD', amount: 0.2 },
    })
    expect(mapped).toEqual({
      capability: 'edit-image', providerId: 'provider-1', model: 'image-model',
      intent: 'Repair the selected hero material', prompt, inputArtifactIds: ['material:hero'],
      budgetCeiling: { currency: 'USD', amount: 0.2 }, approvalPolicy: 'auto-within-budget',
    })
  })
})
