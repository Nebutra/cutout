import {
  applyControlRequest,
  controlRequestSchema,
  redactControlValue,
  type ControlOperation,
  type ControlRequest,
  type ControlResponse,
  type TrustedControlAuthorization,
} from '@/control-protocol'
import { planPaidTool } from '@/control-protocol'
import { compileHeadlessDesignKit } from '@/design-kit'
import { compileBrandKit } from '@/brand-kit'
import { compileComponentCandidates, type ComponentManifest } from '@/components-compiler'
import { fingerprint, validateDesignDocument } from '@/design-ir'
import { applySourcePatch, ingestEverything, type IngestionResult } from '@/ingestion/everything-inbox'
import { compileStarter, type StarterPlan } from '@/starter-compiler'
import { starterExportId, starterPlanFingerprint } from './node-fs'
import {
  appendRunEvent,
  createRunEvent,
  createRunEventStore,
  replayRunEvents,
} from '@/agent-runtime/run-events'
import type { ArtifactRecord, HeadlessProjectState } from './schema'
import { artifactIndexSchema, headlessProjectStateSchema } from './schema'
import { ledgerFromState, type RuntimeStore, type SourceIngestionStore } from './storage'
import { executeCodingTask, type CodingBackend, type CodingWorkspace } from '@/coding-runtime'

export interface HeadlessRuntime {
  execute(input: unknown, authorization?: TrustedControlAuthorization): Promise<ControlResponse>
}

/**
 * A local, auditable host for the protocol. It deliberately has no provider,
 * GUI, network, secret, or process capability. The only apply effect currently
 * available is an approval-gated, directory-sandboxed Design Kit export.
 */
export function createHeadlessRuntime(store: RuntimeStore, coding: { backend?: CodingBackend; workspace?: CodingWorkspace } = {}): HeadlessRuntime {
  return {
    async execute(input, authorization = {}) {
      const parsedRequest = controlRequestSchema.safeParse(input)
      if (!parsedRequest.success) return invalidResponse(input, parsedRequest.error.issues[0]?.message ?? 'Invalid control request.')

      const state = await store.load()
      const parsedState = headlessProjectStateSchema.safeParse(state)
      if (!parsedState.success) {
        return response(parsedRequest.data, 0, 'invalid', false, false, undefined, {
          code: 'invalid-request',
          message: `Invalid .cutout state: ${parsedState.error.issues[0]?.message ?? 'unknown error'}`,
        })
      }

      const request = parsedRequest.data
      const ledger = ledgerFromState(state)
      const preparation = applyControlRequest(ledger, request, {
        policy: {
          // A paid request still passes through the shared budget/authorization
          // contract. This host has no provider executor, so apply terminates as
          // capability-required rather than pretending work occurred.
          allowPaid: request.operation.type === 'tool.invoke',
          allowExternal: state.policy.allowApply,
          requireApprovalForExternal: state.policy.requireApprovalForExternal,
        },
        authorization,
      })
      if (preparation.decision === 'duplicate' || preparation.decision === 'conflict' || preparation.decision === 'denied') {
        return preparation.response
      }
      if (request.mode === 'apply' && !state.policy.allowedOperations.some((operation) => operation === request.operation.type)) {
        return response(request, ledger.revision, 'denied', false, false, undefined, {
          code: 'policy-denied', message: `Operation "${request.operation.type}" is disabled by .cutout policy.`,
        })
      }

      if (isPatch(request) && request.mode !== 'dry-run') {
        return response(request, ledger.revision, 'denied', false, false, undefined, {
          code: 'policy-denied', message: 'This headless runtime supports patches only in dry-run mode.',
        })
      }

      const dispatched = await dispatch(store, state, request, coding, authorization)
      if (!dispatched.ok) {
        return response(request, ledger.revision, dispatched.code ? 'denied' : 'invalid', request.mode === 'dry-run', false, undefined, {
          code: dispatched.code ?? 'invalid-request', message: dispatched.message,
        })
      }

      if (preparation.decision === 'dry-run') {
        return response(request, ledger.revision, 'ok', true, false, dispatched.result)
      }

      // Writes advance the revision only after their host effect has completed.
      const nextRevision = request.operation.type === 'export.design-kit'
        || request.operation.type === 'export.brand-kit'
        || request.operation.type === 'export.starter'
        || request.operation.type === 'source.ingest'
        || request.operation.type === 'coding.execute'
        || request.operation.type === 'coding.review'
        || request.operation.type === 'coding.repair'
        || (request.operation.type === 'run.start' && Boolean(dispatched.nextState))
        || (request.operation.type === 'run.cancel' && Boolean(dispatched.nextState))
        ? ledger.revision + 1
        : ledger.revision
      const completed = preparation.complete(dispatched.result, nextRevision)
      await store.save({ ...(dispatched.nextState ?? state), ledger: completed.ledger })
      return completed.response
    },
  }
}

