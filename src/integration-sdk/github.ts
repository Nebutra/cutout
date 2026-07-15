import type { SourcePatch } from '@/ingestion/everything-inbox'
import type { IntegrationAdapter, IntegrationContext, IntegrationManifest, IntegrationRequest, IntegrationResult, NormalizedResource, PreviewPlan, ImportPlan, SecretHandle } from './contracts'

export interface GitHubRepositoryRef { readonly installationId: string; readonly owner: string; readonly repo: string; readonly defaultBranch: string; readonly headSha: string }
export interface GitHubInventoryEntry { readonly path: string; readonly sha: string; readonly bytes: number; readonly mediaType?: string }
export interface GitHubFeedback { readonly kind: 'issue' | 'pull-request'; readonly number: number; readonly title: string; readonly body: string; readonly updatedAt: string; readonly url: string }
export interface GitHubPublishFile { readonly path: string; readonly contentSha256: string; readonly diff: string }
export interface GitHubWritePlan {
  readonly version: 'cutout.github-write-plan.v1'; readonly repository: GitHubRepositoryRef; readonly baseSha: string
  readonly branch: string; readonly commitMessage: string; readonly files: readonly GitHubPublishFile[]
  readonly pullRequest: { readonly title: string; readonly body: string; readonly base: string; readonly head: string }
  readonly checks: readonly { readonly name: string; readonly summary: string }[]; readonly approvalRequired: true; readonly merge: false
}
export type GitHubHostResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly limit: { readonly kind: 'primary' | 'secondary'; readonly retryAfterSeconds?: number; readonly remaining?: number; readonly resetAt?: string } }
export interface GitHubIntegrationHost {
  repository(secret: SecretHandle, locator: string, signal: AbortSignal): Promise<GitHubHostResult<GitHubRepositoryRef>>
  inventory(secret: SecretHandle, repository: GitHubRepositoryRef, signal: AbortSignal): Promise<GitHubHostResult<readonly GitHubInventoryEntry[]>>
  feedback(secret: SecretHandle, repository: GitHubRepositoryRef, signal: AbortSignal): Promise<GitHubHostResult<readonly GitHubFeedback[]>>
  apply(secret: SecretHandle, plan: GitHubWritePlan, approvalId: string, signal: AbortSignal): Promise<GitHubHostResult<{ branch: string; commitSha: string; pullRequestUrl: string; checkUrls: readonly string[] }>>
  verifyWebhook(input: { signature: string; deliveryId: string; body: Uint8Array }): Promise<boolean>
}

export const githubIntegrationManifest: IntegrationManifest = {
  protocol: 'integration-sdk.v1', id: 'cutout.github', version: '1.0.0', provider: { id: 'github', name: 'GitHub' }, product: { id: 'github', name: 'GitHub' },
  surfaces: ['desktop', 'cli', 'mcp', 'headless', 'webhook'],
  capabilities: [
    { operation: 'preview', domains: ['repositories'], syncModes: ['pull'], requiresPreview: true },
    { operation: 'import', domains: ['repositories', 'issues', 'comments'], syncModes: ['pull'], requiresPreview: true },
    { operation: 'publish', domains: ['repositories'], syncModes: ['push'], requiresPreview: true },
  ],
  auth: { modes: ['host-session'] }, dataDomains: ['repositories', 'issues', 'comments'], syncModes: ['pull', 'push'],
  eventModel: { cursor: 'opaque', webhooks: 'host-verified', delivery: 'at-least-once' },
  limits: { maxBatchItems: 1000, maxPayloadBytes: 10_000_000, rateLimit: 'GitHub primary and secondary limits are returned structurally by the host.' }, availability: 'authorization-required', unavailableReason: 'An injected desktop GitHub App/OAuth host session is required.',
}

