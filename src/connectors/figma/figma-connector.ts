import {
  CONNECTOR_PROTOCOL,
  type Connector,
  type ConnectorContext,
  type ConnectorError,
  type ConnectorExport,
  type ConnectorImport,
  type ConnectorInput,
  type ConnectorPreview,
  type ConnectorResult,
} from '@/connectors'
import { legacyConnectorAsIntegration } from '../integration-compat'
import {
  canonicalJson,
  type DesignComponent,
  type DesignRelation,
  type DesignToken,
  type Provenance,
} from '@/design-ir'
import type { DesignSource } from '@/design-ir'
import {
  figmaBindingManifestSchema,
  figmaExportRequestSchema,
  figmaSnapshotSchema,
  type FigmaBindingManifest,
  type FigmaSnapshot,
  type FigmaVariableValue,
} from './schema'

const CONNECTOR_ID = 'figma.snapshot'
const CONNECTOR_VERSION = '1.0.0'

export function createFigmaIntegration() {
  return legacyConnectorAsIntegration(createFigmaConnector(), {
    provider: { id: 'figma', name: 'Figma' },
    product: { id: 'figma', name: 'Figma' },
    domains: ['design-files', 'design-tokens', 'components'],
  })
}

export function createFigmaConnector(): Connector {
  return {
    manifest: {
      protocol: CONNECTOR_PROTOCOL,
      id: CONNECTOR_ID,
      name: 'Figma Snapshot',
      version: CONNECTOR_VERSION,
      availability: 'available',
      capabilities: [
        { operation: 'preview', sourceKinds: ['figma'] },
        { operation: 'import', sourceKinds: ['figma'] },
        { operation: 'export', sourceKinds: ['figma'] },
      ],
      auth: { kind: 'host-session' },
    },
    preview: async (input, context) => previewFigmaSnapshot(input, context),
    import: async (input, context) => importFigmaSnapshot(input, context),
    export: async (input, context) => exportFigmaPlan(input, context),
  }
}

async function previewFigmaSnapshot(
  input: ConnectorInput,
  context: ConnectorContext,
): Promise<ConnectorResult<ConnectorPreview>> {
  const aborted = abortResult<ConnectorPreview>(context)
  if (aborted) return aborted
  const parsed = parseSnapshot(input)
  if (!parsed.ok) return parsed
  const transformed = transformSnapshot(parsed.data, context)
  if (!transformed.ok) return transformed
  const details = transformed.data.bindings
  const warnings = snapshotWarnings(parsed.data)
  return success({
    kind: 'connector-preview', connectorId: CONNECTOR_ID, base: context.base, sourceKind: 'figma',
    summary: `${parsed.data.file.name}: ${transformed.data.tokens.length} token modes, ${transformed.data.components.length} component records.`,
    warnings,
    provenance: connectorProvenance('preview', parsed.data, context.now()),
    details: {
      ...details,
      tokenCount: transformed.data.tokens.length,
      componentCount: transformed.data.components.length,
      warnings,
    },
  })
}

async function importFigmaSnapshot(
  input: ConnectorInput,
  context: ConnectorContext,
): Promise<ConnectorResult<ConnectorImport>> {
  const aborted = abortResult<ConnectorImport>(context)
  if (aborted) return aborted
  const startedAt = context.now()
  const parsed = parseSnapshot(input)
  if (!parsed.ok) return parsed
  const transformed = transformSnapshot(parsed.data, context)
  if (!transformed.ok) return transformed
  const completedAt = context.now()
  const result: ConnectorImport & { readonly details: FigmaBindingManifest } = {
    kind: 'connector-import', connectorId: CONNECTOR_ID, base: context.base,
    sourcePatch: { sources: [transformed.data.source], provenance: [transformed.data.provenance] },
    designPatch: {
      tokens: transformed.data.tokens,
      components: transformed.data.components,
      relations: transformed.data.relations,
    },
    receipt: receipt('import', parsed.data, startedAt, completedAt),
    details: transformed.data.bindings,
  }
  return success(result)
}