type DispatchResult = {
  readonly ok: true
  readonly result: unknown
  readonly nextState?: HeadlessProjectState
} | {
  readonly ok: false
  readonly message: string
  readonly code?: 'authorization-required' | 'capability-required' | 'budget-exceeded'
}

async function dispatch(store: RuntimeStore, state: HeadlessProjectState, request: ControlRequest, coding: { backend?: CodingBackend; workspace?: CodingWorkspace }, authorization: TrustedControlAuthorization): Promise<DispatchResult> {
  switch (request.operation.type) {
    case 'project.context': return ok(projectContext(state, request.operation.include))
    case 'material.list': return ok(materialList(state, request.operation.filter))
    case 'validate': return ok(validate(state, request.operation.scope))
    case 'design.patch': return previewDesignPatch(state, request.operation.patches)
    case 'tokens.patch': return previewTokensPatch(state, request.operation.changes)
    case 'source.ingest': return sourceIngest(store, state, request as ControlRequest & {
      readonly operation: Extract<ControlOperation, { readonly type: 'source.ingest' }>
    })
    case 'run.start': return startRun(state, request as ControlRequest & {
      readonly operation: Extract<ControlOperation, { readonly type: 'run.start' }>
    })
    case 'run.get': return getRun(state, request.operation.runId)
    case 'run.events': return getRunEvents(state, request.operation)
    case 'run.cancel': return cancelRun(state, request as ControlRequest & {
      readonly operation: Extract<ControlOperation, { readonly type: 'run.cancel' }>
    })
    case 'export.design-kit':
      return exportDesignKit(store, state, request as ControlRequest & {
        readonly operation: Extract<ControlOperation, { readonly type: 'export.design-kit' }>
      })
    case 'export.brand-kit':
      return exportBrandKit(store, state, request as ControlRequest & {
        readonly operation: Extract<ControlOperation, { readonly type: 'export.brand-kit' }>
      })
    case 'export.starter':
      return exportStarter(store, state, request as ControlRequest & {
        readonly operation: Extract<ControlOperation, { readonly type: 'export.starter' }>
      })
    case 'coding.execute':
    case 'coding.review':
    case 'coding.repair': {
      try {
        if (request.operation.task.expectedRevision !== request.expectedRevision) return fail('CodingTask.expectedRevision must match the control request expectedRevision.')
        const receipt = await executeCodingTask(request.operation.task, { ...coding, apply: request.mode === 'apply' })
        return ok({ operation: request.operation.type, receipt })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Controlled coding operation failed.'
        if (message.startsWith('capability-required:')) return { ok: false, code: 'capability-required', message: message.slice('capability-required:'.length).trim() }
        if (message.startsWith('budget-exceeded:')) return { ok: false, code: 'budget-exceeded', message: message.slice('budget-exceeded:'.length).trim() }
        if (message.startsWith('policy-denied:')) return { ok: false, code: 'authorization-required', message: message.slice('policy-denied:'.length).trim() }
        return fail(message)
      }
    }
    case 'tool.invoke': {
      const plan = planPaidTool(request.operation.tool, undefined, { allowPaid: true }, Boolean(authorization.approval))
      if (request.mode === 'dry-run') return ok({ operation: 'tool.invoke', plan })
      return { ok: false, code: 'capability-required', message: plan.reason ?? 'No paid tool executor is available.' }
    }
  }
}

