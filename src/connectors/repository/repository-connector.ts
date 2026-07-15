import type { SourceLicense, SourceRole } from '@/design-ir'
import { ingestEverything, type RepositorySnapshotInput } from '@/ingestion/everything-inbox'
import type { RepositoryScanResult } from '@/ingestion/repo-scanner'
import { CONNECTOR_PROTOCOL, type Connector, type ConnectorError, type ConnectorInput, type ConnectorResult } from '../contracts'
import { legacyConnectorAsIntegration } from '../integration-compat'

export const REPOSITORY_CONNECTOR_ID = 'cutout.repository'
const MAX_PENDING_REVIEWS = 32

export interface RepositoryHostAdapter {
  /** Resolve only a host-authorized locator. Never return file contents. */
  scan(locator: string, options: {
    readonly label?: string
    readonly role: SourceRole
    readonly license: SourceLicense
    readonly promptProvenance?: string
    readonly signal: AbortSignal
  }): Promise<RepositoryScanResult>
}

interface RepositoryReview {
  readonly locator: string
  readonly snapshot: RepositorySnapshotInput
}

export function createRepositoryConnector(host: RepositoryHostAdapter): Connector {
  const reviews = new Map<string, RepositoryReview>()
  const manifest = {
    protocol: CONNECTOR_PROTOCOL,
    id: REPOSITORY_CONNECTOR_ID,
    name: 'Local repository',
    version: '1.0.0',
    availability: 'available' as const,
    capabilities: [
      { operation: 'preview' as const, sourceKinds: ['repository' as const] },
      { operation: 'import' as const, sourceKinds: ['repository' as const] },
    ],
    auth: { kind: 'host-session' as const },
  }

  return {
    manifest,
    async preview(input, context) {
      const options = parseOptions(input)
      if (!options.ok) return options
      context.signal.throwIfAborted()
      try {
        const scan = await host.scan(input.locator, { ...options.data, signal: context.signal })
        context.signal.throwIfAborted()
        const id = reviewId(context.base.revisionId, input.locator, scan.snapshot)
        if (!reviews.has(id) && reviews.size >= MAX_PENDING_REVIEWS) {
          const oldest = reviews.keys().next().value
          if (oldest) reviews.delete(oldest)
        }
        reviews.set(id, { locator: input.locator, snapshot: scan.snapshot })
        return {
          ok: true,
          data: {
            kind: 'connector-preview', connectorId: manifest.id, base: context.base, sourceKind: 'repository',
            summary: `${scan.snapshot.entries.length} safe repository entries ready for review.`,
            warnings: exclusionWarnings(scan.excluded),
            details: {
              reviewId: id,
              label: scan.snapshot.label,
              entries: scan.snapshot.entries,
              frameworkHints: scan.frameworkHints,
              excluded: scan.excluded,
              license: scan.snapshot.license,
            },
            provenance: provenance('preview', context.now(), scan.snapshot.label),
          },
        }
      } catch (error) {
        return failed(error)
      }
    },
    import: async (input, context) => {
      const review = reviewFromInput(input, reviews, context.base.revisionId)
      if (!review.ok) return review
      context.signal.throwIfAborted()
      const startedAt = context.now()
      const ingested = await ingestEverything(review.data.snapshot, {
        capturedAt: startedAt,
        actorId: 'system:repository-connector',
      })
      if (!ingested.ok) return failure('connector-failed', ingested.error)
      const completedAt = context.now()
      return {
        ok: true,
        data: {
          kind: 'connector-import', connectorId: manifest.id, base: context.base,
          sourcePatch: ingested.data.patch,
          receipt: {
            id: `receipt:repository:${reviewId(context.base.revisionId, input.locator, review.data.snapshot)}`,
            connectorId: manifest.id, operation: 'import', startedAt, completedAt,
            status: ingested.data.patch.sources.length === 0 ? 'no-op' : 'succeeded',
            provenance: provenance('import', completedAt, review.data.snapshot.label),
          },
        },
      }
    },
  }
}