async function exportFigmaPlan(
  input: ConnectorInput,
  context: ConnectorContext,
): Promise<ConnectorResult<ConnectorExport>> {
  const aborted = abortResult<ConnectorExport>(context)
  if (aborted) return aborted
  if (input.sourceKind !== 'figma') return failure('capability-mismatch', 'Figma connector only accepts figma sources.')
  const candidate = input.metadata?.exportRequest
  const guard = figmaExportRequestSchema.shape.document.safeParse(
    typeof candidate === 'object' && candidate !== null
      ? (candidate as { readonly document?: unknown }).document
      : undefined,
  )
  if (guard.success && !sameGuard(guard.data, context.base)) {
    return failure('stale-revision', 'Figma export request does not match the current DesignDocument revision.')
  }
  const parsed = figmaExportRequestSchema.safeParse(candidate)
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? 'Invalid Figma export request.')
  const request = parsed.data
  const compiled = compileExport(request)
  if (!compiled.ok) return compiled
  const startedAt = context.now()
  const pseudoSnapshot = { file: { key: request.bindings.fileKey, version: undefined } } as FigmaSnapshot
  return success({
    kind: 'connector-export', connectorId: CONNECTOR_ID, base: context.base,
    plan: {
      name: `figma-${request.bindings.fileKey}`,
      files: [
        { path: 'figma-variables.json', mediaType: 'application/json', content: canonicalJson(compiled.data.variables) },
        { path: 'figma-component-bindings.json', mediaType: 'application/json', content: canonicalJson(compiled.data.components) },
      ],
      warnings: snapshotWarningsFromBindings(request.bindings),
    },
    receipt: receipt('export', pseudoSnapshot, startedAt, context.now()),
  })
}

function parseSnapshot(input: ConnectorInput): ConnectorResult<FigmaSnapshot> {
  if (input.sourceKind !== 'figma') return failure('capability-mismatch', 'Figma connector only accepts figma sources.')
  const parsed = figmaSnapshotSchema.safeParse(input.metadata?.snapshot)
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? 'Invalid authorized Figma snapshot.')
  return success(parsed.data)
}

