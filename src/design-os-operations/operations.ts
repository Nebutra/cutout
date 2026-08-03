import {
  compileBrandKit,
  createBrandViGenerationPlan,
  type BrandKit,
  type BrandKitDefinition,
  type BrandViGenerationPlan,
  type BrandViPlanRequest,
} from '@/brand-kit'
import {
  compileComponentCandidates,
  type ComponentCandidate,
  type ComponentCompilerOutput,
  type ComponentManifest,
} from '@/components-compiler'
import {
  compileDesignKit,
  type DesignKit,
  type DesignKitTokenInput,
  type SelectedDesignMarkdownInput,
} from '@/design-kit'
import { validateDesignDocument, type DesignDocument } from '@/design-ir'
import {
  applySourcePatch,
  ingestEverything,
  type EverythingInput,
  type IngestionSkip,
  type SourcePatch,
} from '@/ingestion/everything-inbox'
import {
  err,
  ok,
  type BundleRepository,
  type BundleSaveReceipt,
  type BundleToSave,
  type Result,
} from '@/services/types'
import {
  compileStarter,
  type StarterAssetBinding,
  type StarterCompilerInput,
  type StarterPlan,
} from '@/starter-compiler'

export type DesignOsOperationId = 'source-ingest' | 'design-kit' | 'brand-kit' | 'components' | 'starter'
export type ReadinessState = 'ready' | 'needs-input' | 'blocked'

export interface ReadinessReason {
  readonly code:
    | 'invalid-document'
    | 'missing-source'
    | 'missing-token'
    | 'missing-brand'
    | 'missing-brand-evidence'
    | 'missing-prototype'
    | 'missing-component'
    | 'component-not-ready'
  readonly message: string
}

export interface OperationReadiness {
  readonly id: DesignOsOperationId
  readonly state: ReadinessState
  readonly reasons: readonly ReadinessReason[]
}

export interface DesignOsReadiness {
  readonly documentId: string
  readonly revisionId: string
  readonly revisionNumber: number
  readonly operations: Readonly<Record<DesignOsOperationId, OperationReadiness>>
}

export function buildDesignOsReadiness(document: DesignDocument): DesignOsReadiness {
  const validation = validateDesignDocument(document)
  const invalid = validation.ok ? [] : [reason('invalid-document', validation.error)]
  const activeBrands = document.brands.filter((brand) => brand.status === 'active')
  const attributableSources = document.sources.filter((source) =>
    source.license.kind !== 'unknown'
    && document.provenance.some((record) => record.sourceIds.includes(source.id)),
  )
  const readyComponents = document.components.filter((component) => component.status === 'ready')

  const operations = {
    'source-ingest': readiness('source-ingest', invalid),
    'design-kit': readiness('design-kit', [
      ...invalid,
      ...(document.tokens.length === 0 ? [reason('missing-token', 'At least one explicit Design IR token is required.')] : []),
    ]),
    'brand-kit': readiness('brand-kit', [
      ...invalid,
      ...(activeBrands.length === 0 ? [reason('missing-brand', 'An active brand declaration is required.')] : []),
      ...(document.sources.length === 0 ? [reason('missing-source', 'Brand kit claims require licensed source evidence.')] : []),
      ...(document.sources.length > 0 && attributableSources.length === 0
        ? [reason('missing-brand-evidence', 'No licensed source has matching provenance evidence.')]
        : []),
    ]),
    components: readiness('components', [
      ...invalid,
      ...(!document.prototype ? [reason('missing-prototype', 'A structured prototype is required to bind component candidates.')] : []),
      ...(document.components.length === 0 ? [reason('missing-component', 'At least one explicit component declaration is required.')] : []),
    ]),
    starter: readiness('starter', [
      ...invalid,
      ...(!document.prototype ? [reason('missing-prototype', 'A structured prototype is required for starter routes.')] : []),
      ...(document.tokens.length === 0 ? [reason('missing-token', 'A compiled starter requires explicit design tokens.')] : []),
      ...(document.components.length === 0 ? [reason('missing-component', 'A compiled starter requires components.')] : []),
      ...(document.components.length > 0 && readyComponents.length === 0
        ? [reason('component-not-ready', 'At least one component must be explicitly marked ready.')]
        : []),
    ]),
  } satisfies Record<DesignOsOperationId, OperationReadiness>

  return {
    documentId: document.meta.id,
    revisionId: document.revision.id,
    revisionNumber: document.revision.number,
    operations,
  }
}

function reason(code: ReadinessReason['code'], message: string): ReadinessReason {
  return { code, message }
}

