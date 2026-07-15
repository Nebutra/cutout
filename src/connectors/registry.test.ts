import { describe, expect, it, vi } from 'vitest'
import type { Connector, ConnectorContext, ConnectorInput, ConnectorPreview } from './contracts'
import { CONNECTOR_PROTOCOL } from './contracts'
import { builtinDescriptorConnectors, registerBuiltinDescriptorConnectors } from './descriptors'
import { ConnectorRegistry } from './registry'

const base = { documentId: 'project:1', revisionId: 'revision:1', revisionNumber: 1 }
const urlInput = { sourceKind: 'url', locator: 'https://example.com' } as const

function connector(overrides: Partial<Connector> = {}): Connector {
  return {
    manifest: {
      protocol: CONNECTOR_PROTOCOL, id: 'test.connector', name: 'Test', version: '1.0.0',
      availability: 'available', auth: { kind: 'none' },
      capabilities: [{ operation: 'preview', sourceKinds: ['url'] }],
    },
    preview: async (input: ConnectorInput, context: ConnectorContext) => ({
      ok: true,
      data: preview(input, context),
    }),
    ...overrides,
  }
}

function preview(input: ConnectorInput, context: ConnectorContext): ConnectorPreview {
  return {
    kind: 'connector-preview', connectorId: 'test.connector', base: context.base,
    sourceKind: input.sourceKind, summary: 'Preview', warnings: [],
    provenance: {
      connectorId: 'test.connector', connectorVersion: '1.0.0', operation: 'preview',
      sourceKind: input.sourceKind, recordedAt: '2026-07-11T00:00:00.000Z', externalRef: input.locator,
    },
  }
}