function transformSnapshot(snapshot: FigmaSnapshot, context: ConnectorContext): ConnectorResult<{
  source: DesignSource
  provenance: Provenance
  tokens: DesignToken[]
  components: DesignComponent[]
  relations: DesignRelation[]
  bindings: FigmaBindingManifest
}> {
  const duplicate = firstDuplicate(snapshot.variables.map((variable) => variable.id))
  if (duplicate) return invalid(`Duplicate Figma variable id "${duplicate}".`)
  const duplicateCollection = firstDuplicate(snapshot.collections.map((collection) => collection.id))
  if (duplicateCollection) return invalid(`Duplicate Figma collection id "${duplicateCollection}".`)
  const duplicateComponent = firstDuplicate(snapshot.components.map((component) => component.id))
  if (duplicateComponent) return invalid(`Duplicate Figma component id "${duplicateComponent}".`)
  const duplicateSet = firstDuplicate(snapshot.componentSets.map((set) => set.id))
  if (duplicateSet) return invalid(`Duplicate Figma component set id "${duplicateSet}".`)

  const collectionById = new Map(snapshot.collections.map((collection) => [collection.id, collection]))
  const variableById = new Map(snapshot.variables.map((variable) => [variable.id, variable]))
  for (const collection of snapshot.collections) {
    const duplicateMode = firstDuplicate(collection.modes.map((mode) => mode.id))
    if (duplicateMode) return invalid(`Figma collection "${collection.id}" has duplicate mode "${duplicateMode}".`)
    if (!collection.modes.some((mode) => mode.id === collection.defaultModeId)) {
      return invalid(`Figma collection "${collection.id}" has unknown default mode "${collection.defaultModeId}".`)
    }
  }
  for (const variable of snapshot.variables) {
    const collection = collectionById.get(variable.collectionId)
    if (!collection) return invalid(`Figma variable "${variable.id}" references unknown collection "${variable.collectionId}".`)
    const modeIds = new Set(collection.modes.map((mode) => mode.id))
    for (const mode of collection.modes) {
      if (!(mode.id in variable.valuesByMode)) return invalid(`Figma variable "${variable.id}" is missing mode "${mode.id}".`)
    }
    for (const modeId of Object.keys(variable.valuesByMode)) {
      if (!modeIds.has(modeId)) return invalid(`Figma variable "${variable.id}" has unknown mode "${modeId}".`)
    }
    for (const [modeId, value] of Object.entries(variable.valuesByMode)) {
      if (isAlias(value) && !variableById.has(value.id)) {
        return invalid(`Figma variable "${variable.id}" aliases unknown variable "${value.id}".`)
      }
      if (isAlias(value)) {
        const target = variableById.get(value.id)!
        if (target.collectionId !== variable.collectionId || !(modeId in target.valuesByMode)) {
          return invalid(`Cross-collection or cross-mode alias from "${variable.id}" to "${value.id}" is unsupported.`)
        }
      }
      if (!valueMatchesType(value, variable.resolvedType)) {
        return invalid(`Figma variable "${variable.id}" has a value incompatible with ${variable.resolvedType}.`)
      }
    }
  }

  const sourceId = `figma:file:${snapshot.file.key}`
  const provenanceId = `figma:import:${snapshot.file.key}:r${context.base.revisionNumber}`
  const externalRef = figmaFileUri(snapshot)
  const provenance: Provenance = {
    id: provenanceId, operation: 'import', sourceIds: [sourceId],
    actor: { kind: 'system', id: CONNECTOR_ID }, recordedAt: context.now(), tool: `${CONNECTOR_ID}@${CONNECTOR_VERSION}`,
  }
  const source: DesignSource = {
    id: sourceId, kind: 'figma', role: 'implementation', title: snapshot.file.name,
    license: { kind: 'unknown', rationale: 'License must be confirmed by the importing user.' },
    content: [{ id: `figma:file-content:${snapshot.file.key}`, uri: externalRef, mediaType: 'application/vnd.figma.snapshot+json' }],
  }

  const tokens: DesignToken[] = []
  const variableBindings: FigmaBindingManifest['variableBindings'][number][] = []
  for (const variable of snapshot.variables) {
    const collection = collectionById.get(variable.collectionId)!
    for (const mode of collection.modes) {
      const tokenId = tokenIdFor(variable.id, mode.id)
      const value = variable.valuesByMode[mode.id]!
      tokens.push({
        id: tokenId,
        name: variable.name,
        kind: tokenKind(variable.resolvedType),
        value: toIrValue(value, mode.id),
        mode: mode.name,
        provenanceId,
      })
      const importedValue = toIrValue(value, mode.id)
      variableBindings.push({
        tokenId, variableId: variable.id, collectionId: variable.collectionId,
        modeId: mode.id, resolvedType: variable.resolvedType, importedValue, originalValue: value,
      })
    }
  }

  const componentById = new Map(snapshot.components.map((component) => [component.id, component]))
  for (const hint of snapshot.codeConnectHints) {
    if (!componentById.has(hint.componentId)) return invalid(`Code Connect hint references unknown component "${hint.componentId}".`)
  }
  for (const node of snapshot.nodeRefs) {
    if (node.componentId && !componentById.has(node.componentId)) {
      return invalid(`Figma node "${node.id}" references unknown component "${node.componentId}".`)
    }
  }
  for (const set of snapshot.componentSets) {
    for (const componentId of set.componentIds) {
      if (!componentById.has(componentId)) return invalid(`Figma component set "${set.id}" references unknown component "${componentId}".`)
    }
  }
  const componentSets = new Set(snapshot.componentSets.map((set) => set.id))
  const components: DesignComponent[] = snapshot.componentSets.map((set) => ({
    id: componentSetIdFor(set.id), name: set.name, status: 'draft',
    description: 'Imported Figma component set metadata; variants and layout were not inferred.', tokenIds: [], provenanceId,
  }))
  for (const component of snapshot.components) {
    if (component.componentSetId && !componentSets.has(component.componentSetId)) {
      return invalid(`Figma component "${component.id}" references unknown component set "${component.componentSetId}".`)
    }
    const tokenIds = (component.variableIds ?? []).flatMap((variableId) => {
      const variable = variableById.get(variableId)
      if (!variable) return []
      const collection = collectionById.get(variable.collectionId)!
      return collection.modes.map((mode) => tokenIdFor(variableId, mode.id))
    })
    if ((component.variableIds ?? []).some((id) => !variableById.has(id))) {
      return invalid(`Figma component "${component.id}" references an unknown variable.`)
    }
    components.push({
      id: componentIdFor(component.id), name: component.name, status: 'draft',
      ...(component.description ? { description: component.description } : {}),
      tokenIds, provenanceId,
    })
  }

  const relations: DesignRelation[] = [
    ...tokens.map((token, index) => sourceEvidence(sourceId, 'token', token.id, provenanceId, index)),
    ...components.map((component, index) => sourceEvidence(sourceId, 'component', component.id, provenanceId, index)),
    ...components.flatMap((component, componentIndex) => component.tokenIds.map((tokenId, tokenIndex) => ({
      id: `figma:relation:component-token:${componentIndex}:${tokenIndex}`,
      kind: 'component-uses-token' as const,
      from: { kind: 'component' as const, id: component.id },
      to: { kind: 'token' as const, id: tokenId },
      provenanceId,
    }))),
  ]
  const bindings: FigmaBindingManifest = figmaBindingManifestSchema.parse({
    schemaVersion: 'figma.bindings.v1', fileKey: snapshot.file.key, sourceId,
    collections: snapshot.collections, variables: snapshot.variables, variableBindings,
    componentBindings: snapshot.components.map((component) => ({
      componentId: component.id, irComponentId: componentIdFor(component.id),
      ...(component.componentSetId ? { componentSetId: component.componentSetId } : {}),
    })),
    componentSets: snapshot.componentSets, components: snapshot.components,
    nodeRefs: snapshot.nodeRefs, codeConnectHints: snapshot.codeConnectHints,
  })
  return success({ source, provenance, tokens, components, relations, bindings })
}

