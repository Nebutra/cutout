import { describe, expect, it, vi } from 'vitest'
import { paidToolRequestSchema, type PaidToolExecutorCapability } from '@/control-protocol/paid-tool-contract'
import { createDesktopToolExecutor, type DesktopToolArtifactStore } from './desktop-tool-executor'
import type { ServiceRegistry } from './types'
import { PermissionBroker } from '@/tool-sandbox/broker'

const imageCapability: PaidToolExecutorCapability = {
  capability: 'generate-image', providerId: 'provider-1', model: 'image-1', available: true,
  estimatedCost: { currency: 'USD', amount: 0.1, credits: 1 },
}

function request(capability: 'generate-image' | 'edit-image' | 'cutout' = 'generate-image') {
  return paidToolRequestSchema.parse({
    capability,
    ...(capability === 'cutout' ? { providerId: 'local', model: 'cutout-v1' } : { providerId: 'provider-1', model: 'image-1' }),
    intent: 'Create the approved visual',
    inputArtifactIds: capability === 'generate-image' ? [] : ['artifact:input'],
    budgetCeiling: { currency: 'USD', amount: 0.2, credits: 2 },
    approvalPolicy: 'auto-within-budget',
  })
}

function harness(overrides: {
  capability?: PaidToolExecutorCapability
  revision?: () => number
  aborted?: AbortSignal
  hasKey?: boolean
  generate?: () => Promise<{ ok: true; data: { mediaType: string; bytes: Uint8Array }[] } | { ok: false; error: string }>
  sink?: (input: unknown) => void | Promise<void>
  writeBatch?: (inputs: readonly unknown[]) => Promise<readonly string[]>
  permissionBroker?: PermissionBroker
} = {}) {
  const written: string[] = []
  const artifacts: DesktopToolArtifactStore = {
    read: vi.fn(async () => ({ id: 'artifact:input', mediaType: 'image/png', bytes: new Uint8Array([7]) })),
    write: vi.fn(async ({ source }) => {
      const id = `artifact:${source}:${written.length + 1}`
      written.push(id)
      return id
    }),
    ...(overrides.writeBatch ? { writeBatch: overrides.writeBatch } : {}),
  }
  const generation = {
    generateImages: vi.fn(overrides.generate ?? (async () => ({ ok: true as const, data: [{ mediaType: 'image/png', bytes: new Uint8Array([1, 2]) }] }))),
    editImage: vi.fn(async () => ({ ok: true as const, data: [{ mediaType: 'image/png', bytes: new Uint8Array([3]) }] })),
  }
  const services = {
    providers: {
      list: vi.fn(async () => [{ id: 'provider-1', kind: 'openai' as const, label: 'OpenAI', defaultModel: 'image-1', enabled: true }]),
      status: vi.fn(async () => ({ hasKey: overrides.hasKey ?? true })),
    },
    generation,
    cutout: { run: vi.fn(async () => ({ ok: true as const, data: { slices: [{ id: 'slice-1', index: 0, box: { x: 0, y: 0, width: 1, height: 1 }, png: new Blob([new Uint8Array([9])]), width: 1, height: 1 }] } })) },
  } as unknown as Pick<ServiceRegistry, 'providers' | 'generation' | 'cutout'>
  const executor = createDesktopToolExecutor({
    services, artifacts,
    capabilities: async () => [overrides.capability ?? imageCapability],
    currentRevision: overrides.revision ?? (() => 4),
    now: (() => { let value = 100; return () => value++ })(),
    id: (() => { let value = 0; return () => `receipt-${++value}` })(),
    decodeBitmap: vi.fn(async () => ({}) as ImageBitmap),
    cutoutResultSink: overrides.sink ? { commit: overrides.sink } : undefined,
    permissionBroker: overrides.permissionBroker,
  })
  return { executor, artifacts, generation, services, written }
}

function execution(tool = request(), overrides: { approvalGranted?: boolean; expectedRevision?: number; signal?: AbortSignal; capabilityLeaseId?: string; requestDigest?: string } = {}) {
  return {
    requestId: 'request-1', runId: 'run-1', toolCallId: 'tool-1', label: 'Hero visual',
    expectedRevision: overrides.expectedRevision ?? 4, request: tool,
    approvalGranted: overrides.approvalGranted ?? false, policy: { allowPaid: true }, signal: overrides.signal,
    capabilityLeaseId: overrides.capabilityLeaseId, requestDigest: overrides.requestDigest,
  }
}

