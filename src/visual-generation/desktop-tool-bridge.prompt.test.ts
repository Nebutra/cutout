import { describe, expect, it, vi } from 'vitest'
import type { DesktopToolLoop } from '@/agent-runtime/desktop-tool-loop'
import { createDesktopVisualToolInvoker } from './desktop-tool-bridge'

describe('desktop visual tool prompt contract', () => {
  it('keeps a long execution prompt separate from the bounded audit intent', async () => {
    const request = vi.fn(async () => undefined)
    const prompt = 'Complete prototype rendering context. '.repeat(800)
    const loop: DesktopToolLoop = {
      request,
      settled: vi.fn(async () => ({
        ok: true as const,
        receipt: {
          receiptId: 'receipt:1',
          requestId: 'request:1',
          capability: 'generate-image' as const,
          providerId: 'provider:1',
          model: 'image-model',
          status: 'succeeded' as const,
          charged: { currency: 'USD', amount: 0.1 },
          outputArtifactIds: ['artifact:out'],
          startedAt: 1,
          completedAt: 2,
        },
        events: [],
      })),
      approve: vi.fn(),
      deny: vi.fn(),
      cancel: vi.fn(),
      retry: vi.fn(),
    }
    const invoker = createDesktopVisualToolInvoker({
      loop,
      expectedRevision: () => 1,
      estimateFor: () => ({ currency: 'USD', amount: 0.1 }),
      resolveArtifact: vi.fn(async () => ({
        artifactId: 'artifact:out',
        sha256: 'a'.repeat(64),
        mediaType: 'image/png',
        provenanceId: 'provenance:out',
      })),
    })

    expect(prompt.length).toBeGreaterThan(20_000)
    await invoker.invoke({
      runId: 'run:1',
      taskId: 'task:1',
      nodeId: 'generate:1',
      requestId: 'request:1',
      capability: 'generate-image',
      preferredModel: 'image-model',
      allowCompatibleFallback: true,
      requiredCapabilities: ['image-generate'],
      prompt,
      inputArtifactIds: [],
      references: [],
      budgetCeiling: { currency: 'USD', amount: 1 },
      approvalPolicy: 'auto-within-budget',
    })

    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      request: expect.objectContaining({
        intent: 'Generate visual for task:1 (generate:1)',
        prompt,
        approvalPolicy: 'explicit',
      }),
    }))
  })
})