function compileExport(request: ReturnType<typeof figmaExportRequestSchema.parse>): ConnectorResult<{
  variables: unknown
  components: unknown
}> {
  const bindings = request.bindings
  const duplicateToken = firstDuplicate(bindings.variableBindings.map((binding) => binding.tokenId))
  if (duplicateToken) return invalid(`Conflicting Figma binding for token "${duplicateToken}".`)
  const duplicateTarget = firstDuplicate(bindings.variableBindings.map((binding) => `${binding.variableId}:${binding.modeId}`))
  if (duplicateTarget) return invalid(`Conflicting Figma variable/mode binding "${duplicateTarget}".`)
  const verified = new Set(request.verifiedTokenIds)
  const tokenById = new Map(request.tokens.map((token) => [token.id, token]))
  const bindingByToken = new Map(bindings.variableBindings.map((binding) => [binding.tokenId, binding]))
  for (const tokenId of verified) {
    if (!tokenById.has(tokenId)) return invalid(`Verified token "${tokenId}" does not exist.`)
  }
  for (const binding of bindings.variableBindings) {
    if (!verified.has(binding.tokenId)) return invalid(`Figma export requires verified token "${binding.tokenId}".`)
    if (!tokenById.has(binding.tokenId)) return invalid(`Figma binding references missing token "${binding.tokenId}".`)
  }

  const originalById = new Map(bindings.variables.map((variable) => [variable.id, variable]))
  const originalVariables = new Map<string, FigmaSnapshot['variables'][number]>()
  for (const binding of bindings.variableBindings) {
    const token = tokenById.get(binding.tokenId)!
    const original = originalById.get(binding.variableId)
    if (!original) return invalid(`Figma binding references unknown variable "${binding.variableId}".`)
    const current = originalVariables.get(binding.variableId) ?? { ...original, name: token.name, valuesByMode: {} }
    if (current.collectionId !== binding.collectionId || current.resolvedType !== binding.resolvedType || current.name !== token.name) {
      return invalid(`Conflicting IR token metadata for Figma variable "${binding.variableId}".`)
    }
    const parsedValue = fromIrValue(token.value, binding, bindingByToken)
    if (!parsedValue.ok) return parsedValue
    current.valuesByMode[binding.modeId] = parsedValue.data
    originalVariables.set(binding.variableId, current)
  }
  const componentByIrId = new Map(request.components.map((component) => [component.id, component]))
  for (const binding of bindings.componentBindings) {
    if (!componentByIrId.has(binding.irComponentId)) return invalid(`Figma component binding references missing component "${binding.irComponentId}".`)
  }
  return success({
    variables: { fileKey: bindings.fileKey, collections: bindings.collections, variables: [...originalVariables.values()] },
    components: {
      fileKey: bindings.fileKey, componentSets: bindings.componentSets, components: bindings.components,
      nodeRefs: bindings.nodeRefs, codeConnectHints: bindings.codeConnectHints,
    },
  })
}

