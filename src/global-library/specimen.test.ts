import { describe, expect, it } from 'vitest'
import type { DesignDocument } from '@/design-ir'
import { globalLibraryItemSchema } from './contracts'
import { GlobalLibraryStore } from './store'
import { buildSpecimenLibraryItem } from './specimen'

const at = '2026-07-15T00:00:00.000Z'

const document = {
  version: 'design-ir.v1',
  meta: { id: 'project.trace', title: 'Trace Console', createdAt: at, updatedAt: at },
  revision: { id: 'revision.3', number: 3, createdAt: at, author: { kind: 'human', id: 'user' } },
  needs: [], sources: [], brands: [], tokens: [], components: [], materials: [], provenance: [], relations: [],
} satisfies DesignDocument

const files = [
  { path: 'design-system.html', content: '<!doctype html><html><body>specimen</body></html>' },
  { path: 'demo.html', content: '<!doctype html><html><body>demo</body></html>' },
  { path: 'tokens.json', content: '{}' },
]

function memoryContentSink() {
  const blobs = new Map<string, { bytes: Uint8Array; mediaType: string }>()
  return {
    blobs,
    sink: {
      async put(bytes: Uint8Array, mediaType: string) {
        const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
        const sha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
        blobs.set(sha256, { bytes, mediaType })
        return { sha256, size: bytes.byteLength }
      },
    },
  }
}

describe('buildSpecimenLibraryItem', () => {
  it('stores only the specimen HTML files as text/plain artifacts, ignoring the other compiled files', async () => {
    const { sink, blobs } = memoryContentSink()
    const { item, approval } = await buildSpecimenLibraryItem({
      document, files, contentSink: sink, approvalId: 'approval.specimen', createdAt: at,
    })
    expect(item.content.artifacts.map((artifact) => artifact.path).sort()).toEqual(['demo.html', 'design-system.html'])
    expect(item.content.artifacts.every((artifact) => artifact.mediaType === 'text/plain')).toBe(true)
    expect(item.kind).toBe('design-system-kit')
    expect(item.origin).toMatchObject({ kind: 'generated', producer: 'cutout.design-kit', sourceRevision: 'revision.3' })
    expect(approval.contentSha256).toBe(item.contentSha256)
    expect(blobs.size).toBe(2)
    expect(() => globalLibraryItemSchema.parse(item)).not.toThrow()
  })

  it('produces an item GlobalLibraryStore.saveApproved actually accepts', async () => {
    const { sink } = memoryContentSink()
    const { item, approval } = await buildSpecimenLibraryItem({
      document, files, contentSink: sink, approvalId: 'approval.specimen', createdAt: at,
    })
    let saved: unknown = { protocol: 'cutout.global-library.v1', revision: 0, items: [], collections: [], projectReferences: [], updatedAt: at }
    const store = new GlobalLibraryStore({
      async load() { return saved },
      async compareAndSwap(expected, next) {
        if (expected !== (saved as { revision: number }).revision) return false
        saved = next
        return true
      },
    }, () => at)
    const catalog = await store.saveApproved(item, approval)
    expect(catalog.items).toHaveLength(1)
    expect(catalog.items[0]?.id).toBe(item.id)
  })

  it('is stable across identical input and rejects a files list with no specimen artifacts', async () => {
    const { sink: sinkA } = memoryContentSink()
    const { sink: sinkB } = memoryContentSink()
    const first = await buildSpecimenLibraryItem({ document, files, contentSink: sinkA, approvalId: 'a', createdAt: at })
    const second = await buildSpecimenLibraryItem({ document, files, contentSink: sinkB, approvalId: 'a', createdAt: at })
    expect(second.item.contentSha256).toBe(first.item.contentSha256)

    const { sink: sinkC } = memoryContentSink()
    await expect(buildSpecimenLibraryItem({
      document, files: [{ path: 'tokens.json', content: '{}' }], contentSink: sinkC, approvalId: 'a', createdAt: at,
    })).rejects.toThrow('No design-system.html or demo.html file was provided.')
  })
})
