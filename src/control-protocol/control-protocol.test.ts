import { describe, expect, it } from 'vitest'
import {
  applyControlRequest,
  controlRequestSchema,
  createControlLedger,
  guardControlAction,
  redactControlValue,
  type ControlRequest,
} from './control-protocol'

function request(
  overrides: Partial<ControlRequest> = {},
): ControlRequest {
  return {
    protocol: 'cutout.control.v1',
    requestId: 'request-1',
    expectedRevision: 4,
    mode: 'apply',
    operation: { type: 'tokens.patch', changes: [{ token: 'color.primary', value: '#0ea5e9' }] },
    ...overrides,
  }
}

describe('cutout.control.v1 request schema', () => {
  it('accepts the shared run lifecycle operations', () => {
    for (const operation of [
      { type: 'run.start', runId: 'run-1', mode: 'create', intent: 'Create a verified landing page.' },
      { type: 'run.get', runId: 'run-1' },
      { type: 'run.events', runId: 'run-1', afterEventId: 'event-1', limit: 100 },
      { type: 'run.cancel', runId: 'run-1', reason: 'User changed direction.' },
    ]) {
      expect(controlRequestSchema.safeParse({ ...request(), operation }).success).toBe(true)
    }
  })

  it('accepts a bounded audit intent with a larger paid-tool execution prompt', () => {
    const prompt = 'render context '.repeat(2_000)
    const parsed = controlRequestSchema.parse(request({
      operation: {
        type: 'tool.invoke',
        tool: {
          capability: 'generate-image',
          intent: 'Generate the approved prototype page.',
          prompt,
          inputArtifactIds: [],
          budgetCeiling: { currency: 'USD', amount: 1 },
          approvalPolicy: 'auto-within-budget',
        },
      },
    }))

    expect(parsed.operation).toMatchObject({
      type: 'tool.invoke',
      tool: { intent: 'Generate the approved prototype page.', prompt },
    })
  })

  it('allows only the published operation vocabulary', () => {
    const parsed = controlRequestSchema.parse(request())
    expect(parsed.operation.type).toBe('tokens.patch')

    expect(() => controlRequestSchema.parse({
      ...request(),
      operation: { type: 'provider.set-key', secret: 'sk-secret' },
    })).toThrow()
  })

  it('rejects arbitrary fields and arbitrary file paths at the protocol boundary', () => {
    expect(() => controlRequestSchema.parse({
      ...request(),
      providerKey: 'sk-should-not-cross-the-boundary',
    })).toThrow()
    expect(() => controlRequestSchema.parse(request({
      operation: {
        type: 'export.brand-kit',
        input: { document: {}, brand: {} },
        destination: '../../outside',
      } as never,
    }))).toThrow()
    expect(() => controlRequestSchema.parse(request({
      operation: {
        type: 'source.ingest',
        input: {
          type: 'url-descriptor', url: 'https://example.test/reference?api_key=not-a-secret-yet', role: 'reference',
          license: { kind: 'unknown', rationale: 'Test supplied.' },
        },
      },
    }))).toThrow('credential-free HTTP')
    expect(() => controlRequestSchema.parse({
      ...request({ operation: { type: 'export.design-kit', format: 'directory' } }),
      operation: {
        type: 'export.design-kit',
        format: 'directory',
        destination: '/Users/anything/secret.txt',
      },
    })).toThrow()
    expect(() => controlRequestSchema.parse(request({
      operation: {
        type: 'design.patch',
        patches: [{ op: 'replace', path: '/designMarkdown', value: 'provider key: sk-secret-value' }],
      },
    }))).toThrow()
    expect(() => controlRequestSchema.parse(request({
      operation: {
        type: 'source.ingest',
        input: {
          type: 'local-file-scan', path: '/Users/anything/source.png', sourceKind: 'screenshot', role: 'reference',
          license: { kind: 'unknown', rationale: 'Test supplied.' },
        },
      },
    }))).toThrow('controlled relative path')
    expect(() => controlRequestSchema.parse(request({
      operation: {
        type: 'source.ingest',
        input: {
          type: 'inline-text', sourceKind: 'idea', title: 'Idea', text: 'Safe text', role: 'requirement',
          license: { kind: 'unknown', rationale: 'Test supplied.' }, bytes: [1, 2, 3],
        },
      } as unknown as ControlRequest['operation'],
    }))).toThrow()
  })

  it('does not accept credential-shaped opaque identifiers or cancellation reasons', () => {
    expect(() => controlRequestSchema.parse(request({ requestId: 'sk-live-secret-value' }))).toThrow('Credential-shaped')
    expect(() => controlRequestSchema.parse(request({
      operation: { type: 'run.cancel', runId: 'run-1', reason: 'Bearer private-token-value' },
    }))).toThrow('Credential-shaped')
  })
})