export function createRepositoryIntegration(host: RepositoryHostAdapter) {
  return legacyConnectorAsIntegration(createRepositoryConnector(host), {
    provider: { id: 'local', name: 'Local host' },
    product: { id: 'repository', name: 'Repository' },
    domains: ['repositories'],
  })
}

function parseOptions(input: ConnectorInput): ConnectorResult<Omit<Parameters<RepositoryHostAdapter['scan']>[1], 'signal'>> {
  if (input.sourceKind !== 'repository') return failure('capability-mismatch', 'Repository connector only accepts repository inputs.')
  if (!input.locator.trim()) return failure('connector-failed', 'An authorized repository locator is required.')
  const metadata = input.metadata ?? {}
  const role = metadata.role
  const license = metadata.license
  if (!isRole(role)) return failure('connector-failed', 'Repository metadata.role is required.')
  if (!isLicense(license)) return failure('connector-failed', 'Repository metadata.license is required and must be explicit.')
  const label = typeof input.title === 'string' && input.title.trim() ? input.title.trim() : undefined
  const promptProvenance = typeof metadata.promptProvenance === 'string' ? metadata.promptProvenance : undefined
  return { ok: true, data: { role, license, ...(label ? { label } : {}), ...(promptProvenance ? { promptProvenance } : {}) } }
}

function reviewFromInput(input: ConnectorInput, reviews: Map<string, RepositoryReview>, revisionId: string): ConnectorResult<RepositoryReview> {
  const reviewIdValue = input.metadata?.reviewId
  if (typeof reviewIdValue !== 'string') return failure('invalid-result', 'Import requires a repository preview reviewId.')
  const review = reviews.get(reviewIdValue)
  if (!review || review.locator !== input.locator || reviewIdValue !== reviewId(revisionId, input.locator, review.snapshot)) {
    return failure('stale-revision', 'Repository preview is missing, stale, or belongs to another locator.')
  }
  reviews.delete(reviewIdValue)
  return { ok: true, data: review }
}

function provenance(operation: 'preview' | 'import', recordedAt: string, label: string) {
  return { connectorId: REPOSITORY_CONNECTOR_ID, connectorVersion: '1.0.0', operation, sourceKind: 'repository' as const, recordedAt, externalRef: `repository://authorized/${encodeURIComponent(label)}` }
}

function reviewId(revisionId: string, locator: string, snapshot: RepositorySnapshotInput): string {
  const value = `${revisionId}\0${locator}\0${snapshot.label}\0${snapshot.entries.map((entry) => `${entry.path}:${entry.sha256 ?? entry.bytes}`).join('|')}`
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619)
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function exclusionWarnings(excluded: RepositoryScanResult['excluded']): string[] {
  return Object.entries(excluded).filter(([, count]) => count > 0).map(([reason, count]) => `${count} ${reason} entr${count === 1 ? 'y was' : 'ies were'} excluded.`)
}

function isRole(value: unknown): value is SourceRole { return value === 'requirement' || value === 'reference' || value === 'inspiration' || value === 'output' }
function isLicense(value: unknown): value is SourceLicense {
  if (!value || typeof value !== 'object') return false
  const license = value as Record<string, unknown>
  return license.kind === 'public-domain'
    || (license.kind === 'spdx' && typeof license.identifier === 'string' && Boolean(license.identifier.trim()))
    || (license.kind === 'proprietary' && typeof license.holder === 'string' && Boolean(license.holder.trim()))
    || (license.kind === 'unknown' && typeof license.rationale === 'string' && Boolean(license.rationale.trim()))
}
function failed(error: unknown): ConnectorResult<never> { return failure('connector-failed', error instanceof Error ? error.message : String(error)) }
function failure<T = never>(code: ConnectorError['code'], message: string): ConnectorResult<T> { return { ok: false, error: { code, message } } }