export function createGitHubIntegration(host: GitHubIntegrationHost) {
  const deliveries = new Set<string>()
  const adapter: IntegrationAdapter & {
    createWritePlan(request: IntegrationRequest, files: readonly GitHubPublishFile[], checks: GitHubWritePlan['checks']): Promise<IntegrationResult<GitHubWritePlan>>
    applyApprovedPublish(request: IntegrationRequest, plan: GitHubWritePlan, approvalId: string): Promise<IntegrationResult<unknown>>
    receiveWebhook(input: { signature: string; deliveryId: string; body: Uint8Array; receivedAt: string }): Promise<IntegrationResult<{ duplicate: boolean; deliveryId: string }>>
  } = {
    manifest: githubIntegrationManifest,
    preview: (request, context) => repositoryPreview(host, request, context),
    import: (request, context) => feedbackImport(host, request, context),
    publish: async (request, context) => {
      const files = readFiles(request.metadata?.files)
      const planned = await createPlan(host, request, context, files, readChecks(request.metadata?.checks))
      if (!planned.ok) return planned
      return success({ id: `github:publish:${planned.data.baseSha}`, integrationId: 'cutout.github', operation: 'publish', base: request.base, resources: [], warnings: [], conflictPolicy: 'fail', targetRef: `${planned.data.repository.owner}/${planned.data.repository.repo}:${planned.data.branch}` })
    },
    createWritePlan: async (request, files, checks) => createPlan(host, request, context(request), files, checks),
    applyApprovedPublish: async (request, plan, approvalId) => {
      if (!approvalId || approvalId.length > 160) return failure('authorization-required', 'Explicit approval id is required.')
      if (plan.repository.defaultBranch === plan.branch || plan.pullRequest.base !== plan.repository.defaultBranch || plan.merge !== false) return failure('conflict', 'Default branch writes and merge are forbidden.')
      const secret = requiredSecret(request); if (!secret.ok) return secret
      const current = await host.repository(secret.data, request.locator, request.signal ?? new AbortController().signal)
      if (!current.ok) return limitFailure(current.limit)
      if (current.value.headSha !== plan.baseSha) return failure('stale-revision', 'Repository head changed after preview.')
      const applied = await host.apply(secret.data, plan, approvalId, request.signal ?? new AbortController().signal)
      return applied.ok ? success(applied.value) : limitFailure(applied.limit)
    },
    receiveWebhook: async (input) => {
      if (deliveries.has(input.deliveryId)) return success({ duplicate: true, deliveryId: input.deliveryId })
      if (!await host.verifyWebhook(input)) return failure('authorization-required', 'Webhook signature verification failed.')
      deliveries.add(input.deliveryId); return success({ duplicate: false, deliveryId: input.deliveryId })
    },
  }
  return adapter
}