function fromIrValue(
  value: string,
  binding: FigmaBindingManifest['variableBindings'][number],
  bindingByToken: ReadonlyMap<string, FigmaBindingManifest['variableBindings'][number]>,
): ConnectorResult<FigmaVariableValue> {
  if (value === binding.importedValue) return success(binding.originalValue)
  if (value.startsWith('alias:')) {
    const target = bindingByToken.get(value.slice('alias:'.length))
    if (!target) return invalid(`Alias token "${value}" has no Figma binding.`)
    if (target.modeId !== binding.modeId) return invalid('Cross-mode Figma aliases are unsupported.')
    return success({ type: 'VARIABLE_ALIAS', id: target.variableId })
  }
  switch (binding.resolvedType) {
    case 'COLOR': {
      const match = /^#([a-f0-9]{8})$/i.exec(value)
      if (!match) return invalid(`COLOR token "${binding.tokenId}" must use #RRGGBBAA.`)
      const hex = match[1]!
      return success({
        r: parseInt(hex.slice(0, 2), 16) / 255,
        g: parseInt(hex.slice(2, 4), 16) / 255,
        b: parseInt(hex.slice(4, 6), 16) / 255,
        a: parseInt(hex.slice(6, 8), 16) / 255,
      })
    }
    case 'FLOAT': {
      const number = Number(value)
      return Number.isFinite(number) ? success(number) : invalid(`FLOAT token "${binding.tokenId}" is not numeric.`)
    }
    case 'BOOLEAN':
      return value === 'true' ? success(true) : value === 'false' ? success(false) : invalid(`BOOLEAN token "${binding.tokenId}" is invalid.`)
    case 'STRING': return success(value)
  }
}

function toIrValue(value: FigmaVariableValue, modeId: string): string {
  if (isAlias(value)) return `alias:${tokenIdFor(value.id, modeId)}`
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return `#${channel(value.r)}${channel(value.g)}${channel(value.b)}${channel(value.a)}`
}

function channel(value: number): string {
  return Math.round(value * 255).toString(16).padStart(2, '0')
}

function isAlias(value: FigmaVariableValue): value is { type: 'VARIABLE_ALIAS'; id: string } {
  return typeof value === 'object' && 'type' in value && value.type === 'VARIABLE_ALIAS'
}

