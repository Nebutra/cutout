import type { Brand, DesignComponent, DesignRelation, DesignToken, Material, Provenance } from '@/design-ir'
import type { SourcePatch } from '@/ingestion/everything-inbox'

export const INTEGRATION_SDK_PROTOCOL = 'integration-sdk.v1' as const

export type IntegrationSurface = 'desktop' | 'cli' | 'mcp' | 'headless' | 'webhook'
export type IntegrationOperation = 'preview' | 'import' | 'export' | 'sync' | 'publish'
export type IntegrationAuthMode = 'none' | 'api-key' | 'oauth2' | 'host-session'
export type IntegrationSyncMode = 'none' | 'pull' | 'push' | 'bidirectional'
export type IntegrationDataDomain =
  | 'documents' | 'design-files' | 'design-tokens' | 'components' | 'assets'
  | 'repositories' | 'issues' | 'pages' | 'databases' | 'comments'

export interface IntegrationCapability {
  readonly operation: IntegrationOperation
  readonly domains: readonly IntegrationDataDomain[]
  readonly syncModes: readonly IntegrationSyncMode[]
  readonly requiresPreview: boolean
}

export interface IntegrationManifest {
  readonly protocol: typeof INTEGRATION_SDK_PROTOCOL
  readonly id: string
  readonly version: string
  readonly provider: { readonly id: string; readonly name: string }
  readonly product: { readonly id: string; readonly name: string }
  readonly surfaces: readonly IntegrationSurface[]
  readonly capabilities: readonly IntegrationCapability[]
  readonly auth: {
    readonly modes: readonly IntegrationAuthMode[]
    readonly oauth?: {
      readonly hostBoundary: true
      readonly authorizationUrl?: string
      readonly scopes: readonly string[]
    }
  }
  readonly dataDomains: readonly IntegrationDataDomain[]
  readonly syncModes: readonly IntegrationSyncMode[]
  readonly eventModel: {
    readonly cursor: 'none' | 'opaque'
    readonly webhooks: 'none' | 'host-verified'
    readonly delivery: 'at-most-once' | 'at-least-once'
  }
  readonly limits: {
    readonly maxBatchItems: number
    readonly maxPayloadBytes: number
    readonly rateLimit?: string
  }
  readonly availability: 'available' | 'adapter-required' | 'host-required' | 'authorization-required'
  readonly unavailableReason?: string
}

/** Opaque host-owned reference. Secret material never crosses the SDK boundary. */
export interface SecretHandle {
  readonly kind: 'secret-handle'
  readonly id: string
  readonly provider?: string
  readonly sessionId?: string
}

export interface IntegrationSession {
  readonly id: string
  readonly integrationId: string
  readonly surface: IntegrationSurface
  readonly authMode: IntegrationAuthMode
  readonly secretHandle?: SecretHandle
  readonly createdAt: string
  readonly expiresAt?: string
}

export interface IntegrationRevision {
  readonly documentId: string
  readonly revisionId: string
  readonly revisionNumber: number
}

export interface IntegrationLicense {
  readonly kind: 'public-domain' | 'spdx' | 'proprietary' | 'unknown'
  readonly identifier?: string
  readonly holder?: string
  readonly rationale?: string
}

export interface NormalizedResource {
  readonly id: string
  readonly domain: IntegrationDataDomain
  readonly type: string
  readonly title: string
  readonly externalRef: string
  readonly revision?: string
  readonly mediaType?: string
  readonly metadata: Readonly<Record<string, unknown>>
  readonly provenance: {
    readonly integrationId: string
    readonly capturedAt: string
    readonly actor: 'user' | 'system' | 'external'
  }
  readonly license: IntegrationLicense
}

export interface IntegrationDesignPatch {
  readonly brands?: readonly Brand[]
  readonly tokens?: readonly DesignToken[]
  readonly components?: readonly DesignComponent[]
  readonly materials?: readonly Material[]
  readonly provenance?: readonly Provenance[]
  readonly relations?: readonly DesignRelation[]
}

