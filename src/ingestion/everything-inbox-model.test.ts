import { describe, expect, it } from 'vitest'
import { detectFileKind, previewEverythingInbox, projectSourcesToOutcome } from './everything-inbox-model'

describe('Everything Inbox model', () => {
  it('auto-types a mixed batch, deduplicates by hash, and keeps unsupported capabilities honest', async () => {
    const bytes = new TextEncoder().encode('export const Button = () => null')
    const preview = await previewEverythingInbox([
      { kind: 'text', text: 'We need a coherent checkout flow.' },
      { kind: 'file', file: { name: 'Button.tsx', mediaType: 'text/typescript', bytes } },
      { kind: 'file', file: { name: 'Button-copy.tsx', mediaType: 'text/typescript', bytes } },
      { kind: 'file', file: { name: 'walkthrough.mp4', mediaType: 'video/mp4', bytes: new Uint8Array([1]) } },
      { kind: 'integration', integrationId: 'notion', title: 'Notion workspace' },
      { kind: 'url', url: 'https://example.com/reference' },
    ], { capturedAt: '2026-07-12T00:00:00.000Z' })
    expect(preview.candidates.map((item) => item.status)).toEqual(['ready', 'ready', 'duplicate', 'adapter-required', 'adapter-required', 'ready'])
    expect(preview.patch.sources).toHaveLength(3)
    expect(preview.candidates.at(-1)?.detail).toBeUndefined()
  })
  it('projects requirement sources to needs and all approved sources to production refs', async () => {
    const preview = await previewEverythingInbox([{ kind: 'text', title: 'Checkout', text: 'Must support guest checkout.', hint: 'need' }, { kind: 'url', url: 'https://example.com' }], { capturedAt: '2026-07-12T00:00:00.000Z' })
    const projection = projectSourcesToOutcome(preview.patch.sources)
    expect(projection.needs).toMatchObject([{ statement: 'Checkout' }])
    expect(projection.materialRefs).toHaveLength(2)
  })
  it('distinguishes screenshots, photos, code and video without reading a host path', () => {
    expect(detectFileKind('checkout-screenshot.png', 'image/png')).toBe('screenshot')
    expect(detectFileKind('portrait.jpg', 'image/jpeg')).toBe('photo')
    expect(detectFileKind('app.tsx')).toBe('code')
    expect(detectFileKind('demo.mov')).toBe('video')
  })
})