function readiness(id: DesignOsOperationId, reasons: readonly ReadinessReason[]): OperationReadiness {
  if (reasons.some((entry) => entry.code === 'invalid-document')) return { id, state: 'blocked', reasons }
  return { id, state: reasons.length === 0 ? 'ready' : 'needs-input', reasons }
}

export interface SourceIngestPreview {
  readonly kind: 'source-ingest-preview'
  readonly base: RevisionGuard
  readonly patch: SourcePatch
  readonly skipped: readonly IngestionSkip[]
  readonly impact: {
    readonly sourcesAdded: number
    readonly provenanceAdded: number
    readonly nextRevisionNumber: number
    readonly noChanges: boolean
  }
}

export interface RevisionGuard {
  readonly documentId: string
  readonly revisionId: string
  readonly revisionNumber: number
}

export interface PrepareSourceIngestOptions {
  readonly capturedAt?: string
  readonly actorId?: string
}

export async function prepareSourceIngest(
  document: DesignDocument,
  input: EverythingInput,
  options: PrepareSourceIngestOptions = {},
): Promise<Result<SourceIngestPreview>> {
  const validation = validateDesignDocument(document)
  if (!validation.ok) return err(`Invalid DesignDocument: ${validation.error}`)
  const ingestion = await ingestEverything(input, {
    ...options,
    existingSources: document.sources,
  })
  if (!ingestion.ok) return ingestion
  const { patch, skipped } = ingestion.data
  const noChanges = patch.sources.length === 0 && patch.provenance.length === 0
  return ok({
    kind: 'source-ingest-preview',
    base: revisionGuard(document),
    patch,
    skipped,
    impact: {
      sourcesAdded: patch.sources.length,
      provenanceAdded: patch.provenance.length,
      nextRevisionNumber: noChanges ? document.revision.number : document.revision.number + 1,
      noChanges,
    },
  })
}

export async function prepareSourceIngestBatch(
  document: DesignDocument,
  inputs: readonly EverythingInput[],
  options: PrepareSourceIngestOptions = {},
): Promise<Result<SourceIngestPreview>> {
  const validation = validateDesignDocument(document)
  if (!validation.ok) return err(`Invalid DesignDocument: ${validation.error}`)
  const sources = [...document.sources]
  const sourcesToAdd: SourcePatch['sources'][number][] = []
  const provenanceToAdd: SourcePatch['provenance'][number][] = []
  const skipped: IngestionSkip[] = []
  for (const input of inputs) {
    const ingestion = await ingestEverything(input, { ...options, existingSources: sources })
    if (!ingestion.ok) return ingestion
    sources.push(...ingestion.data.patch.sources)
    sourcesToAdd.push(...ingestion.data.patch.sources)
    provenanceToAdd.push(...ingestion.data.patch.provenance)
    skipped.push(...ingestion.data.skipped)
  }
  const patch: SourcePatch = { sources: sourcesToAdd, provenance: provenanceToAdd }
  const noChanges = patch.sources.length === 0 && patch.provenance.length === 0
  return ok({ kind: 'source-ingest-preview', base: revisionGuard(document), patch, skipped, impact: { sourcesAdded: patch.sources.length, provenanceAdded: patch.provenance.length, nextRevisionNumber: noChanges ? document.revision.number : document.revision.number + 1, noChanges } })
}

export interface ApplySourceIngestOptions {
  readonly revisionId: string
  readonly createdAt: string
  readonly actorId?: string
}

export function applyPreparedSourceIngest(
  document: DesignDocument,
  preview: SourceIngestPreview,
  options: ApplySourceIngestOptions,
): Result<DesignDocument> {
  if (document.meta.id !== preview.base.documentId) return err('Source ingest preview belongs to another DesignDocument.')
  if (patchAlreadyApplied(document, preview.patch)) return ok(document)
  if (document.revision.id !== preview.base.revisionId || document.revision.number !== preview.base.revisionNumber) {
    return err(
      `Revision conflict: preview targets ${preview.base.revisionId} (#${preview.base.revisionNumber}), `
      + `but current document is ${document.revision.id} (#${document.revision.number}).`,
    )
  }
  if (preview.impact.noChanges) return ok(document)
  return applySourcePatch(document, preview.patch, {
    id: options.revisionId,
    createdAt: options.createdAt,
    actor: { kind: 'import', id: options.actorId ?? 'design-os:source-ingest' },
  })
}

