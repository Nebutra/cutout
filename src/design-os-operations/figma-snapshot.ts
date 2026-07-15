import type { ConnectorContext, ConnectorImport, ConnectorPreview } from '@/connectors'
import { createFigmaConnector, figmaBindingManifestSchema, type FigmaBindingManifest, type FigmaSnapshot } from '@/connectors/figma'
import { validateDesignDocument, type DesignDocument } from '@/design-ir'
import { err, isErr, ok, type BundleRepository, type BundleSaveReceipt, type Result } from '@/services/types'

export interface FigmaSnapshotPreview {
  readonly id: string
  readonly base: { readonly documentId: string; readonly revisionId: string; readonly revisionNumber: number }
  readonly snapshot: FigmaSnapshot
  readonly summary: string
  readonly warnings: readonly string[]
  readonly tokenCount: number
  readonly componentCount: number
  readonly codeConnectCount: number
  readonly collectionCount: number
  readonly bindings: FigmaBindingManifest
}

function guard(document: DesignDocument) {
  return { documentId: document.meta.id, revisionId: document.revision.id, revisionNumber: document.revision.number }
}

function input(snapshot: FigmaSnapshot) {
  return { sourceKind: 'figma' as const, locator: `figma://file/${snapshot.file.key}`, metadata: { snapshot } }
}

export async function prepareFigmaSnapshot(document: DesignDocument, candidate: unknown): Promise<Result<FigmaSnapshotPreview>> {
  const current = guard(document)
  const result = await createFigmaConnector().preview!({
    sourceKind: 'figma', locator: 'caller-authorized-snapshot', metadata: { snapshot: candidate },
  }, context(current))
  if (!result.ok) return err(result.error.message)
  const preview = result.data as ConnectorPreview
  const details = preview.details as FigmaBindingManifest & { tokenCount: number; componentCount: number }
  const snapshot = candidate as FigmaSnapshot
  const { tokenCount, componentCount, warnings: _warnings, ...bindingFields } = details as typeof details & { warnings?: unknown }
  return ok({
    id: `figma-preview:${snapshot.file.key}:${current.revisionId}`,
    base: current,
    snapshot,
    summary: preview.summary,
    warnings: preview.warnings,
    tokenCount,
    componentCount,
    codeConnectCount: details.codeConnectHints.length,
    collectionCount: details.collections.length,
    bindings: figmaBindingManifestSchema.parse(bindingFields),
  })
}

export async function applyFigmaSnapshot(
  document: DesignDocument,
  preview: FigmaSnapshotPreview,
  options: { readonly revisionId: string; readonly createdAt: string },
): Promise<Result<DesignDocument>> {
  const current = guard(document)
  if (JSON.stringify(current) !== JSON.stringify(preview.base)) return err('Connector request targets a stale DesignDocument revision.')
  const result = await createFigmaConnector().import!(input(preview.snapshot), context(preview.base))
  if (!result.ok) return err(result.error.message)
  const imported = result.data as ConnectorImport
  const conflicts = findConflicts(document, imported)
  if (conflicts.length) return err(`Figma import conflicts with current Design IR: ${conflicts.join(', ')}.`)
  const patch = imported.designPatch
  const sourcePatch = imported.sourcePatch
  const next: DesignDocument = {
    ...document,
    meta: { ...document.meta, updatedAt: options.createdAt },
    revision: {
      id: options.revisionId, number: document.revision.number + 1, createdAt: options.createdAt,
      author: { kind: 'import', id: 'figma.snapshot' },
    },
    sources: merge(document.sources, sourcePatch?.sources ?? []),
    tokens: merge(document.tokens, patch?.tokens ?? []),
    components: merge(document.components, patch?.components ?? []),
    provenance: merge(document.provenance, [...(sourcePatch?.provenance ?? []), ...(patch?.provenance ?? [])]),
    relations: merge(document.relations, patch?.relations ?? []),
  }
  const validation = validateDesignDocument(next)
  return validation.ok ? ok(validation.data.document) : err(validation.error)
}

export async function exportFigmaVariables(
  document: DesignDocument,
  bindings: FigmaBindingManifest,
  repository: BundleRepository,
): Promise<Result<BundleSaveReceipt>> {
  const current = guard(document)
  const verifiedTokenIds = document.tokens
    .filter((token) => bindings.variableBindings.some((binding) => binding.tokenId === token.id))
    .map((token) => token.id)
  const result = await createFigmaConnector().export!(
    { sourceKind: 'figma', locator: `figma://file/${bindings.fileKey}`, metadata: { exportRequest: {
      document: current, tokens: document.tokens, components: document.components, verifiedTokenIds, bindings,
    } } }, context(current))
  if (!result.ok) return err(result.error.message)
  const saved = await repository.save({
    name: `figma-${bindings.fileKey}`,
    files: result.data.plan.files.map((file) => ({ path: file.path, content: file.content ?? '' })),
  })
  return isErr(saved) ? saved : ok(saved.data)
}

function context(base: ReturnType<typeof guard>): ConnectorContext {
  return { base, now: () => new Date().toISOString(), signal: new AbortController().signal }
}

function merge<T extends { readonly id: string }>(current: readonly T[], incoming: readonly T[]): T[] {
  const byId = new Map(current.map((item) => [item.id, item]))
  incoming.forEach((item) => byId.set(item.id, item))
  return [...byId.values()]
}

function findConflicts(document: DesignDocument, imported: ConnectorImport): string[] {
  const pairs = [
    [document.sources, imported.sourcePatch?.sources ?? []],
    [document.tokens, imported.designPatch?.tokens ?? []],
    [document.components, imported.designPatch?.components ?? []],
  ] as const
  return pairs.flatMap(([existing, incoming]) => incoming.flatMap((candidate) => {
    const found = existing.find((item) => item.id === candidate.id)
    return found && JSON.stringify(found) !== JSON.stringify(candidate) ? [candidate.id] : []
  }))
}