function startRun(
  state: HeadlessProjectState,
  request: ControlRequest & { readonly operation: Extract<ControlOperation, { readonly type: 'run.start' }> },
): DispatchResult {
  const current = state.runEvents ?? createRunEventStore()
  if (current.events.some((event) => event.runId === request.operation.runId)) {
    return fail(`Run "${request.operation.runId}" already exists.`)
  }
  const started = createRunEvent(request.operation.runId, {
    type: 'run-started', mode: request.operation.mode,
  }, { eventId: `event:${request.requestId}:started`, at: Date.now() })
  const intent = createRunEvent(request.operation.runId, {
    type: 'intent-recorded', intent: request.operation.intent,
  }, { eventId: `event:${request.requestId}:intent`, at: started.at })
  const runEvents = appendRunEvent(appendRunEvent(current, started), intent)
  return ok({ run: runEvents.activeRun, events: [started, intent] }, { ...state, runEvents })
}

function getRun(state: HeadlessProjectState, runId: string): DispatchResult {
  const events = (state.runEvents?.events ?? []).filter((event) => event.runId === runId)
  if (events.length === 0) return fail(`Run "${runId}" was not found.`)
  return ok({ run: replayRunEvents(events).activeRun })
}

function getRunEvents(
  state: HeadlessProjectState,
  operation: Extract<ControlOperation, { readonly type: 'run.events' }>,
): DispatchResult {
  const all = (state.runEvents?.events ?? []).filter((event) => event.runId === operation.runId)
  if (all.length === 0) return fail(`Run "${operation.runId}" was not found.`)
  const cursor = operation.afterEventId
    ? all.findIndex((event) => event.eventId === operation.afterEventId)
    : -1
  if (operation.afterEventId && cursor < 0) return fail(`Event cursor "${operation.afterEventId}" was not found in run "${operation.runId}".`)
  const limit = operation.limit ?? 200
  const events = all.slice(cursor + 1, cursor + 1 + limit)
  return ok({
    runId: operation.runId,
    events,
    nextEventId: events.at(-1)?.eventId ?? operation.afterEventId ?? null,
    hasMore: cursor + 1 + events.length < all.length,
  })
}

function cancelRun(
  state: HeadlessProjectState,
  request: ControlRequest & { readonly operation: Extract<ControlOperation, { readonly type: 'run.cancel' }> },
): DispatchResult {
  const events = (state.runEvents?.events ?? []).filter((event) => event.runId === request.operation.runId)
  if (events.length === 0) return fail(`Run "${request.operation.runId}" was not found.`)
  const projection = replayRunEvents(events).activeRun
  if (!projection) return fail(`Run "${request.operation.runId}" could not be replayed.`)
  if (projection.status === 'cancelled') return ok({ run: projection, cancelled: false })
  if (projection.status !== 'running') return fail(`Run "${request.operation.runId}" is already ${projection.status}.`)
  const cancelled = createRunEvent(request.operation.runId, {
    type: 'run-cancelled', reason: request.operation.reason ?? 'Cancelled by control client.',
  }, { eventId: `event:${request.requestId}:cancelled`, at: Date.now() })
  const runEvents = appendRunEvent(state.runEvents ?? createRunEventStore(), cancelled)
  return ok({ run: replayRunEvents([...events, cancelled]).activeRun, cancelled: true }, { ...state, runEvents })
}

async function sourceIngest(
  store: RuntimeStore,
  state: HeadlessProjectState,
  request: ControlRequest & { readonly operation: Extract<ControlOperation, { readonly type: 'source.ingest' }> },
): Promise<DispatchResult> {
  const prepared = await prepareSourceIngestion(store, request.operation)
  if (!prepared.ok) return prepared

  const ingested = await ingestEverything(prepared.data.input, {
    capturedAt: new Date().toISOString(),
    actorId: 'agent:cutout-control',
    existingSources: state.design.sources,
  })
  if (!ingested.ok) return fail(ingested.error)

  const impact = sourceIngestImpact(ingested.data, prepared.data.artifacts)
  const result = { operation: 'source.ingest' as const, patch: ingested.data.patch, impact }
  if (request.mode === 'dry-run') return ok(result)

  const records = await persistSourceArtifacts(store, prepared.data.artifacts)
  if (!records.ok) return records
  const applied = applySourcePatch(state.design, ingested.data.patch, {
    id: `revision:source-ingest:${request.requestId}`,
    createdAt: new Date().toISOString(),
    actor: { kind: 'agent', id: 'agent:cutout-control' },
  })
  if (!applied.ok) return fail(applied.error)
  const knownArtifacts = new Map(state.artifactIndex.artifacts.map((artifact) => [artifact.sha256, artifact]))
  for (const artifact of records.data) knownArtifacts.set(artifact.sha256, artifact)
  return {
    ok: true,
    result: { ...result, impact: { ...impact, artifactRecords: records.data.map(({ sha256, mediaType, byteLength }) => ({ sha256, mediaType, byteLength })) } },
    nextState: {
      ...state,
      design: applied.data,
      artifactIndex: { ...state.artifactIndex, artifacts: [...knownArtifacts.values()].sort((left, right) => left.sha256.localeCompare(right.sha256)) },
    },
  }
}

