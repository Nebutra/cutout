import type {
  Brand,
  DesignComponent,
  DesignRelation,
  DesignSource,
  DesignToken,
  Material,
  Provenance,
  SourceKind,
} from '@/design-ir'
import type { SourcePatch } from '@/ingestion/everything-inbox'

export const CONNECTOR_PROTOCOL = 'connector.v1' as const

export type ConnectorOperation = 'preview' | 'import' | 'export'
export type ConnectorAvailability = 'available' | 'authorization-required' | 'unavailable'
export type ConnectorAuthKind = 'none' | 'api-key' | 'oauth2' | 'host-session'

export interface ConnectorCapability {
  readonly operation: ConnectorOperation
  readonly sourceKinds: readonly SourceKind[]
}

export interface ConnectorAuthRequirement {
  readonly kind: ConnectorAuthKind
  readonly scopes?: readonly string[]
  readonly helpUrl?: string
}

export interface ConnectorManifest {
  readonly protocol: typeof CONNECTOR_PROTOCOL
  readonly id: string
  readonly name: string
  readonly version: string
  readonly availability: ConnectorAvailability
  readonly capabilities: readonly ConnectorCapability[]
  readonly auth: ConnectorAuthRequirement
  readonly unavailableReason?: string
}

export interface ConnectorRevisionGuard {
  readonly documentId: string
  readonly revisionId: string
  readonly revisionNumber: number
}

export interface ConnectorProvenance {
  readonly connectorId: string
  readonly connectorVersion: string
  readonly operation: ConnectorOperation
  readonly sourceKind: SourceKind
  readonly recordedAt: string
  readonly externalRef?: string
}

export interface ConnectorReceipt {
  readonly id: string
  readonly connectorId: string
  readonly operation: ConnectorOperation
  readonly startedAt: string
  readonly completedAt: string
  readonly status: 'succeeded' | 'no-op'
  readonly provenance: ConnectorProvenance
}

export interface DesignPatch {
  readonly brands?: readonly Brand[]
  readonly tokens?: readonly DesignToken[]
  readonly components?: readonly DesignComponent[]
  readonly materials?: readonly Material[]
  readonly provenance?: readonly Provenance[]
  readonly relations?: readonly DesignRelation[]
}

export interface ExportPlanFile {
  readonly path: string
  readonly mediaType: string
  readonly content?: string
  readonly sourceUri?: string
}

export interface ExportPlan {
  readonly name: string
  readonly files: readonly ExportPlanFile[]
  readonly warnings: readonly string[]
}

export interface ConnectorInput {
  readonly sourceKind: SourceKind
  readonly locator: string
  readonly title?: string
  readonly metadata?: Readonly<Record<string, unknown>>
}

export interface ConnectorContext {
  readonly base: ConnectorRevisionGuard
  readonly now: () => string
  readonly signal: AbortSignal
  /** Ephemeral credentials. Implementations must never return or persist this value. */
  readonly auth?: Readonly<Record<string, string>>
}

export interface ConnectorPreview {
  readonly kind: 'connector-preview'
  readonly connectorId: string
  readonly base: ConnectorRevisionGuard
  readonly sourceKind: SourceKind
  readonly summary: string
  readonly warnings: readonly string[]
  /** Adapter-owned structured review data. It is untrusted until the caller validates it. */
  readonly details?: unknown
  readonly provenance: ConnectorProvenance
}

export interface ConnectorImport {
  readonly kind: 'connector-import'
  readonly connectorId: string
  readonly base: ConnectorRevisionGuard
  readonly sourcePatch?: SourcePatch
  readonly designPatch?: DesignPatch
  readonly receipt: ConnectorReceipt
}

export interface ConnectorExport {
  readonly kind: 'connector-export'
  readonly connectorId: string
  readonly base: ConnectorRevisionGuard
  readonly plan: ExportPlan
  readonly receipt: ConnectorReceipt
}

export type ConnectorResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: ConnectorError }

export interface ConnectorError {
  readonly code:
    | 'duplicate-connector'
    | 'connector-not-found'
    | 'capability-mismatch'
    | 'authorization-required'
    | 'unavailable'
    | 'stale-revision'
    | 'aborted'
    | 'invalid-result'
    | 'connector-failed'
  readonly message: string
}

export interface Connector {
  readonly manifest: ConnectorManifest
  preview?(input: ConnectorInput, context: ConnectorContext): Promise<ConnectorResult<ConnectorPreview>>
  import?(input: ConnectorInput, context: ConnectorContext): Promise<ConnectorResult<ConnectorImport>>
  export?(input: ConnectorInput, context: ConnectorContext): Promise<ConnectorResult<ConnectorExport>>
}

export interface ConnectorRunRequest {
  readonly connectorId: string
  readonly operation: ConnectorOperation
  readonly input: ConnectorInput
  readonly base: ConnectorRevisionGuard
  readonly current: ConnectorRevisionGuard
  readonly signal?: AbortSignal
  readonly auth?: Readonly<Record<string, string>>
}

export function sourcePatch(sources: readonly DesignSource[], provenance: readonly Provenance[]): SourcePatch {
  return { sources, provenance }
}
