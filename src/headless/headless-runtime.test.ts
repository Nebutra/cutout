import { describe, expect, it } from 'vitest'
import type { DesignDocument } from '@/design-ir'
import type { SourceIngestOperation } from '@/control-protocol'
import {
  createHeadlessRuntime,
  createInMemoryRuntimeStore,
  type HeadlessProjectState,
} from './index'

const DIGEST = 'a'.repeat(64)

function document(): DesignDocument {
  return {
    version: 'design-ir.v1',
    meta: {
      id: 'project-1',
      title: 'Initial project',
      createdAt: '2026-07-10T00:00:00.000Z',
      updatedAt: '2026-07-10T00:00:00.000Z',
    },
    revision: {
      id: 'revision-1',
      number: 1,
      createdAt: '2026-07-10T00:00:00.000Z',
      author: { kind: 'human', id: 'user-1' },
    },
    tokens: [{ id: 'color-primary', name: 'color.primary', kind: 'color', value: '#111111' }],
    materials: [{
      id: 'page-home',
      kind: 'prototype-page',
      name: 'Home',
      currentRevisionId: 'page-home-r1',
      revisions: [{
        id: 'page-home-r1',
        ordinal: 1,
        createdAt: '2026-07-10T00:00:00.000Z',
        content: { id: 'content-page-home', uri: `sha256:${DIGEST}`, sha256: DIGEST, mediaType: 'image/png' },
      }],
    }],
    needs: [],
    sources: [],
    brands: [],
    components: [],
    provenance: [],
    relations: [],
  }
}

function projectState(): HeadlessProjectState {
  return {
    manifest: {
      version: 'cutout.manifest.v1',
      project: { id: 'project-1', name: 'Initial project' },
      files: {
        designIr: 'design-ir.json',
        designMarkdown: 'DESIGN.md',
        artifactIndex: 'artifacts.json',
        policy: 'policy.json',
        controlLedger: 'control-ledger.json',
      },
    },
    design: document(),
    designMarkdown: '# Initial design',
    artifactIndex: {
      version: 'cutout.artifacts.v1',
      artifacts: [{ sha256: DIGEST, mediaType: 'image/png', byteLength: 42 }],
    },
    policy: {
      version: 'cutout.policy.v1',
      allowApply: false,
      allowedOperations: ['project.context', 'material.list', 'validate', 'design.patch', 'tokens.patch'],
      requireApprovalForExternal: true,
    },
  }
}

function sourceIngestionStore(initial = projectState()) {
  const store = createInMemoryRuntimeStore(initial)
  return Object.assign(store, {
    async prepareSourceIngestion(operation: SourceIngestOperation) {
      if (operation.input.type !== 'inline-text') throw new Error('Test store accepts inline text only.')
      return {
        input: operation.input,
        artifacts: [{ bytes: new TextEncoder().encode(operation.input.text), mediaType: 'text/plain;charset=utf-8' }],
      }
    },
  })
}

function request(operation: unknown, overrides: Record<string, unknown> = {}) {
  return {
    protocol: 'cutout.control.v1',
    requestId: 'request-1',
    expectedRevision: 0,
    mode: 'apply',
    operation,
    ...overrides,
  }
}