async function prepareSourceIngestion(
  store: RuntimeStore,
  operation: Extract<ControlOperation, { readonly type: 'source.ingest' }>,
): Promise<{ readonly ok: true; readonly data: Awaited<ReturnType<SourceIngestionStore['prepareSourceIngestion']>> } | { readonly ok: false; readonly message: string }> {
  if (!isSourceIngestionStore(store)) return { ok: false, message: 'This runtime store does not support controlled source ingestion.' }
  try {
    return { ok: true, data: await store.prepareSourceIngestion(operation) }
  } catch (error) {
    return { ok: false, message: sanitizeHostError(error) }
  }
}

async function persistSourceArtifacts(
  store: RuntimeStore,
  artifacts: readonly { readonly bytes: Uint8Array; readonly mediaType: string }[],
): Promise<{ readonly ok: true; readonly data: readonly ArtifactRecord[] } | { readonly ok: false; readonly message: string }> {
  if (!isArtifactWriteStore(store)) return { ok: true, data: [] }
  try {
    return { ok: true, data: await Promise.all(artifacts.map((artifact) => store.writeArtifact(artifact))) }
  } catch (error) {
    return { ok: false, message: sanitizeHostError(error) }
  }
}

function sourceIngestImpact(
  ingestion: IngestionResult,
  artifacts: readonly { readonly bytes: Uint8Array; readonly mediaType: string }[],
) {
  return {
    sourcesAdded: ingestion.patch.sources.map(({ id, kind, title }) => ({ id, kind, title })),
    provenanceAdded: ingestion.patch.provenance.map(({ id, sourceIds }) => ({ id, sourceIds })),
    skipped: ingestion.skipped,
    artifactPlan: artifacts.map(({ bytes, mediaType }) => ({ mediaType, byteLength: bytes.byteLength })),
  }
}

function isSourceIngestionStore(store: RuntimeStore): store is SourceIngestionStore {
  return typeof (store as { prepareSourceIngestion?: unknown }).prepareSourceIngestion === 'function'
}

function isArtifactWriteStore(store: RuntimeStore): store is RuntimeStore & {
  writeArtifact(input: { readonly bytes: Uint8Array; readonly mediaType: string }): Promise<ArtifactRecord>
} {
  return typeof (store as { writeArtifact?: unknown }).writeArtifact === 'function'
}

async function exportBrandKit(
  store: RuntimeStore,
  state: HeadlessProjectState,
  request: ControlRequest & { readonly operation: Extract<ControlOperation, { readonly type: 'export.brand-kit' }> },
): Promise<DispatchResult> {
  let kit
  try {
    // A Brand Kit is a projection of the persisted DesignDocument, never a
    // secondary, caller-controlled design graph. This makes the request's
    // evidence explicit while preserving a single durable source of truth.
    const [requestFingerprint, stateFingerprint] = await Promise.all([
      fingerprint(request.operation.input.document),
      fingerprint(state.design),
    ])
    if (requestFingerprint !== stateFingerprint) {
      return fail('Brand Kit input document does not match the current project DesignDocument.')
    }
    kit = await compileBrandKit({ document: state.design, brand: request.operation.input.brand })
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Unable to compile the Brand Kit.')
  }

  const plan = brandKitPlan(kit)
  if (request.mode === 'dry-run') return ok({ ...plan, apply: { requiresApproval: state.policy.requireApprovalForExternal } })
  if (!isBrandKitExportStore(store)) return fail('This runtime store does not support Brand Kit file export.')
  try {
    return ok(await store.writeBrandKit(kit))
  } catch (error) {
    return fail(sanitizeHostError(error))
  }
}