function patchAlreadyApplied(document: DesignDocument, patch: SourcePatch): boolean {
  if (patch.sources.length === 0 && patch.provenance.length === 0) return true
  return patch.sources.every((candidate) =>
    document.sources.some((existing) => existing.id === candidate.id && same(existing, candidate)),
  ) && patch.provenance.every((candidate) =>
    document.provenance.some((existing) => existing.id === candidate.id && same(existing, candidate)),
  )
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function revisionGuard(document: DesignDocument): RevisionGuard {
  return {
    documentId: document.meta.id,
    revisionId: document.revision.id,
    revisionNumber: document.revision.number,
  }
}

export async function compileDesignKitOperation(
  document: DesignDocument,
  tokens?: readonly DesignKitTokenInput[],
  selectedDesignMarkdown?: SelectedDesignMarkdownInput,
): Promise<Result<DesignKit>> {
  if (!tokens || tokens.length === 0) return err('Design Kit compilation requires explicit token adapter inputs.')
  return capture(() => compileDesignKit({
    document,
    tokens: [...tokens],
    ...(selectedDesignMarkdown ? { selectedDesignMarkdown } : {}),
  }))
}

export async function compileBrandKitOperation(
  document: DesignDocument,
  brand?: BrandKitDefinition,
): Promise<Result<BrandKit>> {
  if (!brand) return err('Brand Kit compilation requires an explicit, evidence-backed brand definition.')
  return capture(() => compileBrandKit({ document, brand }))
}

/**
 * Build a reviewable Brand VI DAG without invoking a provider or spending credits.
 * Paid image generation/edit nodes remain plans until a separate approved tool invocation.
 */
export function planBrandViOperation(request: BrandViPlanRequest): Result<BrandViGenerationPlan> {
  try {
    return ok(createBrandViGenerationPlan(request))
  } catch (cause) {
    return err(cause instanceof Error ? cause.message : String(cause))
  }
}

export async function compileComponentsOperation(
  document: DesignDocument,
  candidates?: readonly ComponentCandidate[],
): Promise<Result<ComponentCompilerOutput>> {
  if (!candidates || candidates.length === 0) return err('Component compilation requires explicit candidate declarations.')
  return capture(() => compileComponentCandidates({ document, candidates: [...candidates] }))
}

export interface StarterOperationInput {
  readonly framework: StarterCompilerInput['framework']
  readonly kit?: DesignKit
  readonly candidates?: ComponentManifest
  readonly assetBindings?: readonly StarterAssetBinding[]
  readonly existingPaths?: readonly string[]
}

export async function compileStarterOperation(
  document: DesignDocument,
  input: StarterOperationInput,
): Promise<Result<StarterPlan>> {
  if (!input.kit) return err('Starter compilation requires an explicit Design Kit.')
  if (!input.candidates) return err('Starter compilation requires an explicit Component Manifest.')
  const kit = input.kit
  const candidates = input.candidates
  return capture(() => compileStarter({
    framework: input.framework,
    document,
    kit,
    candidates,
    assetBindings: input.assetBindings ? [...input.assetBindings] : [],
    mergePolicy: 'fail',
    existingPaths: input.existingPaths ? [...input.existingPaths] : [],
  }))
}

async function capture<T>(operation: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await operation())
  } catch (cause) {
    return err(cause instanceof Error ? cause.message : String(cause))
  }
}

export type DesignOsBundle = DesignKit | BrandKit | ComponentCompilerOutput | StarterPlan
export type DesignOsBundleKind = 'design-kit' | 'brand-kit' | 'components' | 'starter'

export interface BundleExportRequest<TBundle extends DesignOsBundle = DesignOsBundle> {
  readonly kind: DesignOsBundleKind
  readonly bundle: TBundle
  /** Safe directory name only. The desktop repository always asks the user for the parent directory. */
  readonly name: string
}

export async function exportCompiledBundle(
  document: DesignDocument,
  repository: BundleRepository,
  request: BundleExportRequest,
): Promise<Result<BundleSaveReceipt>> {
  if (!bundleMatchesRevision(request.bundle, document)) {
    return err('Compiled bundle does not belong to the current DesignDocument revision.')
  }
  const bundle = bundleToSave(request)
  if (!bundle.ok) return bundle
  return repository.save(bundle.data)
}

function bundleMatchesRevision(bundle: DesignOsBundle, document: DesignDocument): boolean {
  return bundle.source.documentId === document.meta.id && bundle.source.revisionId === document.revision.id
}

function bundleToSave(request: BundleExportRequest): Result<BundleToSave> {
  if (request.bundle.version === 'starter-plan.v1' && request.bundle.assets.length > 0) {
    return err('Starter export contains unresolved binary assets; provide them through a content resolver before export.')
  }
  const files = request.bundle.files.map((file) => ({ path: file.path, content: file.content }))
  if (files.length === 0) return err(`Compiled ${request.kind} bundle contains no files.`)
  return ok({ name: request.name, files })
}