describe('ConnectorRegistry', () => {
  it('rejects duplicate connector ids and negotiates exact capabilities', () => {
    const registry = new ConnectorRegistry()
    expect(registry.register(connector())).toMatchObject({ ok: true })
    expect(registry.register(connector())).toMatchObject({
      ok: false, error: { code: 'duplicate-connector' },
    })
    expect(registry.negotiate('preview', 'url').map(({ manifest }) => manifest.id)).toEqual(['test.connector'])
    expect(registry.negotiate('import', 'url')).toEqual([])
    expect(registry.negotiate('preview', 'figma')).toEqual([])
  })

  it('rejects capability mismatch before calling an adapter', async () => {
    const previewFn = vi.fn(connector().preview)
    const registry = new ConnectorRegistry()
    registry.register(connector({ preview: previewFn }))
    await expect(registry.run({
      connectorId: 'test.connector', operation: 'preview', input: { sourceKind: 'video', locator: 'clip.mp4' },
      base, current: base,
    })).resolves.toMatchObject({ ok: false, error: { code: 'capability-mismatch' } })
    expect(previewFn).not.toHaveBeenCalled()
  })

  it('rejects stale revisions before invoking the adapter', async () => {
    const previewFn = vi.fn(connector().preview)
    const registry = new ConnectorRegistry()
    registry.register(connector({ preview: previewFn }))
    await expect(registry.run({
      connectorId: 'test.connector', operation: 'preview', input: urlInput, base,
      current: { ...base, revisionId: 'revision:2', revisionNumber: 2 },
    })).resolves.toMatchObject({ ok: false, error: { code: 'stale-revision' } })
    expect(previewFn).not.toHaveBeenCalled()
  })

  it('honors abort before and after an adapter runs', async () => {
    const before = new AbortController()
    before.abort()
    const registry = new ConnectorRegistry()
    registry.register(connector())
    await expect(registry.run({
      connectorId: 'test.connector', operation: 'preview', input: urlInput, base, current: base, signal: before.signal,
    })).resolves.toMatchObject({ ok: false, error: { code: 'aborted' } })

    const after = new AbortController()
    registry.register(connector({
      manifest: { ...connector().manifest, id: 'test.abort-after' },
      preview: async (input, context) => {
        after.abort()
        return { ok: true, data: preview(input, context) }
      },
    }))
    await expect(registry.run({
      connectorId: 'test.abort-after', operation: 'preview', input: urlInput, base, current: base, signal: after.signal,
    })).resolves.toMatchObject({ ok: false, error: { code: 'aborted' } })
  })

  it('requires authorization without persisting secrets and rejects secret-shaped results', async () => {
    const registry = new ConnectorRegistry()
    const authorized = connector({
      manifest: { ...connector().manifest, id: 'test.auth', availability: 'authorization-required', auth: { kind: 'api-key' } },
      preview: async (input, context) => ({ ok: true, data: { ...preview(input, context), connectorId: 'test.auth' } }),
    })
    registry.register(authorized)
    await expect(registry.run({
      connectorId: 'test.auth', operation: 'preview', input: urlInput, base, current: base,
    })).resolves.toMatchObject({ ok: false, error: { code: 'authorization-required' } })
    const accepted = await registry.run({
      connectorId: 'test.auth', operation: 'preview', input: urlInput, base, current: base,
      auth: { apiKey: 'sk-super-secret-value' },
    })
    expect(accepted.ok).toBe(true)
    expect(JSON.stringify(accepted)).not.toContain('sk-super-secret-value')

    registry.register(connector({
      manifest: { ...connector().manifest, id: 'test.leak' },
      preview: async (input, context) => ({
        ok: true, data: { ...preview(input, context), summary: 'Authorization: Bearer abcdefghijklmnop' },
      }),
    }))
    await expect(registry.run({
      connectorId: 'test.leak', operation: 'preview', input: urlInput, base, current: base,
    })).resolves.toMatchObject({ ok: false, error: { code: 'invalid-result' } })
  })

  it('redacts credential-shaped adapter errors', async () => {
    const registry = new ConnectorRegistry()
    registry.register(connector({ preview: async () => { throw new Error('apiKey=sk-super-secret-value') } }))
    const result = await registry.run({
      connectorId: 'test.connector', operation: 'preview', input: urlInput, base, current: base,
    })
    expect(result).toMatchObject({ ok: false, error: { code: 'connector-failed' } })
    expect(JSON.stringify(result)).not.toContain('sk-super-secret-value')
  })

  it('rejects opaque host-session credentials even without credential-shaped prefixes', async () => {
    const opaque = 'must-never-leave-context'
    const registry = new ConnectorRegistry()
    registry.register(connector({
      manifest: { ...connector().manifest, id: 'test.opaque-result' },
      preview: async (input, context) => ({
        ok: true,
        data: {
          ...preview(input, context),
          connectorId: 'test.opaque-result',
          summary: context.auth?.accessToken ?? 'missing',
        },
      }),
    }))
    registry.register(connector({
      manifest: { ...connector().manifest, id: 'test.opaque-error' },
      preview: async () => { throw new Error(`Host session failed: ${opaque}`) },
    }))

    await expect(registry.run({
      connectorId: 'test.opaque-result', operation: 'preview', input: urlInput,
      base, current: base, auth: { accessToken: opaque },
    })).resolves.toMatchObject({ ok: false, error: { code: 'invalid-result' } })
    await expect(registry.run({
      connectorId: 'test.opaque-error', operation: 'preview', input: urlInput,
      base, current: base, auth: { accessToken: opaque },
    })).resolves.toEqual({
      ok: false,
      error: { code: 'connector-failed', message: 'Host session failed: [REDACTED]' },
    })
  })

  it('registers honest built-ins and preserves descriptor provenance', async () => {
    const registry = new ConnectorRegistry()
    registerBuiltinDescriptorConnectors(registry)
    expect(registry.list()).toHaveLength(builtinDescriptorConnectors.length)
    await expect(registry.run({
      connectorId: 'cutout.url-descriptor', operation: 'preview', input: urlInput, base, current: base,
    })).resolves.toMatchObject({
      ok: true,
      data: {
        warnings: [expect.stringContaining('No remote content was fetched')],
        provenance: { connectorId: 'cutout.url-descriptor', operation: 'preview', externalRef: 'https://example.com' },
      },
    })
    await expect(registry.run({
      connectorId: 'cutout.figma-descriptor', operation: 'preview',
      input: { sourceKind: 'figma', locator: 'https://figma.com/file/abc' }, base, current: base,
    })).resolves.toMatchObject({ ok: false, error: { code: 'authorization-required' } })
    await expect(registry.run({
      connectorId: 'cutout.video-descriptor', operation: 'preview',
      input: { sourceKind: 'video', locator: 'clip.mp4' }, base, current: base,
    })).resolves.toMatchObject({ ok: false, error: { code: 'unavailable' } })
  })
})
