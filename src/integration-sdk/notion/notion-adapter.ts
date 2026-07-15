import { ingestEverything, type SourcePatch } from '@/ingestion/everything-inbox'
import { INTEGRATION_SDK_PROTOCOL, type IntegrationAdapter, type IntegrationError, type IntegrationExportBundle, type IntegrationRequest, type IntegrationResult, type NormalizedResource } from '../contracts'
import type { NotionBlock, NotionHost, NotionPublishBlock } from './notion-host'

export const NOTION_INTEGRATION_ID = 'cutout.notion'
const MAX_BLOCKS = 10_000
const MAX_PAGES = 200

export const notionIntegrationManifest: IntegrationAdapter['manifest'] = {
  protocol: INTEGRATION_SDK_PROTOCOL, id: NOTION_INTEGRATION_ID, version: '1.0.0',
  provider: { id: 'notion', name: 'Notion' }, product: { id: 'notion', name: 'Notion' },
  surfaces: ['desktop', 'cli', 'mcp', 'headless', 'webhook'],
  capabilities: [
    { operation: 'preview', domains: ['documents', 'pages', 'databases'], syncModes: ['none'], requiresPreview: true },
    { operation: 'import', domains: ['documents', 'pages', 'databases'], syncModes: ['pull'], requiresPreview: true },
    { operation: 'export', domains: ['documents', 'pages'], syncModes: ['none'], requiresPreview: true },
    { operation: 'publish', domains: ['documents', 'pages'], syncModes: ['push'], requiresPreview: true },
  ],
  auth: { modes: ['oauth2', 'api-key'], oauth: { hostBoundary: true, scopes: ['read_content', 'insert_content'] } },
  dataDomains: ['documents', 'pages', 'databases'], syncModes: ['none', 'pull', 'push'],
  eventModel: { cursor: 'opaque', webhooks: 'host-verified', delivery: 'at-least-once' },
  limits: { maxBatchItems: 100, maxPayloadBytes: 10 * 1024 * 1024, rateLimit: 'Average 3 requests/second; host must honor Retry-After on 429.' },
  availability: 'authorization-required', unavailableReason: 'An authorized Notion connector host is required.',
}

export function createNotionIntegration(host: NotionHost): IntegrationAdapter {
  const previews = new Map<string, { locator: string; resource: NormalizedResource; blocks: readonly NotionBlock[]; sourcePatch: SourcePatch }>()
  return {
    manifest: notionIntegrationManifest,
    async preview(request, context) {
      const auth = context.session.secretHandle
      if (!auth) return failure('authorization-required', 'Notion preview requires a host-owned secret handle.')
      try {
        const object = await host.retrieve(request.locator, { secretHandle: auth, signal: context.signal })
        const blocks = await collectBlocks(host, object.id, auth, context.signal)
        const sourcePatch = await normalizeSourcePatch(object, blocks, context.now())
        const resource = normalizeResource(object, blocks.length, context.now())
        const reviewId = stableId(request.base.revisionId, object.id, object.lastEditedTime)
        previews.set(reviewId, { locator: request.locator, resource, blocks, sourcePatch })
        return { ok: true, data: { id: reviewId, integrationId: NOTION_INTEGRATION_ID, operation: 'preview', base: request.base, resources: [resource], warnings: unsupportedWarnings(blocks), conflictPolicy: request.conflictPolicy ?? 'fail' } }
      } catch (error) { return hostFailure(error) }
    },
    async import(request) {
      const reviewId = request.metadata?.reviewId
      if (typeof reviewId !== 'string') return failure('invalid-result', 'Notion import requires a preview reviewId.')
      const preview = previews.get(reviewId)
      if (!preview || preview.locator !== request.locator) return failure('stale-revision', 'Notion preview is missing, stale, or belongs to another locator.')
      previews.delete(reviewId)
      return { ok: true, data: { id: `import:${reviewId}`, integrationId: NOTION_INTEGRATION_ID, operation: 'import', base: request.base, resources: [preview.resource], warnings: unsupportedWarnings(preview.blocks), conflictPolicy: request.conflictPolicy ?? 'fail', sourcePatch: preview.sourcePatch } }
    },
    async export(request) {
      const bundle = deliveryBundle(request)
      return { ok: true, data: { id: stableId(request.base.revisionId, request.locator, 'export'), integrationId: NOTION_INTEGRATION_ID, operation: 'export', base: request.base, resources: [], warnings: bundle.warnings, conflictPolicy: request.conflictPolicy ?? 'fail', exportPlan: bundle } }
    },
    async publish(request, context) {
      const auth = context.session.secretHandle
      if (!auth) return failure('authorization-required', 'Notion publish requires a host-owned secret handle.')
      const approved = request.metadata?.approved === true
      const title = typeof request.metadata?.title === 'string' ? request.metadata.title : undefined
      const markdown = typeof request.metadata?.markdown === 'string' ? request.metadata.markdown : undefined
      if (!approved || !title || !markdown) return failure('conflict', 'Publish requires an approved preview with title and markdown delivery content.')
      const blocks = markdownToBlocks(markdown)
      try {
        const result = await host.publishPage({ parentPageId: request.locator, title, blocks, idempotencyKey: stableId(request.base.revisionId, request.locator, markdown) }, { secretHandle: auth, signal: context.signal })
        return { ok: true, data: { id: stableId(request.base.revisionId, result.page.id, result.page.lastEditedTime), integrationId: NOTION_INTEGRATION_ID, operation: 'publish', base: request.base, resources: [normalizeResource(result.page, blocks.length, context.now())], warnings: [], conflictPolicy: request.conflictPolicy ?? 'fail', targetRef: result.page.url } }
      } catch (error) { return hostFailure(error) }
    },
  }
}

