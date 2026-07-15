import { describe, expect, it, vi } from 'vitest'
import { IntegrationRegistry, assertAdapterConformance, runAdapterConformance, type IntegrationOperation, type IntegrationRequest } from '..'
import { createNotionIntegration } from './notion-adapter'
import { NotionRateLimitError, NotionWebhookDedupe, type NotionHost } from './notion-host'

const revision = { documentId: 'design:1', revisionId: 'revision:7', revisionNumber: 7 }
const session = { id: 'session:notion', integrationId: 'cutout.notion', surface: 'desktop' as const, authMode: 'oauth2' as const, secretHandle: { kind: 'secret-handle' as const, id: 'vault:notion:opaque' }, createdAt: '2026-07-12T00:00:00.000Z' }
const object = { id: 'page-1', kind: 'page' as const, title: 'Checkout brief', url: 'https://notion.so/page-1', lastEditedTime: '2026-07-12T00:00:00.000Z' }

function host(): NotionHost {
  return {
    retrieve: vi.fn(async () => object),
    listBlocks: vi.fn(async (_id, options) => options.cursor ? { items: [{ id: 'b2', type: 'to_do', checked: true, richText: [{ plainText: 'Ship responsive flow' }], lastEditedTime: object.lastEditedTime }] } : { items: [{ id: 'b1', type: 'heading_2', richText: [{ plainText: 'Needs' }], lastEditedTime: object.lastEditedTime }], nextCursor: 'opaque:2' }),
    publishPage: vi.fn(async () => ({ page: { ...object, id: 'published-1', title: 'Design System', url: 'https://notion.so/published-1' } })),
  }
}
function request(operation: IntegrationOperation, metadata?: Record<string, unknown>): IntegrationRequest { return { operation, session, base: revision, current: revision, locator: operation === 'publish' ? 'parent-page-1' : 'notion://page/page-1', ...(metadata ? { metadata } : {}) } }

describe('Notion Integration SDK adapter', () => {
  it('paginates selected shared content and normalizes it into a provenance-bearing SourcePatch', async () => {
    const fake = host(); const registry = new IntegrationRegistry(); registry.register(createNotionIntegration(fake))
    const preview = await registry.run('cutout.notion', request('preview'))
    expect(preview).toMatchObject({ ok: true, data: { operation: 'preview', resources: [{ id: 'notion:page:page-1', revision: object.lastEditedTime, metadata: { blockCount: 2 } }] } })
    if (!preview.ok) throw new Error('preview failed')
    const imported = await registry.run('cutout.notion', request('import', { reviewId: preview.data.id }))
    expect(imported).toMatchObject({ ok: true, data: { operation: 'import', sourcePatch: { sources: [{ kind: 'document', role: 'requirement', license: { kind: 'proprietary' } }], provenance: [{ operation: 'import' }] } } })
    expect(fake.listBlocks).toHaveBeenCalledTimes(2)
  })

  it('requires preview approval for publish and emits supported guideline blocks only', async () => {
    const fake = host(); const registry = new IntegrationRegistry(); registry.register(createNotionIntegration(fake))
    expect(await registry.run('cutout.notion', request('publish', { title: 'Kit', markdown: '# Kit' }))).toMatchObject({ ok: false, error: { code: 'conflict' } })
    const result = await registry.run('cutout.notion', request('publish', { approved: true, title: 'Kit', markdown: '# Kit\n\n## Colors\n\n- Primary' }))
    expect(result).toMatchObject({ ok: true, data: { targetRef: 'https://notion.so/published-1' } })
    expect(fake.publishPage).toHaveBeenCalledWith(expect.objectContaining({ parentPageId: 'parent-page-1', blocks: [{ type: 'heading_1', text: 'Kit' }, { type: 'heading_2', text: 'Colors' }, { type: 'bulleted_list_item', text: 'Primary' }] }), expect.objectContaining({ secretHandle: session.secretHandle }))
  })

  it('surfaces Retry-After without leaking credentials and rejects stale revisions', async () => {
    const fake = host(); fake.retrieve = vi.fn(async () => { throw new NotionRateLimitError(4) })
    const registry = new IntegrationRegistry(); registry.register(createNotionIntegration(fake))
    expect(await registry.run('cutout.notion', request('preview'))).toMatchObject({ ok: false, error: { code: 'integration-failed', message: expect.stringContaining('4 seconds') } })
    expect(await registry.run('cutout.notion', { ...request('preview'), current: { ...revision, revisionNumber: 8 } })).toMatchObject({ ok: false, error: { code: 'stale-revision' } })
  })

  it('treats verified webhooks as deduplicated stale signals, never snapshots', () => {
    const dedupe = new NotionWebhookDedupe(); const event = { deliveryId: 'delivery-1', objectId: 'page-1', eventType: 'page.content_updated', receivedAt: '2026-07-12T00:00:00Z', signatureVerifiedByHost: true as const }
    expect(dedupe.accept(event)).toEqual({ duplicate: false, staleObjectId: 'page-1' })
    expect(dedupe.accept(event)).toEqual({ duplicate: true, staleObjectId: 'page-1' })
  })

  it('passes the shared conformance harness with a fake authorized host', async () => {
    const adapter = createNotionIntegration(host())
    let previewId = ''
    const cases = await runAdapterConformance(adapter, (operation) => {
      if (operation === 'import') return request('import', { reviewId: previewId })
      if (operation === 'publish') return request('publish', { approved: true, title: 'Kit', markdown: '# Kit' })
      if (operation === 'export') return request('export', { deliveryKind: 'design-system-guidelines', markdown: '# Kit' })
      return request(operation)
    })
    // Conformance executes each operation independently, so seed import's required preview.
    const registry = new IntegrationRegistry(); registry.register(adapter)
    const preview = await registry.run('cutout.notion', request('preview')); if (preview.ok) previewId = preview.data.id
    const rerun = await runAdapterConformance(adapter, (operation) => operation === 'import' ? request('import', { reviewId: previewId }) : operation === 'publish' ? request('publish', { approved: true, title: 'Kit', markdown: '# Kit' }) : operation === 'export' ? request('export', { markdown: '# Kit' }) : request(operation))
    expect(cases.some((item) => item.name === 'valid manifest' && item.passed)).toBe(true)
    expect(() => assertAdapterConformance(rerun)).not.toThrow()
  })
})
