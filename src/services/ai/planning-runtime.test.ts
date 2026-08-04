import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
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

beforeEach(() => invokeMock.mockReset())

describe('planning runtime boundary', () => {
  it('prefers capability-proven Codex and otherwise uses a direct route', () => {
    const direct = { providerId: 'openai', model: 'gpt-5' }
    expect(selectPlanningRuntime({ codex: proven, direct })).toMatchObject({ runtimeId: 'codex-system' })
    expect(selectPlanningRuntime({ codex: { ...proven, capability: 'unsupported', reason: 'restricted-read-roots-required' }, direct }))
      .toEqual({ runtimeId: 'direct-provider', ...direct })
    expect(selectPlanningRuntime({ codex: { ...proven, execution: 'failed' }, direct }))
      .toEqual({ runtimeId: 'direct-provider', ...direct })
    expect(selectPlanningRuntime({ codex: { ...proven, execution: 'stale' } })).toBeUndefined()
    expect(selectPlanningRuntime({
      codex: { ...proven, execution: 'failed' },
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
      reason: 'restricted-read-roots-required',
    }).success).toBe(false)
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
          runtimeVersion: '0.146.0',
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

})
