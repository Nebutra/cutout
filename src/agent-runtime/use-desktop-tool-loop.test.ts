import { describe, expect, it, vi } from 'vitest'
import { ok, type ForegroundSegmentationService } from '@/services/types'
import {
  createExplicitDesktopPaidToolRequest,
  desktopToolCapabilitiesForSnapshot,
  probeForegroundSegmentationCapability,
} from './use-desktop-tool-loop'
import { capabilityBindingsSchema } from '@/services/ai/model-capabilities'

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

  it('resolves paid image capabilities from one coherent fresh runtime snapshot', () => {
    const stale = desktopToolCapabilitiesForSnapshot({
      providers: [],
      assignments: {},
      capabilityBindings: capabilityBindingsSchema.parse({
        version: 'model-assignments.v2', bindings: {}, descriptors: [],
      }),
    })
    expect(stale).toEqual([])

    const assignment = { providerId: 'qwen', model: 'qwen-image-3.0' }
    const fresh = desktopToolCapabilitiesForSnapshot({
      providers: [{
        id: 'qwen',
        kind: 'dashscope',
        label: 'DashScope',
        wireProtocol: 'chat-completions',
        defaultModel: 'qwen-image-3.0',
        enabled: true,
      }],
      assignments: { image: assignment },
      capabilityBindings: capabilityBindingsSchema.parse({
        version: 'model-assignments.v2',
        bindings: {
          'image-generation': assignment,
          'image-edit': assignment,
        },
        descriptors: [{
          providerId: 'qwen',
          model: 'qwen-image-3.0',
          capabilities: ['image-generation', 'image-edit'],
          source: 'verified-catalog',
          evidence: [
            { capability: 'image-generation', kind: 'verified', sourceId: 'test' },
            { capability: 'image-edit', kind: 'verified', sourceId: 'test' },
          ],
        }],
      }),
    })
    expect(fresh).toEqual(expect.arrayContaining([
      expect.objectContaining({ capability: 'generate-image', providerId: 'qwen' }),
      expect.objectContaining({ capability: 'edit-image', providerId: 'qwen' }),
    ]))
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
