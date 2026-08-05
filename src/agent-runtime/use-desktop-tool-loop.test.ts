import { describe, expect, it, vi } from 'vitest'
import { ok, type ForegroundSegmentationService } from '@/services/types'
import {
  createExplicitDesktopPaidToolRequest,
  probeForegroundSegmentationCapability,
} from './use-desktop-tool-loop'

describe('desktop paid tool request', () => {
  it('requires explicit approval for the selected host route', () => {
    const request = createExplicitDesktopPaidToolRequest({
      capability: 'generate-image',
      intent: 'Generate the approved hero',
      prompt: 'Render the approved hero.',
      image: { providerId: 'provider', model: 'image-model' },
    })

    expect(request).toMatchObject({
      approvalPolicy: 'explicit',
    })
  })

  it('keeps explicit approval independent of pricing metadata', () => {
    const request = createExplicitDesktopPaidToolRequest({
      capability: 'edit-image',
      intent: 'Edit the approved image',
      prompt: 'Edit the approved image.',
      image: { providerId: 'provider', model: 'missing-model' },
    })

    expect(request).toMatchObject({
      approvalPolicy: 'explicit',
    })
  })

  it('fails malformed and rejected foreground capability probes closed', async () => {
    const malformed = {
      capabilities: vi.fn(async () => ok(null)),
    } as unknown as ForegroundSegmentationService
    const rejected = {
      capabilities: vi.fn(async () => {
        throw new Error('native capability probe failed')
      }),
    } as unknown as ForegroundSegmentationService

    await expect(probeForegroundSegmentationCapability(malformed)).resolves.toEqual({
      available: false,
      reason: 'capability-required: foreground segmentation is unavailable on this host.',
    })
    await expect(probeForegroundSegmentationCapability(rejected)).resolves.toEqual({
      available: false,
      reason: 'native capability probe failed',
    })
  })
})
