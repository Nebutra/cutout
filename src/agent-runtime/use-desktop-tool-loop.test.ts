import { describe, expect, it } from 'vitest'
import { createExplicitDesktopPaidToolRequest, createExplicitDesktopVisualBudget } from './use-desktop-tool-loop'

describe('desktop paid tool request', () => {
  it('requires explicit approval and uses the matching host estimate as its ceiling', () => {
    const request = createExplicitDesktopPaidToolRequest({
      capability: 'generate-image',
      intent: 'Generate the approved hero',
      image: { providerId: 'provider', model: 'image-model' },
      capabilities: [
        { capability: 'generate-image', providerId: 'other', model: 'image-model', available: true, estimatedCost: { currency: 'USD', amount: 2 } },
        { capability: 'generate-image', providerId: 'provider', model: 'image-model', available: true, estimatedCost: { currency: 'USD', amount: 0.08, credits: 8 } },
      ],
    })

    expect(request).toMatchObject({
      approvalPolicy: 'explicit',
      budgetCeiling: { currency: 'USD', amount: 0.08, credits: 8 },
    })
  })

  it('fails closed with a zero ceiling when the selected host capability is unavailable', () => {
    const request = createExplicitDesktopPaidToolRequest({
      capability: 'edit-image',
      intent: 'Edit the approved image',
      image: { providerId: 'provider', model: 'missing-model' },
      capabilities: [],
    })

    expect(request).toMatchObject({
      approvalPolicy: 'explicit',
      budgetCeiling: { currency: 'USD', amount: 0 },
    })
  })

  it('derives the visual task ceiling from both routed paid capabilities', () => {
    expect(createExplicitDesktopVisualBudget([
      { capability: 'generate-image', providerId: 'provider', model: 'image-model', available: true, estimatedCost: { currency: 'USD', amount: 0.08, credits: 8 } },
      { capability: 'edit-image', providerId: 'provider', model: 'image-model', available: true, estimatedCost: { currency: 'USD', amount: 0.12, credits: 12 } },
    ])).toEqual({ ceiling: { currency: 'USD', amount: 0.2, credits: 20 } })
  })

  it('fails the visual task budget closed when either routed capability is missing', () => {
    expect(createExplicitDesktopVisualBudget([
      { capability: 'generate-image', providerId: 'provider', model: 'image-model', available: true, estimatedCost: { currency: 'USD', amount: 0.08 } },
    ])).toEqual({ ceiling: { currency: 'USD', amount: 0 } })
  })
})
