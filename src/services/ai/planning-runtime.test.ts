import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  createCodexPlanningGenerationService,
  interruptCodexSystemTurn,
  planningRuntimeEvidenceSchema,
  probeCodexSystemRuntime,
  resetCodexSystemConversation,
  runCodexSystemTurn,
  selectPlanningRuntime,
  steerCodexSystemTurn,
} from './planning-runtime'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
  Channel: class {
    onmessage = (_payload: unknown) => {}
  },
}))

const proven = planningRuntimeEvidenceSchema.parse({
  runtimeId: 'codex-system',
  installed: true,
  authenticated: true,
  authClass: 'chatgpt',
  capability: 'proven',
  execution: 'unproven',
  version: '0.200.0',
})

function turnResult(args: { input: { requestId: string; contextRevision: string } }, output: unknown) {
  return {
    output,
    receipt: {
      protocol: 'cutout.codex-execution.v1',
      runtimeId: 'codex-system',
      runtimeVersion: '0.200.0',
      bindingId: 'codex:binding',
      requestId: args.input.requestId,
      turnId: `turn.${args.input.requestId}`,
      contextRevision: args.input.contextRevision,
      contextDigest: 'a'.repeat(64),
      outputDigest: 'b'.repeat(64),
      completedAt: 1,
    },
  }
}

beforeEach(() => invokeMock.mockReset())