describe('repo-native headless runtime', () => {
  it('persists, queries, paginates, cancels, and replays one shared run lifecycle', async () => {
    const initial = projectState()
    initial.policy = {
      ...initial.policy,
      allowApply: true,
      allowedOperations: [...initial.policy.allowedOperations, 'run.start', 'run.get', 'run.events', 'run.cancel'],
    }
    const store = createInMemoryRuntimeStore(initial)
    const runtime = createHeadlessRuntime(store)

    const started = await runtime.execute(request({
      type: 'run.start', runId: 'run-1', mode: 'create', intent: 'Create a verified landing page.',
    }, { requestId: 'start-run' }))
    const fetched = await runtime.execute(request({ type: 'run.get', runId: 'run-1' }, {
      requestId: 'get-run', expectedRevision: 1,
    }))
    const firstPage = await runtime.execute(request({ type: 'run.events', runId: 'run-1', limit: 1 }, {
      requestId: 'events-1', expectedRevision: 1,
    }))
    const firstEventId = (firstPage.result as { events: Array<{ eventId: string }> }).events[0]?.eventId
    const secondPage = await runtime.execute(request({ type: 'run.events', runId: 'run-1', afterEventId: firstEventId }, {
      requestId: 'events-2', expectedRevision: 1,
    }))
    const cancelled = await runtime.execute(request({ type: 'run.cancel', runId: 'run-1', reason: 'Direction changed.' }, {
      requestId: 'cancel-run', expectedRevision: 1,
    }))

    expect(started).toMatchObject({ status: 'ok', revision: 1, result: { run: { status: 'running', intent: 'Create a verified landing page.' } } })
    expect(fetched).toMatchObject({ status: 'ok', revision: 1, result: { run: { runId: 'run-1', status: 'running' } } })
    expect(firstPage).toMatchObject({ status: 'ok', result: { events: [{ type: 'run-started' }], hasMore: true } })
    expect(secondPage).toMatchObject({ status: 'ok', result: { events: [{ type: 'intent-recorded' }], hasMore: false } })
    expect(cancelled).toMatchObject({ status: 'ok', revision: 2, result: { cancelled: true, run: { status: 'cancelled' } } })
    expect((await store.load()).runEvents?.events.map((event) => event.type)).toEqual([
      'run-started', 'intent-recorded', 'run-cancelled',
    ])
  })

  it('keeps run commands idempotent and rejects stale revisions or unknown runs', async () => {
    const initial = projectState()
    initial.policy = { ...initial.policy, allowApply: true, allowedOperations: [...initial.policy.allowedOperations, 'run.start', 'run.get', 'run.events', 'run.cancel'] }
    const runtime = createHeadlessRuntime(createInMemoryRuntimeStore(initial))
    const start = request({ type: 'run.start', runId: 'run-1', mode: 'repair', intent: 'Repair the selected material.' }, { requestId: 'stable-start' })

    const first = await runtime.execute(start)
    const duplicate = await runtime.execute(start)
    const stale = await runtime.execute(request({ type: 'run.cancel', runId: 'run-1' }, { requestId: 'stale-cancel', expectedRevision: 0 }))
    const missing = await runtime.execute(request({ type: 'run.get', runId: 'missing' }, { requestId: 'missing-run', expectedRevision: 1 }))

    expect(first).toMatchObject({ status: 'ok', revision: 1 })
    expect(duplicate).toEqual({ ...first, idempotent: true })
    expect(stale).toMatchObject({ status: 'conflict', revision: 1 })
    expect(missing).toMatchObject({ status: 'invalid', revision: 1, error: { code: 'invalid-request' } })
  })
  it('returns a redacted, stable project context without changing the revision', async () => {
    const store = createInMemoryRuntimeStore(projectState())
    const runtime = createHeadlessRuntime(store)

    const result = await runtime.execute(request({ type: 'project.context', include: ['summary'] }))

    expect(result).toMatchObject({ status: 'ok', revision: 0, dryRun: false })
    expect(result.result).toMatchObject({
      project: { id: 'project-1', name: 'Initial project' },
      summary: { materials: 1, tokens: 1 },
    })
    expect((await store.load()).ledger?.revision ?? 0).toBe(0)
  })

  it('returns a completed request idempotently without re-dispatching', async () => {
    const runtime = createHeadlessRuntime(createInMemoryRuntimeStore(projectState()))
    const first = await runtime.execute(request({ type: 'material.list' }))
    const repeated = await runtime.execute(request({ type: 'material.list' }))

    expect(first.status).toBe('ok')
    expect(repeated).toEqual({ ...first, idempotent: true })
  })

  it('enforces expectedRevision before a host operation is dispatched', async () => {
    const runtime = createHeadlessRuntime(createInMemoryRuntimeStore(projectState()))

    const result = await runtime.execute(request(
      { type: 'material.list' },
      { requestId: 'conflict', expectedRevision: 99 },
    ))

    expect(result).toMatchObject({ status: 'conflict', revision: 0 })
  })

  it('lists only matching durable materials and proves their artifact index entry', async () => {
    const runtime = createHeadlessRuntime(createInMemoryRuntimeStore(projectState()))

    const result = await runtime.execute(request({
      type: 'material.list',
      filter: { kind: 'prototype-page' },
    }))

    expect(result.result).toEqual({
      materials: [{
        id: 'page-home',
        kind: 'prototype-page',
        name: 'Home',
        revisionId: 'page-home-r1',
        artifact: { sha256: DIGEST, mediaType: 'image/png', byteLength: 42 },
      }],
    })
  })

  it('validates the Design IR and content-addressed material references', async () => {
    const broken = projectState()
    broken.artifactIndex = { version: 'cutout.artifacts.v1', artifacts: [] }
    const runtime = createHeadlessRuntime(createInMemoryRuntimeStore(broken))

    const result = await runtime.execute(request({ type: 'validate', scope: ['design', 'materials'] }))

    expect(result).toMatchObject({ status: 'ok' })
    expect(result.result).toEqual({ valid: false, checks: [
      { scope: 'design', valid: true },
      { scope: 'materials', valid: false, message: `Missing artifact index entry: ${DIGEST}` },
    ] })
  })

  it('previews token patches without writing state or consuming a revision', async () => {
    const store = createInMemoryRuntimeStore(projectState())
    const runtime = createHeadlessRuntime(store)

    const result = await runtime.execute(request({
      type: 'tokens.patch',
      changes: [{ token: 'color.primary', value: '#22c55e' }],
    }, { requestId: 'preview-token', mode: 'dry-run' }))

    expect(result).toMatchObject({
      status: 'ok',
      revision: 0,
      dryRun: true,
      result: { operation: 'tokens.patch', changes: [{ token: 'color.primary', before: '#111111', after: '#22c55e' }] },
    })
    expect((await store.load()).design.tokens[0]?.value).toBe('#111111')
    expect((await store.load()).ledger).toBeUndefined()
  })

  it('rejects apply patches and unknown token targets without making partial changes', async () => {
    const store = createInMemoryRuntimeStore(projectState())
    const runtime = createHeadlessRuntime(store)

    const apply = await runtime.execute(request({
      type: 'design.patch',
      patches: [{ op: 'replace', path: '/designMarkdown', value: '# Changed' }],
    }, { requestId: 'apply-patch' }))
    const badPreview = await runtime.execute(request({
      type: 'tokens.patch',
      changes: [{ token: 'missing.token', value: '#22c55e' }],
    }, { requestId: 'bad-preview', mode: 'dry-run' }))

    expect(apply).toMatchObject({ status: 'denied', error: { code: 'policy-denied' } })
    expect(badPreview).toMatchObject({ status: 'invalid', error: { code: 'invalid-request' } })
    expect((await store.load()).designMarkdown).toBe('# Initial design')
  })

  it('rejects malformed protocol input before accessing storage', async () => {
    const runtime = createHeadlessRuntime(createInMemoryRuntimeStore(projectState()))

    const result = await runtime.execute({
      protocol: 'cutout.control.v1', requestId: 'bad', expectedRevision: 0, mode: 'apply',
      operation: { type: 'material.list', path: '../../secrets' },
    })

    expect(result).toMatchObject({ status: 'invalid', error: { code: 'invalid-request' } })
  })

  it('returns a SourcePatch and impact in dry-run without mutating Design IR', async () => {
    const store = sourceIngestionStore()
    const runtime = createHeadlessRuntime(store)
    const result = await runtime.execute(request({
      type: 'source.ingest',
      input: {
        type: 'inline-text', sourceKind: 'idea', title: 'Quiet dashboard', text: 'A calm B2B dashboard.',
        role: 'requirement', license: { kind: 'unknown', rationale: 'Test supplied.' },
      },
    }, { requestId: 'source-preview', mode: 'dry-run' }))

    expect(result).toMatchObject({ status: 'ok', dryRun: true, result: {
      operation: 'source.ingest', patch: { sources: [{ kind: 'idea', title: 'Quiet dashboard' }], provenance: [{ operation: 'import' }] },
      impact: { sourcesAdded: [{ kind: 'idea' }], artifactPlan: [{ byteLength: 21 }] },
    } })
    expect((await store.load()).design.sources).toEqual([])
  })

  it('requires policy and approval before applying an import, then persists source/provenance idempotently', async () => {
    const initial = projectState()
    initial.policy = { ...initial.policy, allowApply: true, allowedOperations: [...initial.policy.allowedOperations, 'source.ingest'] }
    const store = sourceIngestionStore(initial)
    const runtime = createHeadlessRuntime(store)
    const operation = {
      type: 'source.ingest' as const,
      input: {
        type: 'inline-text' as const, sourceKind: 'story' as const, title: 'Checkout', text: 'A buyer completes checkout.',
        role: 'requirement' as const, license: { kind: 'unknown' as const, rationale: 'Test supplied.' },
      },
    }
    const denied = await runtime.execute(request(operation, { requestId: 'source-apply' }))
    const applied = await runtime.execute(request(operation, {
      requestId: 'source-apply', approval: { id: 'reviewed-import', grantedAt: 1 },
    }))
    const duplicate = await runtime.execute(request(operation, {
      requestId: 'source-apply', approval: { id: 'reviewed-import', grantedAt: 1 },
    }))

    expect(denied).toMatchObject({ status: 'denied', error: { code: 'approval-required' } })
    expect(applied).toMatchObject({ status: 'ok', revision: 1, result: { operation: 'source.ingest' } })
    expect(duplicate).toMatchObject({ status: 'ok', revision: 1, idempotent: true })
    const saved = await store.load()
    expect(saved.design.sources).toHaveLength(1)
    expect(saved.design.provenance).toHaveLength(1)
    expect(saved.design.revision.number).toBe(2)
  })

  it('rejects absolute source scan paths before a host can resolve them', async () => {
    const runtime = createHeadlessRuntime(sourceIngestionStore())
    const result = await runtime.execute(request({
      type: 'source.ingest',
      input: {
        type: 'local-file-scan', path: '/Users/example/secret.png', sourceKind: 'screenshot', role: 'reference',
        license: { kind: 'unknown', rationale: 'Test supplied.' },
      },
    }, { requestId: 'bad-source-path', mode: 'dry-run' }))

    expect(result).toMatchObject({ status: 'invalid', error: { code: 'invalid-request' } })
  })

  it('plans a paid tool honestly and requires a real executor before apply', async () => {
    const initial = projectState()
    initial.policy = {
      ...initial.policy,
      allowApply: true,
      allowedOperations: [...initial.policy.allowedOperations, 'tool.invoke'],
    }
    const store = createInMemoryRuntimeStore(initial)
    const runtime = createHeadlessRuntime(store)
    const operation = {
      type: 'tool.invoke',
      tool: {
        capability: 'generate-image', intent: 'Generate the hero asset needed by the approved outcome',
        inputArtifactIds: [], budgetCeiling: { currency: 'USD', amount: 0.25 },
        approvalPolicy: 'auto-within-budget',
      },
    }

    const preview = await runtime.execute(request(operation, { requestId: 'paid-preview', mode: 'dry-run' }))
    const apply = await runtime.execute(request(operation, { requestId: 'paid-apply' }))

    expect(preview).toMatchObject({ status: 'ok', dryRun: true, result: {
      operation: 'tool.invoke', plan: { status: 'capability-required', executable: false },
    } })
    expect(apply).toMatchObject({ status: 'denied', error: { code: 'capability-required' } })
    expect((await store.load()).ledger?.revision ?? 0).toBe(0)
  })
})