describe('control request execution guard', () => {
  it('returns a revision conflict without dispatching', () => {
    const result = applyControlRequest(
      createControlLedger(5),
      request({ expectedRevision: 4 }),
    )

    expect(result.decision).toBe('conflict')
    expect(result.response.status).toBe('conflict')
    expect(result.ledger).toEqual(createControlLedger(5))
  })

  it('marks duplicate requests idempotently and preserves the original result', () => {
    const first = applyControlRequest(createControlLedger(4), request())
    const completed = first.complete({ patchedTokens: ['color.primary'] }, 5)
    const duplicate = applyControlRequest(completed.ledger, request())

    expect(duplicate.decision).toBe('duplicate')
    expect(duplicate.response.status).toBe('ok')
    expect(duplicate.response.idempotent).toBe(true)
    expect(duplicate.response.result).toEqual({ patchedTokens: ['color.primary'] })
  })

  it('allows dry runs to describe the action without consuming a revision', () => {
    const result = applyControlRequest(
      createControlLedger(4),
      request({ mode: 'dry-run' }),
    )

    expect(result.decision).toBe('dry-run')
    expect(result.ledger.revision).toBe(4)
    expect(result.response.status).toBe('ok')
    expect(result.response.dryRun).toBe(true)
  })

  it('allows an approval-free dry-run of an external export while retaining the approval gate for apply', () => {
    const external = request({ operation: { type: 'export.design-kit', format: 'directory' } })
    const preview = applyControlRequest(createControlLedger(4), { ...external, mode: 'dry-run' }, {
      policy: { allowPaid: false, allowExternal: false, requireApprovalForExternal: true },
    })
    const apply = applyControlRequest(createControlLedger(4), external, {
      policy: { allowPaid: false, allowExternal: true, requireApprovalForExternal: true },
    })

    expect(preview.decision).toBe('dry-run')
    expect(preview.response.dryRun).toBe(true)
    expect(apply.decision).toBe('denied')
    expect(apply.response.error?.code).toBe('approval-required')
  })

  it('requires explicit approval for guarded paid or external effects', () => {
    const paid = guardControlAction(request(), {
      effects: { paid: true, external: false },
      policy: { allowPaid: true, allowExternal: true, requireApprovalForPaid: true },
    })
    const external = guardControlAction(
      request({ operation: { type: 'export.design-kit', format: 'directory' } }),
      {
        effects: { paid: false, external: true },
        policy: { allowPaid: true, allowExternal: true, requireApprovalForExternal: true },
      },
    )

    expect(paid.allowed).toBe(false)
    expect(paid.reason).toBe('approval-required')
    expect(external.allowed).toBe(false)
    expect(external.reason).toBe('approval-required')

    expect(guardControlAction(request({ approval: { id: 'approval-1', grantedAt: 1 } }), {
      effects: { paid: true, external: false },
      policy: { allowPaid: true, allowExternal: true, requireApprovalForPaid: true },
    }).allowed).toBe(true)
  })
})

describe('secret redaction', () => {
  it('redacts secrets recursively without redacting design tokens', () => {
    expect(redactControlValue({
      apiKey: 'sk-live-value',
      nested: { authorization: 'Bearer secret' },
      tokens: { 'color.primary': '#0ea5e9' },
      note: 'sk-live-value',
    })).toEqual({
      apiKey: '[REDACTED]',
      nested: { authorization: '[REDACTED]' },
      tokens: { 'color.primary': '#0ea5e9' },
      note: '[REDACTED]',
    })
  })
})