describe('planning runtime boundary', () => {
  it('prefers capability-proven Codex and otherwise uses a direct route', () => {
    const direct = { providerId: 'openai', model: 'gpt-5' }
    expect(selectPlanningRuntime({ codex: proven, direct })).toMatchObject({ runtimeId: 'codex-system' })
    expect(selectPlanningRuntime({ codex: { ...proven, capability: 'unsupported', reason: 'protocol-unsupported' }, direct }))
      .toEqual({ runtimeId: 'direct-provider', ...direct })
    expect(selectPlanningRuntime({ codex: { ...proven, execution: 'failed', lastFailure: 'upstream-unavailable' }, direct }))
      .toEqual({ runtimeId: 'direct-provider', ...direct })
    expect(selectPlanningRuntime({ codex: { ...proven, execution: 'stale' } })).toBeUndefined()
    expect(selectPlanningRuntime({
      codex: { ...proven, execution: 'failed', lastFailure: 'upstream-unavailable' },
      direct,
      retryCodex: true,
    })).toMatchObject({ runtimeId: 'codex-system' })
    expect(selectPlanningRuntime({ codex: { ...proven, authenticated: false, authClass: 'unauthenticated' } })).toBeUndefined()
  })

  it('rejects evidence that skips progressive readiness stages', () => {
    expect(planningRuntimeEvidenceSchema.safeParse({
      ...proven,
      installed: false,
    }).success).toBe(false)
    expect(planningRuntimeEvidenceSchema.safeParse({
      ...proven,
      authenticated: false,
      authClass: 'unknown',
    }).success).toBe(false)
    expect(planningRuntimeEvidenceSchema.safeParse({
      ...proven,
      capability: 'unsupported',
      execution: 'failed',
      reason: 'protocol-unsupported',
    }).success).toBe(false)
    expect(planningRuntimeEvidenceSchema.safeParse({
      ...proven,
      lastFailure: 'upstream-unavailable',
    }).success).toBe(false)
    expect(planningRuntimeEvidenceSchema.safeParse({
      ...proven,
      execution: 'failed',
    }).success).toBe(false)
    expect(planningRuntimeEvidenceSchema.safeParse({
      ...proven,
      execution: 'failed',
      lastFailure: 'upstream-unavailable',
    }).success).toBe(true)
  })

  it('accepts only sanitized native evidence', async () => {
    invokeMock.mockResolvedValueOnce({ ...proven, account: 'user@example.com' })
    await expect(probeCodexSystemRuntime()).rejects.toThrow()
  })

  it('decodes streamed events and the schema-bound terminal result', async () => {
    invokeMock.mockImplementationOnce((_command: string, args: {
      onEvent: { onmessage: (payload: unknown) => void }
    }) => {
      args.onEvent.onmessage({
        type: 'started',
        requestId: '00000000-0000-4000-8000-000000000001',
        turnId: 'turn.1',
        bindingId: 'codex:binding',
        contextDigest: 'a'.repeat(64),
      })
      args.onEvent.onmessage({
        type: 'retrying',
        requestId: '00000000-0000-4000-8000-000000000001',
        turnId: 'turn.1',
        attempt: 1,
        reason: 'response-stream-disconnected',
      })
      return Promise.resolve({
        output: { decision: 'continue' },
        receipt: {
          protocol: 'cutout.codex-execution.v1',
          runtimeId: 'codex-system',
          runtimeVersion: '0.200.0',
          bindingId: 'codex:binding',
          requestId: '00000000-0000-4000-8000-000000000001',
          turnId: 'turn.1',
          contextRevision: 'revision.1',
          contextDigest: 'a'.repeat(64),
          outputDigest: 'b'.repeat(64),
          completedAt: 1,
        },
      })
    })
    const events: unknown[] = []
    await expect(runCodexSystemTurn({
      requestId: '00000000-0000-4000-8000-000000000001',
      workspaceHandle: 'workspace.1',
      conversationId: 'conversation.1',
      contextRevision: 'revision.1',
      prompt: 'Plan this product.',
      context: { source: 'user' },
      outputSchema: { type: 'object' },
    }, { onEvent: (event) => events.push(event) })).resolves.toMatchObject({
      output: { decision: 'continue' },
    })
    expect(events).toHaveLength(2)
    expect(events[1]).toMatchObject({ type: 'retrying', attempt: 1 })
  })

  it('decodes only closed sanitized terminal failure reasons', async () => {
    invokeMock.mockImplementationOnce((_command: string, args: {
      onEvent: { onmessage: (payload: unknown) => void }
    }) => {
      args.onEvent.onmessage({
        type: 'failed',
        requestId: '00000000-0000-4000-8000-000000000004',
        turnId: 'turn.4',
        reason: 'upstream-unavailable',
      })
      return Promise.reject(new Error('planning runtime upstream is unavailable'))
    })
    const events: unknown[] = []
    await expect(runCodexSystemTurn({
      requestId: '00000000-0000-4000-8000-000000000004',
      workspaceHandle: 'workspace.1',
      conversationId: 'conversation.1',
      contextRevision: 'revision.1',
      prompt: 'Plan this product.',
      context: {},
      outputSchema: { type: 'object' },
    }, { onEvent: (event) => events.push(event) })).rejects.toThrow('upstream')
    expect(events).toEqual([expect.objectContaining({
      type: 'failed',
      reason: 'upstream-unavailable',
    })])
  })

  it('rejects unsanitized negotiated runtime versions in receipts', async () => {
    const receipt = {
      protocol: 'cutout.codex-execution.v1',
      runtimeId: 'codex-system',
      runtimeVersion: '0.200.0\nsecret',
      bindingId: 'codex:binding',
      requestId: '00000000-0000-4000-8000-000000000001',
      turnId: 'turn.1',
      contextRevision: 'revision.1',
      contextDigest: 'a'.repeat(64),
      outputDigest: 'b'.repeat(64),
      completedAt: 1,
    }
    invokeMock.mockResolvedValueOnce({ output: {}, receipt })
    await expect(runCodexSystemTurn({
      requestId: receipt.requestId,
      workspaceHandle: 'workspace.1',
      conversationId: 'conversation.1',
      contextRevision: 'revision.1',
      prompt: 'Plan this product.',
      context: {},
      outputSchema: { type: 'object' },
    })).rejects.toThrow()
  })

  it('propagates abort, steering and reset through only opaque ids', async () => {
    const controller = new AbortController()
    let rejectTurn!: (error: Error) => void
    invokeMock.mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectTurn = reject
    })).mockResolvedValueOnce(true)
    const pending = runCodexSystemTurn({
      requestId: '00000000-0000-4000-8000-000000000002',
      workspaceHandle: 'workspace.1',
      conversationId: 'conversation.1',
      contextRevision: 'revision.1',
      prompt: 'Plan this product.',
      context: {},
      outputSchema: { type: 'object' },
    }, { signal: controller.signal })
    controller.abort()
    rejectTurn(new Error('planning turn was interrupted'))
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(invokeMock).toHaveBeenCalledWith(
      'codex_system_turn_interrupt',
      { requestId: '00000000-0000-4000-8000-000000000002' },
    ))

    invokeMock.mockResolvedValueOnce(true)
    await expect(steerCodexSystemTurn(
      '00000000-0000-4000-8000-000000000003',
      'Use a denser route graph.',
    )).resolves.toBe(true)
    invokeMock.mockResolvedValueOnce(true)
    await expect(interruptCodexSystemTurn(
      '00000000-0000-4000-8000-000000000003',
    )).resolves.toBe(true)
    invokeMock.mockResolvedValueOnce(true)
    await expect(resetCodexSystemConversation(
      'workspace.1',
      'conversation.1',
    )).resolves.toBe(true)
  })

  it('serializes formal Planner stages through the one-active-turn native runtime', async () => {
    const resolvers: Array<() => void> = []
    let active = 0
    let maximumActive = 0
    invokeMock.mockImplementation((command: string, args: {
      input: { requestId: string; contextRevision: string }
    }) => {
      if (command !== 'codex_system_turn_start') return Promise.resolve(false)
      active += 1
      maximumActive = Math.max(maximumActive, active)
      return new Promise((resolve) => {
        resolvers.push(() => {
          active -= 1
          resolve(turnResult(args, { value: args.input.requestId }))
        })
      })
    })
    const service = createCodexPlanningGenerationService({
      workspaceHandle: 'workspace.1',
      conversationPrefix: 'conversation.planner',
      contextRevision: 'revision.1',
      prompts: { render: async () => ({ system: 'Plan the product.' }) },
    })
    const schema = z.object({ value: z.string() }).strict()
    const first = service.generateObject({ providerId: 'codex-system', prompt: 'First.' }, schema)
    const second = service.generateObject({ providerId: 'codex-system', prompt: 'Second.' }, schema)

    await vi.waitFor(() => expect(resolvers).toHaveLength(1))
    resolvers[0]!()
    await vi.waitFor(() => expect(resolvers).toHaveLength(2))
    resolvers[1]!()

    await expect(first).resolves.toMatchObject({ ok: true })
    await expect(second).resolves.toMatchObject({ ok: true })
    expect(maximumActive).toBe(1)
    const starts = invokeMock.mock.calls.filter(([command]) => command === 'codex_system_turn_start')
    expect(starts).toHaveLength(2)
    expect(starts.map(([, args]) => args.input.conversationId)).toEqual([
      'conversation.planner:1',
      'conversation.planner:2',
    ])
  })

  it('cancels a queued Planner stage without starting another native turn', async () => {
    let resolveFirst!: (value: unknown) => void
    invokeMock.mockImplementationOnce((command: string, args: {
      input: { requestId: string; contextRevision: string }
    }) => {
      expect(command).toBe('codex_system_turn_start')
      return new Promise((resolve) => {
        resolveFirst = (output) => resolve(turnResult(args, output))
      })
    })
    const service = createCodexPlanningGenerationService({
      workspaceHandle: 'workspace.1',
      conversationPrefix: 'conversation.planner',
      contextRevision: 'revision.1',
      prompts: { render: async () => ({ system: 'Plan the product.' }) },
    })
    const schema = z.object({ value: z.string() }).strict()
    const first = service.generateObject({ providerId: 'codex-system', prompt: 'First.' }, schema)
    const controller = new AbortController()
    const queued = service.generateObject({
      providerId: 'codex-system',
      prompt: 'Second.',
      signal: controller.signal,
    }, schema)
    controller.abort()

    await expect(queued).resolves.toEqual({
      ok: false,
      error: 'AbortError: operation aborted',
    })
    expect(invokeMock).toHaveBeenCalledTimes(1)
    resolveFirst({ value: 'done' })
    await expect(first).resolves.toEqual({ ok: true, data: { value: 'done' } })
    expect(invokeMock.mock.calls.filter(([command]) =>
      command === 'codex_system_turn_start')).toHaveLength(1)
    expect(invokeMock.mock.calls.filter(([command]) =>
      command === 'codex_system_conversation_reset')).toHaveLength(1)
  })

  it('arbitrates complete planning sessions across independent adapter instances', async () => {
    const first = createCodexPlanningGenerationService({
      workspaceHandle: 'workspace.first',
      conversationPrefix: 'conversation.first',
      contextRevision: 'revision.1',
      prompts: { render: async () => ({ system: 'Plan the product.' }) },
    })
    const second = createCodexPlanningGenerationService({
      workspaceHandle: 'workspace.second',
      conversationPrefix: 'conversation.second',
      contextRevision: 'revision.1',
      prompts: { render: async () => ({ system: 'Plan the product.' }) },
    })
    let releaseFirst!: () => void
    const firstSession = first.runExclusive(undefined, () =>
      new Promise<void>((resolve) => { releaseFirst = resolve }))
    const secondRun = vi.fn(async () => 'second')
    const secondSession = second.runExclusive(undefined, secondRun)

    await Promise.resolve()
    expect(secondRun).not.toHaveBeenCalled()
    releaseFirst()
    await expect(firstSession).resolves.toBeUndefined()
    await expect(secondSession).resolves.toBe('second')
    expect(secondRun).toHaveBeenCalledTimes(1)
  })

  it('cancels a queued planning session before it can own the native runtime', async () => {
    const first = createCodexPlanningGenerationService({
      workspaceHandle: 'workspace.first',
      conversationPrefix: 'conversation.first',
      contextRevision: 'revision.1',
      prompts: { render: async () => ({ system: 'Plan the product.' }) },
    })
    const second = createCodexPlanningGenerationService({
      workspaceHandle: 'workspace.second',
      conversationPrefix: 'conversation.second',
      contextRevision: 'revision.1',
      prompts: { render: async () => ({ system: 'Plan the product.' }) },
    })
    let releaseFirst!: () => void
    const firstSession = first.runExclusive(undefined, () =>
      new Promise<void>((resolve) => { releaseFirst = resolve }))
    const controller = new AbortController()
    const secondRun = vi.fn(async () => undefined)
    const secondSession = second.runExclusive(controller.signal, secondRun)
    controller.abort()

    await expect(secondSession).rejects.toMatchObject({ name: 'AbortError' })
    expect(secondRun).not.toHaveBeenCalled()
    releaseFirst()
    await expect(firstSession).resolves.toBeUndefined()
  })

})
