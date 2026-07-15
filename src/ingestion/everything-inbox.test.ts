import { describe, expect, it } from 'vitest'
import type { DesignDocument } from '@/design-ir'
import {
  applySourcePatch,
  ingestEverything,
  type EverythingInput,
} from './everything-inbox'

const capturedAt = '2026-07-10T12:00:00.000Z'
const license = { kind: 'proprietary', holder: 'Example, Inc.' } as const

function baseDocument(): DesignDocument {
  return {
    version: 'design-ir.v1',
    meta: { id: 'project:inbox', title: 'Inbox', createdAt: capturedAt, updatedAt: capturedAt },
    revision: {
      id: 'revision:1', number: 1, createdAt: capturedAt,
      author: { kind: 'human', id: 'user:example' },
    },
    needs: [], sources: [], brands: [], tokens: [], components: [], materials: [], provenance: [], relations: [],
  }
}

async function ingest(input: EverythingInput) {
  const result = await ingestEverything(input, { capturedAt, actorId: 'user:example' })
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error)
  return result.data
}

describe('Everything Inbox v1', () => {
  it('content-addresses local files and deduplicates an already-known digest', async () => {
    const first = await ingest({
      type: 'local-file', path: 'references/hero.png', bytes: new Uint8Array([1, 2, 3]),
      sourceKind: 'screenshot', role: 'reference', license,
      promptProvenance: 'Use this as visual reference.',
    })
    expect(first.patch.sources).toHaveLength(1)
    const source = first.patch.sources[0]
    expect(source.content[0]).toMatchObject({
      uri: expect.stringContaining('cutout://ingestion/sha256/'),
      sha256: '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
    })
    // Assert the real known digest separately; keeping URI and digest opaque in
    // product code avoids treating a filename as identity.
    expect(source.content[0]?.sha256).toBe('039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81')
    expect(source.ingestion).toMatchObject({
      origin: 'local-file', relativePath: 'references/hero.png', bytes: 3,
      prompt: 'Use this as visual reference.',
    })

    const applied = applySourcePatch(baseDocument(), first.patch, {
      id: 'revision:2', createdAt: capturedAt, actor: { kind: 'import', id: 'inbox:v1' },
    })
    expect(applied.ok).toBe(true)
    if (!applied.ok) throw new Error(applied.error)
    const duplicate = await ingestEverything({
      type: 'local-file', path: 'renamed.png', bytes: new Uint8Array([1, 2, 3]),
      sourceKind: 'screenshot', role: 'reference', license,
    }, { capturedAt, existingSources: applied.data.sources })
    expect(duplicate).toMatchObject({ ok: true, data: { patch: { sources: [] }, skipped: [{ reason: 'duplicate-content' }] } })
  })

  it('refuses path traversal, absolute paths, and symbolic links before creating a source', async () => {
    for (const path of ['../secret.png', '/Users/me/secret.png', 'C:\\keys\\secret.png']) {
      await expect(ingestEverything({
        type: 'local-file', path, bytes: new Uint8Array([1]), sourceKind: 'photo', role: 'reference', license,
      }, { capturedAt })).resolves.toMatchObject({ ok: false })
    }
    await expect(ingestEverything({
      type: 'local-file', path: 'link.png', bytes: new Uint8Array([1]), isSymbolicLink: true,
      sourceKind: 'photo', role: 'reference', license,
    }, { capturedAt })).resolves.toMatchObject({ ok: false, error: expect.stringContaining('symbolic') })
  })

  it('refuses credential-shaped local file paths before they become Design IR metadata', async () => {
    await expect(ingestEverything({
      type: 'local-file', path: 'secrets/provider-api-key.txt', bytes: new Uint8Array([1]),
      sourceKind: 'document', role: 'reference', license,
    }, { capturedAt })).resolves.toMatchObject({ ok: false, error: expect.stringContaining('Credential-shaped') })
  })

  it('preserves URL descriptors and captured metadata without fetching the URL', async () => {
    const outcome = await ingest({
      type: 'url-descriptor', url: 'https://refero.design/example', title: 'Example checkout',
      capturedMediaType: 'text/html', role: 'reference', license: { kind: 'unknown', rationale: 'User supplied.' },
    })
    const source = outcome.patch.sources[0]
    expect(source.kind).toBe('url')
    expect(source.content[0]).toEqual(expect.objectContaining({ uri: 'https://refero.design/example' }))
    expect(source.ingestion).toEqual(expect.objectContaining({
      origin: 'url-descriptor',
      descriptor: { kind: 'url', url: 'https://refero.design/example', title: 'Example checkout', capturedMediaType: 'text/html' },
    }))
  })

  it('keeps role, license, and prompt provenance for inline ideas and stories', async () => {
    const outcome = await ingest({
      type: 'inline-text', sourceKind: 'idea', title: 'First direction', text: 'A calm B2B dashboard.',
      role: 'requirement', license, promptProvenance: 'User said: explore calm workflows.',
    })
    expect(outcome.patch.sources[0]).toMatchObject({
      kind: 'idea', role: 'requirement', license,
      ingestion: { origin: 'inline-text', prompt: 'User said: explore calm workflows.' },
    })
    expect(outcome.patch.provenance[0]).toMatchObject({ operation: 'import', sourceIds: [outcome.patch.sources[0]?.id] })
  })

  it('rejects conflicting source or provenance identities instead of silently mutating audit history', async () => {
    const outcome = await ingest({
      type: 'inline-text', sourceKind: 'story', title: 'Checkout story', text: 'A buyer completes checkout.',
      role: 'requirement', license,
    })
    const source = outcome.patch.sources[0]
    const provenance = outcome.patch.provenance[0]
    if (!source || !provenance) throw new Error('Expected an ingestion patch.')
    const existing: DesignDocument = {
      ...baseDocument(),
      sources: [source],
      provenance: [{ ...provenance, tool: 'different-importer' }],
    }
    expect(applySourcePatch(existing, outcome.patch, {
      id: 'revision:2', createdAt: capturedAt, actor: { kind: 'import', id: 'inbox:v1' },
    })).toMatchObject({
      ok: false,
      error: expect.stringContaining('conflicts with existing provenance id'),
    })
  })

  it('creates repository snapshots from a safe inventory and never includes secrets or binary payloads', async () => {
    const outcome = await ingest({
      type: 'repository-snapshot', label: 'marketing-site', role: 'implementation', license,
      entries: [
        { path: 'package.json', bytes: 1024 },
        { path: 'src/App.tsx', bytes: 2048 },
        { path: 'public/logo.png', bytes: 8_000_000, mediaType: 'image/png' },
        { path: '.env.local', bytes: 10 },
        { path: 'secrets/api-key.txt', bytes: 10 },
        { path: 'node_modules/x/index.js', bytes: 10 },
        { path: 'linked/package.json', bytes: 10, isSymbolicLink: true },
      ],
    })
    const source = outcome.patch.sources[0]
    expect(source.kind).toBe('repository')
    expect(source.ingestion?.descriptor).toEqual({
      kind: 'repository', label: 'marketing-site', includedPaths: ['package.json', 'src/App.tsx'], excludedCount: 5,
    })
    expect(JSON.stringify(source)).not.toContain('.env')
    expect(JSON.stringify(source)).not.toContain('api-key')
    expect(JSON.stringify(source)).not.toContain('logo.png')
  })
})