async function exportStarter(
  store: RuntimeStore,
  state: HeadlessProjectState,
  request: ControlRequest & { readonly operation: Extract<ControlOperation, { readonly type: 'export.starter' }> },
): Promise<DispatchResult> {
  let plan: StarterPlan
  try {
    plan = await compileHeadlessStarter(state, request.operation.framework)
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Unable to compile the Starter Plan.')
  }
  if (request.mode === 'dry-run') {
    return ok(starterPlanSummary(plan, state.policy.requireApprovalForExternal))
  }
  if (!isStarterExportStore(store)) return fail('This runtime store does not support Starter file export.')
  try {
    return ok(await store.writeStarter(plan))
  } catch (error) {
    return fail(sanitizeHostError(error))
  }
}

/**
 * v1 uses only facts already represented in Design IR. It intentionally does
 * not infer UI components from pixels or source code: an empty, validated
 * component manifest is preferable to exporting invented executable code.
 */
async function compileHeadlessStarter(
  state: HeadlessProjectState,
  framework: Extract<ControlOperation, { readonly type: 'export.starter' }>['framework'],
): Promise<StarterPlan> {
  const kit = await compileHeadlessDesignKit(state.design)
  const componentOutput = await compileComponentCandidates({ document: state.design, candidates: [] })
  const manifestFile = componentOutput.files.find((file) => file.path === 'components.manifest.json')
  if (!manifestFile) throw new Error('Component compiler did not emit a component manifest.')
  const candidates = JSON.parse(manifestFile.content) as ComponentManifest
  return compileStarter({ framework, document: state.design, kit, candidates, assetBindings: [], mergePolicy: 'fail' })
}

function starterPlanSummary(plan: StarterPlan, requiresApproval: boolean) {
  const starterId = starterExportId(plan)
  return {
    starterId,
    framework: plan.framework,
    revisionId: plan.source.revisionId,
    documentFingerprint: plan.source.documentFingerprint,
    planSha256: starterPlanFingerprint(plan),
    directory: `.cutout/exports/starter/${starterId}`,
    mergePolicy: plan.mergePolicy,
    files: plan.files.map((file) => ({ path: file.path, sha256: file.sha256, byteLength: new TextEncoder().encode(file.content).byteLength })),
    assets: plan.assets.map((asset) => ({ outputPath: asset.outputPath, sha256: asset.sha256 ?? null, mediaType: asset.mediaType ?? null })),
    apply: { requiresApproval },
  }
}

async function exportDesignKit(
  store: RuntimeStore,
  state: HeadlessProjectState,
  request: ControlRequest & { readonly operation: Extract<ControlOperation, { readonly type: 'export.design-kit' }> },
): Promise<DispatchResult> {
  if (request.operation.format !== 'directory') {
    return fail('Headless Design Kit v1 supports only the directory format.')
  }
  let kit
  try {
    kit = await compileHeadlessDesignKit(state.design)
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Unable to compile the Design Kit.')
  }
  const plan = designKitPlan(kit)
  if (request.mode === 'dry-run') return ok({ ...plan, apply: { requiresApproval: state.policy.requireApprovalForExternal } })
  if (!isDesignKitExportStore(store)) return fail('This runtime store does not support Design Kit file export.')
  try {
    return ok(await store.writeDesignKit(kit))
  } catch (error) {
    return fail(sanitizeHostError(error))
  }
}

function sanitizeHostError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unable to write the Design Kit.'
  return message
    .replace(/(?:\/Users\/|\/home\/|[A-Z]:\\)[^\s)]+/g, '<local-path>')
    .replace(/(?:\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b|\bBearer\s+[A-Za-z0-9._~+/-]+)/gi, '<redacted>')
    .slice(0, 1200)
}

function designKitPlan(kit: Awaited<ReturnType<typeof compileHeadlessDesignKit>>) {
  const kitId = safeKitId(kit.source.documentId, kit.source.revisionId, kit.source.documentFingerprint)
  return {
    kitId,
    revisionId: kit.source.revisionId,
    documentFingerprint: kit.source.documentFingerprint,
    directory: `.cutout/exports/design-kit/${kitId}`,
    files: kit.files.map((file) => ({ path: file.path, sha256: file.sha256, byteLength: new TextEncoder().encode(file.content).byteLength })),
  }
}

