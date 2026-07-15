import {
  INTEGRATION_SDK_PROTOCOL,
  type IntegrationAdapter,
  type IntegrationCapability,
  type IntegrationDataDomain,
  type IntegrationError,
  type IntegrationOperation,
  type IntegrationPlan,
  type IntegrationRequest,
  type IntegrationResult,
  type IntegrationSurface,
} from './contracts'

export class IntegrationRegistry {
  readonly #adapters = new Map<string, IntegrationAdapter>()

  register(adapter: IntegrationAdapter): IntegrationResult<IntegrationAdapter> {
    const issue = validateManifest(adapter)
    if (issue) return failure('invalid-manifest', issue)
    if (this.#adapters.has(adapter.manifest.id)) return failure('duplicate-integration', `Integration already registered: ${adapter.manifest.id}`)
    this.#adapters.set(adapter.manifest.id, adapter)
    return success(adapter)
  }

  get(id: string): IntegrationAdapter | undefined { return this.#adapters.get(id) }
  list(): readonly IntegrationAdapter[] { return [...this.#adapters.values()] }

  negotiate(query: {
    readonly operation: IntegrationOperation
    readonly domain: IntegrationDataDomain
    readonly surface: IntegrationSurface
  }): readonly IntegrationAdapter[] {
    return this.list().filter(({ manifest }) => manifest.surfaces.includes(query.surface)
      && manifest.capabilities.some((capability) => capability.operation === query.operation && capability.domains.includes(query.domain)))
  }

  async run(id: string, request: IntegrationRequest): Promise<IntegrationResult<IntegrationPlan>> {
    const adapter = this.get(id)
    if (!adapter) return failure('integration-not-found', `Integration not found: ${id}`)
    if (adapter.manifest.availability === 'adapter-required') return failure('adapter-required', adapter.manifest.unavailableReason ?? `${id} requires an adapter.`)
    if (adapter.manifest.availability === 'host-required') return failure('adapter-required', adapter.manifest.unavailableReason ?? `${id} requires an authorized connector host.`)
    if (request.session.integrationId !== id) return failure('authorization-required', 'Session belongs to another integration.')
    if (!sameRevision(request.base, request.current)) return failure('stale-revision', 'Integration request targets a stale DesignDocument revision.')
    const capability = adapter.manifest.capabilities.find((item) => item.operation === request.operation)
    if (!capability || !hasOperation(adapter, request.operation)) return failure('capability-mismatch', `${id} does not support ${request.operation}.`)
    if (!adapter.manifest.auth.modes.includes(request.session.authMode)) return failure('authorization-required', `Session auth mode ${request.session.authMode} is not supported.`)
    if (request.session.authMode !== 'none' && !request.session.secretHandle) return failure('authorization-required', 'Authorized sessions require a host-owned secret handle.')
    const signal = request.signal ?? new AbortController().signal
    if (signal.aborted) return failure('aborted', 'Integration operation was aborted.')
    try {
      const context = { session: request.session, now: () => new Date().toISOString(), signal }
      const result = await invokeAdapter(adapter, request, context)
      if (signal.aborted) return failure('aborted', 'Integration operation was aborted.')
      return validateResult(result, adapter.manifest.id, request)
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return failure('aborted', 'Integration operation was aborted.')
      return failure('integration-failed', redact(String(error instanceof Error ? error.message : error)))
    }
  }
}

function hasOperation(adapter: IntegrationAdapter, operation: IntegrationOperation): boolean {
  switch (operation) {
    case 'preview': return typeof adapter.preview === 'function'
    case 'import': return typeof adapter.import === 'function'
    case 'export': return typeof adapter.export === 'function'
    case 'sync': return typeof adapter.sync === 'function'
    case 'publish': return typeof adapter.publish === 'function'
  }
}

async function invokeAdapter(
  adapter: IntegrationAdapter,
  request: IntegrationRequest,
  context: Parameters<NonNullable<IntegrationAdapter['preview']>>[1],
): Promise<IntegrationResult<IntegrationPlan>> {
  switch (request.operation) {
    case 'preview': return adapter.preview!(request, context)
    case 'import': return adapter.import!(request, context)
    case 'export': return adapter.export!(request, context)
    case 'sync': return adapter.sync!(request, context)
    case 'publish': return adapter.publish!(request, context)
  }
}

export function validateManifest(adapter: IntegrationAdapter): string | null {
  const { manifest } = adapter
  if (manifest.protocol !== INTEGRATION_SDK_PROTOCOL) return 'Unsupported Integration SDK protocol.'
  if (!manifest.id.trim() || !manifest.version.trim() || !manifest.provider.id.trim() || !manifest.product.id.trim()) return 'Manifest identity fields are required.'
  if (manifest.limits.maxBatchItems < 1 || manifest.limits.maxPayloadBytes < 1) return 'Integration limits must be positive.'
  if (manifest.auth.modes.includes('oauth2') && manifest.auth.oauth?.hostBoundary !== true) return 'OAuth must be hosted outside the Integration SDK boundary.'
  for (const capability of manifest.capabilities) {
    if (!capability.domains.length || !capability.syncModes.length) return 'Capabilities require data domains and sync modes.'
    if (!manifest.dataDomains.every((domain) => manifest.capabilities.some((entry) => entry.domains.includes(domain)))) return 'Declared data domains must be backed by capabilities.'
  }
  return null
}

function validateResult(result: IntegrationResult<IntegrationPlan>, integrationId: string, request: IntegrationRequest): IntegrationResult<IntegrationPlan> {
  if (!result.ok) return { ok: false, error: { ...result.error, message: redact(result.error.message) } }
  const plan = result.data
  if (plan.integrationId !== integrationId || plan.operation !== request.operation || !sameRevision(plan.base, request.base)) return failure('invalid-result', 'Integration returned a plan for another integration, operation, or revision.')
  if (containsSecret(JSON.stringify(plan))) return failure('invalid-result', 'Integration result contained credential-shaped data and was rejected.')
  return result
}

function sameRevision(a: IntegrationRequest['base'], b: IntegrationRequest['base']): boolean {
  return a.documentId === b.documentId && a.revisionId === b.revisionId && a.revisionNumber === b.revisionNumber
}

const SECRET = /(?:\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b|\bBearer\s+[A-Za-z0-9._~+/-]+\b|(?:api[-_]?key|token|secret|authorization)\s*[:=]\s*[^\s,;]+)/gi
function containsSecret(value: string): boolean { SECRET.lastIndex = 0; return SECRET.test(value) }
function redact(value: string): string { return value.replace(SECRET, '[REDACTED]') }
function success<T>(data: T): IntegrationResult<T> { return { ok: true, data } }
function failure<T = never>(code: IntegrationError['code'], message: string): IntegrationResult<T> { return { ok: false, error: { code, message } } }

export function capability(operation: IntegrationOperation, domains: readonly IntegrationDataDomain[], syncModes: IntegrationCapability['syncModes'] = ['none'], requiresPreview = true): IntegrationCapability {
  return { operation, domains, syncModes, requiresPreview }
}
