import type { Connector, ConnectorContext, ConnectorInput } from './contracts'
import {
  INTEGRATION_SDK_PROTOCOL,
  type IntegrationAdapter,
  type IntegrationContext,
  type IntegrationDataDomain,
  type IntegrationError,
  type IntegrationManifest,
  type ImportPlan,
  type IntegrationExportPlan,
  type PreviewPlan,
  type IntegrationRequest,
  type IntegrationResult,
} from '@/integration-sdk'

interface CompatibilityOptions {
  readonly provider: IntegrationManifest['provider']
  readonly product: IntegrationManifest['product']
  readonly domains: readonly IntegrationDataDomain[]
}

/**
 * Compatibility lives on the legacy side so the Integration SDK never imports
 * connector or provider implementation details.
 */
export function legacyConnectorAsIntegration(connector: Connector, options: CompatibilityOptions): IntegrationAdapter {
  const operations = connector.manifest.capabilities.map((item) => item.operation)
  const manifest: IntegrationManifest = {
    protocol: INTEGRATION_SDK_PROTOCOL,
    id: connector.manifest.id,
    version: connector.manifest.version,
    provider: options.provider,
    product: options.product,
    surfaces: ['desktop', 'cli', 'mcp', 'headless'],
    capabilities: [...new Set(operations)].map((operation) => ({ operation, domains: options.domains, syncModes: ['none'], requiresPreview: operation !== 'preview' })),
    auth: {
      modes: [connector.manifest.auth.kind],
      ...(connector.manifest.auth.kind === 'oauth2' ? { oauth: { hostBoundary: true, scopes: connector.manifest.auth.scopes ?? [] } } : {}),
    },
    dataDomains: options.domains,
    syncModes: ['none'],
    eventModel: { cursor: 'none', webhooks: 'none', delivery: 'at-most-once' },
    limits: { maxBatchItems: 1000, maxPayloadBytes: 25 * 1024 * 1024 },
    availability: connector.manifest.availability === 'unavailable'
      ? 'adapter-required'
      : connector.manifest.availability,
    ...(connector.manifest.unavailableReason ? { unavailableReason: connector.manifest.unavailableReason } : {}),
  }

  const connectorInput = (request: IntegrationRequest): ConnectorInput => ({
    sourceKind: sourceKindFor(options.domains),
    locator: request.locator,
    ...(request.title ? { title: request.title } : {}),
    ...(request.metadata ? { metadata: request.metadata } : {}),
  })
  const connectorContext = (request: IntegrationRequest, context: IntegrationContext): ConnectorContext => ({
    base: request.base,
    now: context.now,
    signal: context.signal,
    // Only the opaque handle is exposed. Legacy adapters requiring actual
    // credentials must be invoked by their host, never by this bridge.
    ...(context.session.secretHandle ? { auth: { secretHandle: context.session.secretHandle.id } } : {}),
  })

  const preview = connector.preview ? async (request: IntegrationRequest, context: IntegrationContext): Promise<IntegrationResult<PreviewPlan>> => {
    const result = await connector.preview!(connectorInput(request), connectorContext(request, context))
    if (!result.ok) return failure(mapError(result.error.code), result.error.message)
    return { ok: true, data: {
      id: `${manifest.id}:preview:${request.base.revisionId}`, integrationId: manifest.id,
      operation: 'preview', base: request.base, resources: [], warnings: result.data.warnings,
      conflictPolicy: request.conflictPolicy ?? 'fail',
    } }
  } : undefined

  const importOperation = connector.import ? async (request: IntegrationRequest, context: IntegrationContext): Promise<IntegrationResult<ImportPlan>> => {
    const result = await connector.import!(connectorInput(request), connectorContext(request, context))
    if (!result.ok) return failure(mapError(result.error.code), result.error.message)
    return { ok: true, data: {
      id: `${manifest.id}:import:${request.base.revisionId}`, integrationId: manifest.id,
      operation: 'import', base: request.base, resources: [], warnings: [],
      conflictPolicy: request.conflictPolicy ?? 'fail',
      ...(result.data.sourcePatch ? { sourcePatch: result.data.sourcePatch } : {}),
      ...(result.data.designPatch ? { designPatch: result.data.designPatch } : {}),
    } }
  } : undefined

  const exportOperation = connector.export ? async (request: IntegrationRequest, context: IntegrationContext): Promise<IntegrationResult<IntegrationExportPlan>> => {
    const result = await connector.export!(connectorInput(request), connectorContext(request, context))
    if (!result.ok) return failure(mapError(result.error.code), result.error.message)
    return { ok: true, data: {
      id: `${manifest.id}:export:${request.base.revisionId}`, integrationId: manifest.id,
      operation: 'export', base: request.base, resources: [], warnings: result.data.plan.warnings,
      conflictPolicy: request.conflictPolicy ?? 'fail', exportPlan: result.data.plan,
    } }
  } : undefined

  return {
    manifest,
    ...(preview ? { preview } : {}),
    ...(importOperation ? { import: importOperation } : {}),
    ...(exportOperation ? { export: exportOperation } : {}),
  }
}

function sourceKindFor(domains: readonly IntegrationDataDomain[]) {
  if (domains.includes('repositories')) return 'repository' as const
  if (domains.includes('design-files')) return 'figma' as const
  return 'document' as const
}

function mapError(code: string): IntegrationError['code'] {
  if (code === 'authorization-required' || code === 'stale-revision' || code === 'aborted' || code === 'capability-mismatch') return code
  if (code === 'unavailable') return 'adapter-required'
  if (code === 'invalid-result') return 'invalid-result'
  return 'integration-failed'
}

function failure<T = never>(code: IntegrationError['code'], message: string): IntegrationResult<T> { return { ok: false, error: { code, message } } }
