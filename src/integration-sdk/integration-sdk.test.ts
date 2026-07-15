import { describe, expect, it } from 'vitest'
import {
  INTEGRATION_SDK_PROTOCOL,
  IntegrationRegistry,
  adapterRequiredManifest,
  assertAdapterConformance,
  capability,
  runAdapterConformance,
  type IntegrationAdapter,
  type IntegrationManifest,
  type IntegrationRequest,
} from '.'

const revision = { documentId: 'doc-1', revisionId: 'rev-1', revisionNumber: 1 }

function manifest(overrides: Partial<IntegrationManifest> = {}): IntegrationManifest {
  return {
    protocol: INTEGRATION_SDK_PROTOCOL,
    id: 'test.docs', version: '1.0.0',
    provider: { id: 'test', name: 'Test' }, product: { id: 'docs', name: 'Docs' },
    surfaces: ['desktop', 'mcp'], capabilities: [capability('preview', ['documents'])],
    auth: { modes: ['none'] }, dataDomains: ['documents'], syncModes: ['none'],
    eventModel: { cursor: 'none', webhooks: 'none', delivery: 'at-most-once' },
    limits: { maxBatchItems: 10, maxPayloadBytes: 1024 }, availability: 'available',
    ...overrides,
  }
}

function request(overrides: Partial<IntegrationRequest> = {}): IntegrationRequest {
  return {
    operation: 'preview', base: revision, current: revision, locator: 'host://document/1',
    session: { id: 'session-1', integrationId: 'test.docs', surface: 'desktop', authMode: 'none', createdAt: '2026-07-12T00:00:00Z' },
    ...overrides,
  }
}

function adapter(customManifest = manifest()): IntegrationAdapter {
  return {
    manifest: customManifest,
    async preview(req) {
      return { ok: true, data: { id: 'plan-1', integrationId: customManifest.id, operation: 'preview', base: req.base, resources: [], warnings: [], conflictPolicy: 'fail' } }
    },
  }
}

describe('integration-sdk.v1', () => {
  it('negotiates by operation, normalized domain, and product surface', () => {
    const registry = new IntegrationRegistry()
    registry.register(adapter())
    expect(registry.negotiate({ operation: 'preview', domain: 'documents', surface: 'mcp' })).toHaveLength(1)
    expect(registry.negotiate({ operation: 'publish', domain: 'documents', surface: 'mcp' })).toHaveLength(0)
    expect(registry.negotiate({ operation: 'preview', domain: 'assets', surface: 'mcp' })).toHaveLength(0)
  })

  it('enforces revision guards and host-owned secret handles', async () => {
    const oauthManifest = manifest({ auth: { modes: ['oauth2'], oauth: { hostBoundary: true, scopes: ['read'] } } })
    const registry = new IntegrationRegistry(); registry.register(adapter(oauthManifest))
    const missingHandle = await registry.run('test.docs', request({ session: { ...request().session, authMode: 'oauth2' } }))
    expect(missingHandle).toMatchObject({ ok: false, error: { code: 'authorization-required' } })
    const stale = await registry.run('test.docs', request({ current: { ...revision, revisionNumber: 2 }, session: { ...request().session, authMode: 'oauth2', secretHandle: { kind: 'secret-handle', id: 'vault:oauth:test' } } }))
    expect(stale).toMatchObject({ ok: false, error: { code: 'stale-revision' } })
  })

  it('rejects OAuth manifests that cross the host boundary and credential-shaped results', async () => {
    const unsafe = manifest({ auth: { modes: ['oauth2'] } })
    expect(new IntegrationRegistry().register(adapter(unsafe))).toMatchObject({ ok: false, error: { code: 'invalid-manifest' } })
    const leaking: IntegrationAdapter = { ...adapter(), async preview(req) { return { ok: true, data: { id: 'plan', integrationId: 'test.docs', operation: 'preview', base: req.base, resources: [], warnings: ['token=super-secret-value'], conflictPolicy: 'fail' } } } }
    const registry = new IntegrationRegistry(); registry.register(leaking)
    expect(await registry.run('test.docs', request())).toMatchObject({ ok: false, error: { code: 'invalid-result' } })
  })

  it('keeps unimplemented products truthful as adapter-required manifests', async () => {
    const required = adapterRequiredManifest({ id: 'cutout.notion', provider: 'Notion', product: 'Notion', domains: ['documents', 'pages'], authModes: ['oauth2'] })
    const registry = new IntegrationRegistry(); registry.register({ manifest: required })
    const result = await registry.run('cutout.notion', request({ session: { ...request().session, integrationId: 'cutout.notion', authMode: 'oauth2', secretHandle: { kind: 'secret-handle', id: 'vault:notion' } } }))
    expect(result).toMatchObject({ ok: false, error: { code: 'adapter-required' } })
    expect(required.capabilities).toEqual([])
  })

  it('ships an executable adapter conformance harness', async () => {
    const cases = await runAdapterConformance(adapter(), () => request())
    expect(cases.every((item) => item.passed)).toBe(true)
    expect(() => assertAdapterConformance(cases)).not.toThrow()
  })
})