function brandKitPlan(kit: Awaited<ReturnType<typeof compileBrandKit>>) {
  const brandKitId = safeBrandKitId(kit)
  return {
    brandKitId,
    revisionId: kit.source.revisionId,
    brandId: kit.source.brandId,
    documentFingerprint: kit.source.documentFingerprint,
    definitionFingerprint: kit.source.definitionFingerprint,
    directory: `.cutout/exports/brand-kit/${brandKitId}`,
    files: kit.files.map((file) => ({ path: file.path, sha256: file.sha256, byteLength: new TextEncoder().encode(file.content).byteLength })),
  }
}

function safeKitId(documentId: string, revisionId: string, fingerprint: string): string {
  const segment = (value: string) => {
    const result = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
    if (!result) throw new Error('Design Kit source has no safe project/revision identifier.')
    return result
  }
  return `${segment(documentId)}--${segment(revisionId)}--${fingerprint.slice(0, 16).toLowerCase()}`
}

function safeBrandKitId(kit: Awaited<ReturnType<typeof compileBrandKit>>): string {
  const segment = (value: string) => {
    const result = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
    if (!result) throw new Error('Brand Kit source has no safe project, revision, or brand identifier.')
    return result
  }
  return `${segment(kit.source.documentId)}--${segment(kit.source.revisionId)}--${segment(kit.source.brandId)}--${kit.source.documentFingerprint.slice(0, 16).toLowerCase()}--${kit.source.definitionFingerprint.slice(0, 16).toLowerCase()}`
}

function isDesignKitExportStore(store: RuntimeStore): store is RuntimeStore & {
  writeDesignKit(kit: Awaited<ReturnType<typeof compileHeadlessDesignKit>>): Promise<unknown>
} {
  return typeof (store as { writeDesignKit?: unknown }).writeDesignKit === 'function'
}

function isBrandKitExportStore(store: RuntimeStore): store is RuntimeStore & {
  writeBrandKit(kit: Awaited<ReturnType<typeof compileBrandKit>>): Promise<unknown>
} {
  return typeof (store as { writeBrandKit?: unknown }).writeBrandKit === 'function'
}

function isStarterExportStore(store: RuntimeStore): store is RuntimeStore & {
  writeStarter(plan: StarterPlan): Promise<unknown>
} {
  return typeof (store as { writeStarter?: unknown }).writeStarter === 'function'
}

function projectContext(state: HeadlessProjectState, include: readonly ('summary' | 'outcome' | 'run-events')[] | undefined) {
  const result: Record<string, unknown> = {
    project: { ...state.manifest.project },
    design: { version: state.design.version, revision: state.design.revision.number, title: state.design.meta.title },
  }
  if (!include || include.includes('summary')) {
    result.summary = {
      needs: state.design.needs.length,
      sources: state.design.sources.length,
      tokens: state.design.tokens.length,
      components: state.design.components.length,
      materials: state.design.materials.length,
    }
  }
  return result
}

function materialList(
  state: HeadlessProjectState,
  filter: { readonly kind?: 'design-system' | 'prototype-page' | 'cutout-slice' | 'design-markdown'; readonly pageId?: string } | undefined,
) {
  const artifacts = new Map(state.artifactIndex.artifacts.map((artifact) => [artifact.sha256, artifact]))
  return {
    materials: state.design.materials
      .filter((material) => !filter?.kind || material.kind === filter.kind)
      .filter((material) => !filter?.pageId || material.id === filter.pageId)
      .map((material) => {
        const revision = material.revisions.find(({ id }) => id === material.currentRevisionId)
        if (!revision?.content.sha256) return { id: material.id, kind: material.kind, name: material.name, revisionId: material.currentRevisionId, artifact: null }
        return {
          id: material.id,
          kind: material.kind,
          name: material.name,
          revisionId: revision.id,
          artifact: artifacts.get(revision.content.sha256) ?? null,
        }
      }),
  }
}