describe('desktop paid tool executor', () => {
  it('requires and consumes a request-bound capability lease before provider access', async () => {
    const digest = 'b'.repeat(64)
    const broker = new PermissionBroker({
      now: () => 11,
      id: () => 'desktop-receipt',
      capabilities: { canonicalWorkspaceRoot: true, symlinkBoundary: true, commandAllowlist: true, environmentAllowlist: true, wallClockTimeout: true, byteLimit: true, processTreeCancellation: 'supported', cpuLimit: 'capability-required', networkIsolation: 'capability-required' },
    })
    broker.issue({ version: 'cutout.capability-lease.v1', leaseId: 'lease:desktop', approvalId: 'approval:desktop', subject: 'run-1', requestDigest: digest, scopes: ['paid', 'credential'], workspaceRoot: '/workspace', allowedPaths: [], allowedCommands: [], allowedHosts: [], limits: { maxDurationMs: 1_000, maxBytes: 1_000, maxProcesses: 1 }, issuedAt: 10, expiresAt: 20 })

    const secured = harness({ permissionBroker: broker })
    const missing = await secured.executor.execute(execution())
    expect(missing).toMatchObject({ ok: false, error: expect.stringContaining('capability lease') })
    expect(secured.services.providers.list).not.toHaveBeenCalled()
    expect(secured.generation.generateImages).not.toHaveBeenCalled()

    const allowed = await secured.executor.execute(execution(request(), { capabilityLeaseId: 'lease:desktop', requestDigest: digest }))
    expect(allowed.ok).toBe(true)
    expect(secured.generation.generateImages).toHaveBeenCalledTimes(1)

    broker.revoke('lease:desktop')
    const revoked = await secured.executor.execute(execution(request(), { capabilityLeaseId: 'lease:desktop', requestDigest: digest }))
    expect(revoked).toMatchObject({ ok: false, error: expect.stringContaining('revoked') })
    expect(secured.generation.generateImages).toHaveBeenCalledTimes(1)
  })

  it('reuses the configured generation service and publishes receipt plus material evidence', async () => {
    const { executor, generation, artifacts } = harness()
    const result = await executor.execute(execution())

    expect(result.ok).toBe(true)
    expect(generation.generateImages).toHaveBeenCalledWith(expect.objectContaining({ providerId: 'provider-1', model: 'image-1', prompt: 'Create the approved visual' }))
    expect(artifacts.write).toHaveBeenCalledTimes(1)
    expect(result.events.map((event) => event.type)).toEqual(['tool-started', 'tool-succeeded', 'material-recorded'])
    expect(result.receipt).toMatchObject({ status: 'succeeded', charged: { currency: 'USD', amount: 0.1, credits: 1 }, outputArtifactIds: ['artifact:generate-image:1'] })
    expect(JSON.stringify(result)).not.toContain('secret')
  })

  it('rejects missing key, over-budget, stale revision and explicit approval before calling a provider', async () => {
    const missingKey = harness({ hasKey: false })
    expect((await missingKey.executor.execute(execution())).ok).toBe(false)
    expect(missingKey.generation.generateImages).not.toHaveBeenCalled()

    const overBudget = harness()
    const low = { ...request(), budgetCeiling: { currency: 'USD', amount: 0.01 } }
    expect((await overBudget.executor.execute(execution(low))).ok).toBe(false)
    expect(overBudget.generation.generateImages).not.toHaveBeenCalled()

    const stale = harness()
    expect((await stale.executor.execute(execution(request(), { expectedRevision: 3 }))).ok).toBe(false)
    expect(stale.generation.generateImages).not.toHaveBeenCalled()

    const explicit = harness()
    expect((await explicit.executor.execute(execution({ ...request(), approvalPolicy: 'explicit' }))).ok).toBe(false)
    expect(explicit.generation.generateImages).not.toHaveBeenCalled()
  })

  it('does not publish or claim success when cancelled or when the revision changes in flight', async () => {
    const controller = new AbortController()
    const cancelled = harness({ generate: async () => { controller.abort(); return { ok: true, data: [{ mediaType: 'image/png', bytes: new Uint8Array([1]) }] } } })
    const cancelledResult = await cancelled.executor.execute(execution(request(), { signal: controller.signal }))
    expect(cancelledResult).toMatchObject({ ok: false, receipt: { status: 'cancelled' } })
    expect(cancelled.written).toEqual([])
    expect(cancelledResult.events.at(-1)?.type).toBe('tool-cancelled')

    let revision = 4
    const changed = harness({ revision: () => revision, generate: async () => { revision = 5; return { ok: true, data: [{ mediaType: 'image/png', bytes: new Uint8Array([1]) }] } } })
    const changedResult = await changed.executor.execute(execution())
    expect(changedResult.ok).toBe(false)
    expect(changed.written).toEqual([])
    expect(changedResult.events.at(-1)?.type).toBe('tool-failed')
  })

  it('routes edit and local cutout through the existing services without requiring a provider key for cutout', async () => {
    const edit = harness({ capability: { ...imageCapability, capability: 'edit-image' } })
    const editResult = await edit.executor.execute(execution(request('edit-image')))
    expect(editResult.ok).toBe(true)
    expect(edit.generation.editImage).toHaveBeenCalledWith(expect.objectContaining({ images: [new Uint8Array([7])] }))

    const cutoutCapability: PaidToolExecutorCapability = { capability: 'cutout', providerId: 'local', model: 'cutout-v1', available: true, estimatedCost: { currency: 'USD', amount: 0 } }
    const cutout = harness({ capability: cutoutCapability, hasKey: false })
    const cutoutResult = await cutout.executor.execute(execution(request('cutout')))
    expect(cutoutResult.ok).toBe(true)
    expect(cutout.services.providers.status).not.toHaveBeenCalled()
    expect(cutout.services.cutout.run).toHaveBeenCalledWith(expect.objectContaining({ params: { threshold: 246, minArea: 900, mergeGap: 18, padding: 10 } }))
    expect(cutoutResult.events.at(-1)).toMatchObject({ type: 'material-recorded', material: { kind: 'cutout-slice', source: 'algorithm' } })
  })

  it('publishes a cutout exactly once through the result sink after an atomic artifact batch', async () => {
    const sink = vi.fn()
    const writeBatch = vi.fn(async () => ['artifact:cutout:1'])
    const capability: PaidToolExecutorCapability = { capability: 'cutout', providerId: 'local', model: 'cutout-v1', available: true, estimatedCost: { currency: 'USD', amount: 0 } }
    const cutout = harness({ capability, sink, writeBatch })

    const result = await cutout.executor.execute(execution(request('cutout')))

    expect(result.ok).toBe(true)
    expect(cutout.services.cutout.run).toHaveBeenCalledTimes(1)
    expect(writeBatch).toHaveBeenCalledTimes(1)
    expect(sink).toHaveBeenCalledTimes(1)
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({
      outputArtifactIds: ['artifact:cutout:1'],
      slices: [expect.objectContaining({ id: 'slice-1' })],
    }))
  })

  it('does not publish cutout state when artifact commit fails', async () => {
    const sink = vi.fn()
    const capability: PaidToolExecutorCapability = { capability: 'cutout', providerId: 'local', model: 'cutout-v1', available: true, estimatedCost: { currency: 'USD', amount: 0 } }
    const cutout = harness({ capability, sink, writeBatch: vi.fn(async () => { throw new Error('atomic write failed') }) })

    const result = await cutout.executor.execute(execution(request('cutout')))

    expect(result).toMatchObject({ ok: false, error: 'atomic write failed' })
    expect(sink).not.toHaveBeenCalled()
  })

  it('does not publish a cutout after cancellation or a revision change during artifact preparation', async () => {
    const capability: PaidToolExecutorCapability = { capability: 'cutout', providerId: 'local', model: 'cutout-v1', available: true, estimatedCost: { currency: 'USD', amount: 0 } }
    const cancelledSink = vi.fn()
    const controller = new AbortController()
    const cancelled = harness({ capability, sink: cancelledSink, writeBatch: vi.fn(async () => { controller.abort(); return ['artifact:cutout:1'] }) })
    expect((await cancelled.executor.execute(execution(request('cutout'), { signal: controller.signal }))).ok).toBe(false)
    expect(cancelledSink).not.toHaveBeenCalled()

    let revision = 4
    const staleSink = vi.fn()
    const stale = harness({ capability, revision: () => revision, sink: staleSink, writeBatch: vi.fn(async () => { revision = 5; return ['artifact:cutout:1'] }) })
    expect((await stale.executor.execute(execution(request('cutout')))).ok).toBe(false)
    expect(staleSink).not.toHaveBeenCalled()
  })

  it('records provider failures as failures with no artifacts', async () => {
    const failed = harness({ generate: async () => ({ ok: false, error: 'provider unavailable' }) })
    const result = await failed.executor.execute(execution())
    expect(result).toMatchObject({ ok: false, error: 'provider unavailable', receipt: { status: 'failed' } })
    expect(failed.written).toEqual([])
    expect(result.events.map((event) => event.type)).toEqual(['tool-started', 'tool-failed'])
  })
})