async function repositoryPreview(host: GitHubIntegrationHost, request: IntegrationRequest, ctx: IntegrationContext): Promise<IntegrationResult<PreviewPlan>> {
  const secret = requiredSecret(request); if (!secret.ok) return secret
  const repository = await host.repository(secret.data, request.locator, ctx.signal); if (!repository.ok) return limitFailure(repository.limit)
  const inventory = await host.inventory(secret.data, repository.value, ctx.signal); if (!inventory.ok) return limitFailure(inventory.limit)
  const resources = inventory.value.map((entry): NormalizedResource => ({ id: `github:${repository.value.owner}/${repository.value.repo}:${entry.sha}`, domain: 'repositories', type: 'repository-file', title: entry.path, externalRef: `github://${repository.value.owner}/${repository.value.repo}/blob/${repository.value.headSha}/${entry.path}`, revision: entry.sha, mediaType: entry.mediaType, metadata: { path: entry.path, bytes: entry.bytes }, provenance: { integrationId: 'cutout.github', capturedAt: ctx.now(), actor: 'system' }, license: { kind: 'unknown', rationale: 'Repository license must be resolved from selected repository evidence.' } }))
  return success({ id: `github:preview:${repository.value.headSha}`, integrationId: 'cutout.github', operation: 'preview', base: request.base, resources, warnings: [], conflictPolicy: 'fail' })
}
async function feedbackImport(host: GitHubIntegrationHost, request: IntegrationRequest, ctx: IntegrationContext): Promise<IntegrationResult<ImportPlan>> {
  const secret = requiredSecret(request); if (!secret.ok) return secret
  const repository = await host.repository(secret.data, request.locator, ctx.signal); if (!repository.ok) return limitFailure(repository.limit)
  const feedback = await host.feedback(secret.data, repository.value, ctx.signal); if (!feedback.ok) return limitFailure(feedback.limit)
  const sources = feedback.value.map((item) => ({ id: `source:github:${item.kind}:${item.number}`, kind: 'document' as const, role: 'requirement' as const, title: item.title, license: { kind: 'unknown' as const, rationale: 'Imported GitHub feedback.' }, content: [{ id: `content:github:${item.kind}:${item.number}`, uri: item.url, mediaType: 'text/markdown' }] }))
  const provenance = feedback.value.map((item) => ({ id: `provenance:github:${item.kind}:${item.number}`, operation: 'import' as const, sourceIds: [`source:github:${item.kind}:${item.number}`], actor: { kind: 'system' as const, id: 'cutout.github' }, recordedAt: ctx.now() }))
  const sourcePatch: SourcePatch = { sources, provenance }
  return success({ id: `github:import:${repository.value.headSha}`, integrationId: 'cutout.github', operation: 'import', base: request.base, resources: [], sourcePatch, warnings: [], conflictPolicy: 'fail' })
}
async function createPlan(host: GitHubIntegrationHost, request: IntegrationRequest, ctx: IntegrationContext, files: readonly GitHubPublishFile[], checks: GitHubWritePlan['checks']): Promise<IntegrationResult<GitHubWritePlan>> {
  const secret = requiredSecret(request); if (!secret.ok) return secret
  const repository = await host.repository(secret.data, request.locator, ctx.signal); if (!repository.ok) return limitFailure(repository.limit)
  const suffix = request.base.revisionId.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
  const branch = `cutout/${suffix || 'delivery'}`
  return success({ version: 'cutout.github-write-plan.v1', repository: repository.value, baseSha: repository.value.headSha, branch, commitMessage: `Cutout delivery ${request.base.revisionId}`, files: [...files], pullRequest: { title: request.title ?? 'Cutout design delivery', body: 'Generated from verified Cutout Design IR. Review provenance and checks before merge.', base: repository.value.defaultBranch, head: branch }, checks: [...checks], approvalRequired: true, merge: false })
}
function requiredSecret(request: IntegrationRequest): IntegrationResult<SecretHandle> { return request.session.secretHandle ? success(request.session.secretHandle) : failure('authorization-required', 'GitHub App installation SecretHandle is required.') }
function context(request: IntegrationRequest): IntegrationContext { return { session: request.session, now: () => new Date().toISOString(), signal: request.signal ?? new AbortController().signal } }
function readFiles(value: unknown): readonly GitHubPublishFile[] { return Array.isArray(value) ? value.filter((item): item is GitHubPublishFile => Boolean(item && typeof item.path === 'string' && typeof item.contentSha256 === 'string' && typeof item.diff === 'string')) : [] }
function readChecks(value: unknown): GitHubWritePlan['checks'] { return Array.isArray(value) ? value.filter((item) => item && typeof item.name === 'string' && typeof item.summary === 'string') : [] }
function success<T>(data: T): IntegrationResult<T> { return { ok: true, data } }
function failure<T = never>(code: any, message: string): IntegrationResult<T> { return { ok: false, error: { code, message } } }
function limitFailure<T>(limit: { kind: 'primary' | 'secondary'; retryAfterSeconds?: number; remaining?: number; resetAt?: string }): IntegrationResult<T> { return failure('integration-failed', JSON.stringify({ code: 'github-rate-limited', ...limit })) }