function validate(state: HeadlessProjectState, scopes: readonly ('design' | 'tokens' | 'materials' | 'outcome')[]) {
  const checks = scopes.map((scope) => {
    switch (scope) {
      case 'design': {
        const result = validateDesignDocument(state.design)
        return result.ok ? { scope, valid: true } : { scope, valid: false, message: result.error }
      }
      case 'tokens': return validateTokens(state)
      case 'materials': return validateMaterials(state)
      case 'outcome': return { scope, valid: true, message: 'Outcome runtime is not persisted by this headless v1 host.' }
    }
  })
  return { valid: checks.every((check) => check.valid), checks }
}

function validateTokens(state: HeadlessProjectState) {
  const names = new Set<string>()
  for (const token of state.design.tokens) {
    if (names.has(token.name)) return { scope: 'tokens' as const, valid: false, message: `Duplicate token name: ${token.name}` }
    names.add(token.name)
  }
  return { scope: 'tokens' as const, valid: true }
}

function validateMaterials(state: HeadlessProjectState) {
  const known = new Set(state.artifactIndex.artifacts.map(({ sha256 }) => sha256))
  for (const material of state.design.materials) {
    for (const revision of material.revisions) {
      const digest = revision.content.sha256
      if (digest && !known.has(digest)) return { scope: 'materials' as const, valid: false, message: `Missing artifact index entry: ${digest}` }
    }
  }
  return { scope: 'materials' as const, valid: true }
}

function previewDesignPatch(
  state: HeadlessProjectState,
  patches: readonly { readonly op: 'replace' | 'append'; readonly path: '/designMarkdown' | '/project/name'; readonly value: string }[],
): DispatchResult {
  let markdown = state.designMarkdown
  let projectName = state.manifest.project.name
  const changes: Array<{ path: string; before: string; after: string }> = []
  for (const patch of patches) {
    const before = patch.path === '/designMarkdown' ? markdown : projectName
    const after = patch.op === 'append' ? `${before}${patch.value}` : patch.value
    if (patch.path === '/designMarkdown') markdown = after
    else projectName = after
    changes.push({ path: patch.path, before, after })
  }
  return ok({ operation: 'design.patch', changes })
}

function previewTokensPatch(
  state: HeadlessProjectState,
  changes: readonly { readonly token: string; readonly value: string | number }[],
): DispatchResult {
  const byName = new Map(state.design.tokens.map((token) => [token.name, token]))
  const preview: Array<{ token: string; before: string; after: string | number }> = []
  for (const change of changes) {
    const token = byName.get(change.token)
    if (!token) return fail(`Unknown Design IR token: ${change.token}`)
    preview.push({ token: change.token, before: token.value, after: change.value })
  }
  return ok({ operation: 'tokens.patch', changes: preview })
}

function isPatch(request: ControlRequest) {
  return request.operation.type === 'design.patch' || request.operation.type === 'tokens.patch'
}

function response(
  request: ControlRequest,
  revision: number,
  status: ControlResponse['status'],
  dryRun: boolean,
  idempotent: boolean,
  result?: unknown,
  error?: ControlResponse['error'],
): ControlResponse {
  return {
    protocol: 'cutout.control.v1', requestId: request.requestId, status, revision, dryRun, idempotent,
    ...(result === undefined ? {} : { result: redactControlValue(result) }),
    ...(error ? { error } : {}),
  }
}

function invalidResponse(input: unknown, message: string): ControlResponse {
  const candidate = input && typeof input === 'object' && typeof (input as { requestId?: unknown }).requestId === 'string'
    ? (input as { requestId: string }).requestId
    : null
  // Never reflect malformed / credential-shaped request IDs in an error.
  const requestId = candidate && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(candidate) && !/(?:\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b|\bBearer\s+)/i.test(candidate)
    ? candidate
    : 'invalid-request'
  return { protocol: 'cutout.control.v1', requestId, status: 'invalid', revision: 0, dryRun: false, idempotent: false, error: { code: 'invalid-request', message } }
}

function ok(result: unknown, nextState?: HeadlessProjectState): DispatchResult {
  return { ok: true, result, ...(nextState ? { nextState } : {}) }
}
function fail(message: string): DispatchResult { return { ok: false, message } }

/** Guard used by filesystem adapters and tests when inspecting foreign indexes. */
export function validateArtifactIndex(input: unknown): readonly ArtifactRecord[] {
  return artifactIndexSchema.parse(input).artifacts
}