async function collectBlocks(host: NotionHost, id: string, secretHandle: NonNullable<Parameters<NotionHost['retrieve']>[1]['secretHandle']>, signal: AbortSignal): Promise<readonly NotionBlock[]> {
  const all: NotionBlock[] = []; let cursor: string | undefined
  for (let page = 0; page < MAX_PAGES; page += 1) {
    signal.throwIfAborted()
    const result = await host.listBlocks(id, { ...(cursor ? { cursor } : {}), pageSize: 100, secretHandle, signal })
    all.push(...result.items)
    if (all.length > MAX_BLOCKS) throw new Error(`Notion import exceeds ${MAX_BLOCKS} blocks.`)
    cursor = result.nextCursor
    if (!cursor) return all
  }
  throw new Error('Notion pagination exceeded the safe page limit.')
}

async function normalizeSourcePatch(object: Awaited<ReturnType<NotionHost['retrieve']>>, blocks: readonly NotionBlock[], capturedAt: string): Promise<SourcePatch> {
  const text = [`# ${object.title}`, ...blocks.map(blockText).filter(Boolean)].join('\n\n')
  const result = await ingestEverything({ type: 'inline-text', sourceKind: 'document', title: object.title, text, role: 'requirement', license: { kind: 'proprietary', holder: 'Notion workspace owner' }, promptProvenance: `Imported from selected Notion ${object.kind} ${object.id} last edited ${object.lastEditedTime}.` }, { capturedAt, actorId: 'system:notion-integration' })
  if (!result.ok) throw new Error(result.error)
  return result.data.patch
}
function blockText(block: NotionBlock): string { const text = block.richText?.map((item) => item.plainText).join('') ?? block.url ?? ''; return block.type.startsWith('heading_') ? `${'#'.repeat(Number(block.type.at(-1)) || 2)} ${text}` : block.type === 'to_do' ? `- [${block.checked ? 'x' : ' '}] ${text}` : block.type.includes('list_item') ? `- ${text}` : text }
function normalizeResource(object: Awaited<ReturnType<NotionHost['retrieve']>>, count: number, capturedAt: string): NormalizedResource { return { id: `notion:${object.kind}:${object.id}`, domain: object.kind === 'database' ? 'databases' : 'pages', type: object.kind, title: object.title, externalRef: object.url, revision: object.lastEditedTime, mediaType: 'application/vnd.notion.page+json', metadata: { blockCount: count, parentId: object.parentId ?? null }, provenance: { integrationId: NOTION_INTEGRATION_ID, capturedAt, actor: 'external' }, license: { kind: 'proprietary', holder: 'Notion workspace owner' } } }
function unsupportedWarnings(blocks: readonly NotionBlock[]): string[] { const supported = new Set(['paragraph','heading_1','heading_2','heading_3','bulleted_list_item','numbered_list_item','to_do','code','quote','callout','divider','bookmark','link_preview']); const types = [...new Set(blocks.filter((b) => !supported.has(b.type)).map((b) => b.type))]; return types.length ? [`Unsupported Notion block types were preserved only as evidence: ${types.join(', ')}.`] : [] }
function deliveryBundle(request: IntegrationRequest): IntegrationExportBundle { const markdown = typeof request.metadata?.markdown === 'string' ? request.metadata.markdown : ''; const kind = request.metadata?.deliveryKind === 'brand-guidelines' ? 'brand-guidelines' : 'design-system-guidelines'; return { name: `notion-${kind}`, files: [{ path: `${kind}.md`, mediaType: 'text/markdown', content: markdown }], warnings: markdown ? [] : ['No guideline markdown was supplied; publish is not ready.'] } }
function markdownToBlocks(markdown: string): readonly NotionPublishBlock[] { return markdown.split(/\n\n+/).filter(Boolean).slice(0, 1000).map((text) => text.startsWith('# ') ? { type: 'heading_1', text: text.slice(2) } : text.startsWith('## ') ? { type: 'heading_2', text: text.slice(3) } : text.startsWith('- ') ? { type: 'bulleted_list_item', text: text.slice(2) } : text.startsWith('```') ? { type: 'code', text: text.replace(/^```\w*\n?|```$/g, '') } : { type: 'paragraph', text }) }
function stableId(...parts: string[]): string { let hash = 2166136261; const value = parts.join('\0'); for (let i=0;i<value.length;i+=1) hash = Math.imul(hash ^ value.charCodeAt(i),16777619); return `notion:${(hash>>>0).toString(16).padStart(8,'0')}` }
function hostFailure(error: unknown): IntegrationResult<never> { if (error instanceof DOMException && error.name === 'AbortError') return failure('aborted','Notion operation was aborted.'); return failure('integration-failed', error instanceof Error ? error.message : String(error)) }
function failure<T = never>(code: IntegrationError['code'], message: string): IntegrationResult<T> { return { ok: false, error: { code, message } } }