function valueMatchesType(value: FigmaVariableValue, type: FigmaSnapshot['variables'][number]['resolvedType']): boolean {
  if (isAlias(value)) return true
  if (type === 'COLOR') return typeof value === 'object'
  if (type === 'FLOAT') return typeof value === 'number'
  if (type === 'STRING') return typeof value === 'string'
  return typeof value === 'boolean'
}

function tokenKind(type: FigmaSnapshot['variables'][number]['resolvedType']): DesignToken['kind'] {
  return type === 'COLOR' ? 'color' : type === 'FLOAT' ? 'other' : 'other'
}

function sourceEvidence(
  sourceId: string,
  kind: 'token' | 'component',
  id: string,
  provenanceId: string,
  index: number,
): DesignRelation {
  return {
    id: `figma:relation:source-${kind}:${index}`,
    kind: 'source-evidence', from: { kind: 'source', id: sourceId }, to: { kind, id }, provenanceId,
  }
}

function tokenIdFor(variableId: string, modeId: string): string {
  return `figma:variable:${variableId}:mode:${modeId}`
}

function componentIdFor(id: string): string { return `figma:component:${id}` }
function componentSetIdFor(id: string): string { return `figma:component-set:${id}` }

function snapshotWarnings(snapshot: FigmaSnapshot): string[] {
  return [
    ...(snapshot.nodeRefs.length > 0 ? ['Node references are preserved as bindings; layout is not inferred.'] : []),
    ...(snapshot.codeConnectHints.length > 0 ? ['Code Connect hints are preserved as claims; code is not generated or validated.'] : []),
  ]
}

function snapshotWarningsFromBindings(bindings: FigmaBindingManifest): string[] {
  return [
    ...(bindings.nodeRefs.length > 0 ? ['Node references are emitted unchanged; this plan does not mutate Figma nodes.'] : []),
    ...(bindings.codeConnectHints.length > 0 ? ['Code Connect bindings require target-side validation before publication.'] : []),
  ]
}

function figmaFileUri(snapshot: Pick<FigmaSnapshot, 'file'>): string {
  return `figma://file/${snapshot.file.key}${snapshot.file.version ? `?version=${encodeURIComponent(snapshot.file.version)}` : ''}`
}

function connectorProvenance(operation: 'preview' | 'import' | 'export', snapshot: FigmaSnapshot, recordedAt: string) {
  return {
    connectorId: CONNECTOR_ID, connectorVersion: CONNECTOR_VERSION, operation, sourceKind: 'figma' as const,
    recordedAt, externalRef: figmaFileUri(snapshot),
  }
}

function receipt(operation: 'import' | 'export', snapshot: FigmaSnapshot, startedAt: string, completedAt: string) {
  return {
    id: `figma:${operation}:${snapshot.file.key}:${startedAt}`,
    connectorId: CONNECTOR_ID, operation, startedAt, completedAt, status: 'succeeded' as const,
    provenance: connectorProvenance(operation, snapshot, completedAt),
  }
}

function sameGuard(left: typeof baseShape, right: typeof baseShape): boolean {
  return left.documentId === right.documentId && left.revisionId === right.revisionId && left.revisionNumber === right.revisionNumber
}
const baseShape = { documentId: '', revisionId: '', revisionNumber: 0 }

function firstDuplicate(values: readonly string[]): string | undefined {
  const seen = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) return value
    seen.add(value)
  }
}

function abortResult<T>(context: ConnectorContext): ConnectorResult<T> | undefined {
  return context.signal.aborted ? failure('aborted', 'Figma connector operation was aborted.') : undefined
}

function success<T>(data: T): ConnectorResult<T> { return { ok: true, data } }
function invalid<T>(message: string): ConnectorResult<T> { return failure('invalid-result', message) }
function failure<T>(code: ConnectorError['code'], message: string): ConnectorResult<T> {
  return { ok: false, error: { code, message } }
}