export interface IntegrationExportFile {
  readonly path: string
  readonly mediaType: string
  readonly content?: string
  readonly sourceUri?: string
}

export interface IntegrationExportBundle {
  readonly name: string
  readonly files: readonly IntegrationExportFile[]
  readonly warnings: readonly string[]
}

export type IntegrationConflictPolicy = 'fail' | 'prefer-local' | 'prefer-remote' | 'manual'

export interface IntegrationPlanBase {
  readonly id: string
  readonly integrationId: string
  readonly operation: IntegrationOperation
  readonly base: IntegrationRevision
  readonly resources: readonly NormalizedResource[]
  readonly warnings: readonly string[]
  readonly conflictPolicy: IntegrationConflictPolicy
}

export interface PreviewPlan extends IntegrationPlanBase { readonly operation: 'preview' }
export interface ImportPlan extends IntegrationPlanBase {
  readonly operation: 'import'
  readonly sourcePatch?: SourcePatch
  readonly designPatch?: IntegrationDesignPatch
}
export interface IntegrationExportPlan extends IntegrationPlanBase {
  readonly operation: 'export'
  readonly exportPlan: IntegrationExportBundle
}
export interface SyncPlan extends IntegrationPlanBase {
  readonly operation: 'sync'
  readonly syncMode: Exclude<IntegrationSyncMode, 'none'>
  readonly cursor?: string
}
export interface PublishPlan extends IntegrationPlanBase {
  readonly operation: 'publish'
  readonly targetRef: string
}
export type IntegrationPlan = PreviewPlan | ImportPlan | IntegrationExportPlan | SyncPlan | PublishPlan

export interface IntegrationCursorReceipt {
  readonly kind: 'cursor-receipt'
  readonly cursor: string
  readonly receivedAt: string
}

export interface IntegrationWebhookReceipt {
  readonly kind: 'webhook-receipt'
  readonly deliveryId: string
  readonly signatureVerifiedByHost: true
  readonly receivedAt: string
}

export interface IntegrationReceipt {
  readonly id: string
  readonly integrationId: string
  readonly operation: IntegrationOperation
  readonly planId: string
  readonly startedAt: string
  readonly completedAt: string
  readonly status: 'succeeded' | 'no-op'
  readonly revision: IntegrationRevision
  readonly cursor?: IntegrationCursorReceipt
  readonly webhook?: IntegrationWebhookReceipt
}

export interface IntegrationRequest {
  readonly operation: IntegrationOperation
  readonly session: IntegrationSession
  readonly base: IntegrationRevision
  readonly current: IntegrationRevision
  readonly locator: string
  readonly title?: string
  readonly metadata?: Readonly<Record<string, unknown>>
  readonly conflictPolicy?: IntegrationConflictPolicy
  readonly signal?: AbortSignal
}

export type IntegrationResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: IntegrationError }

export interface IntegrationError {
  readonly code: 'duplicate-integration' | 'integration-not-found' | 'adapter-required'
    | 'capability-mismatch' | 'authorization-required' | 'stale-revision' | 'aborted'
    | 'invalid-manifest' | 'invalid-result' | 'conflict' | 'integration-failed'
  readonly message: string
}

export interface IntegrationContext {
  readonly session: IntegrationSession
  readonly now: () => string
  readonly signal: AbortSignal
}

export interface IntegrationAdapter {
  readonly manifest: IntegrationManifest
  preview?(request: IntegrationRequest, context: IntegrationContext): Promise<IntegrationResult<PreviewPlan>>
  import?(request: IntegrationRequest, context: IntegrationContext): Promise<IntegrationResult<ImportPlan>>
  export?(request: IntegrationRequest, context: IntegrationContext): Promise<IntegrationResult<IntegrationExportPlan>>
  sync?(request: IntegrationRequest, context: IntegrationContext): Promise<IntegrationResult<SyncPlan>>
  publish?(request: IntegrationRequest, context: IntegrationContext): Promise<IntegrationResult<PublishPlan>>
}
