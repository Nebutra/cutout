import { describe, expect, it } from 'vitest'
import { createFigmaIntegration } from './figma'
import { createRepositoryIntegration } from './repository'
import { IntegrationRegistry } from '@/integration-sdk'

describe('legacy connector Integration SDK compatibility', () => {
  it('exposes Figma snapshot capabilities without claiming live sync', () => {
    const integration = createFigmaIntegration()
    expect(integration.manifest.protocol).toBe('integration-sdk.v1')
    expect(integration.manifest.dataDomains).toEqual(['design-files', 'design-tokens', 'components'])
    expect(integration.manifest.syncModes).toEqual(['none'])
    expect(integration.manifest.capabilities.map((item) => item.operation)).toEqual(['preview', 'import', 'export'])
  })

  it('exposes Repository preview/import while retaining host authorization', () => {
    const integration = createRepositoryIntegration({ scan: async () => { throw new Error('not invoked') } })
    expect(integration.manifest.auth.modes).toEqual(['host-session'])
    expect(integration.manifest.dataDomains).toEqual(['repositories'])
    expect(integration.manifest.capabilities.map((item) => item.operation)).toEqual(['preview', 'import'])
  })

  it('runs a Repository preview through integration-sdk.v1 without exposing host credentials', async () => {
    const integration = createRepositoryIntegration({
      scan: async () => ({
        snapshot: {
          type: 'repository-snapshot',
          label: 'Demo repo',
          role: 'reference',
          license: { kind: 'unknown', rationale: 'User must confirm.' },
          entries: [{ path: 'package.json', mediaType: 'application/json', text: '{}', bytes: 2, sha256: 'a'.repeat(64) }],
        },
        excluded: { symbolicLink: 0, secretPath: 0, secretContent: 0, ignoredDirectory: 0, binary: 0, oversized: 0, unsupported: 0 },
        frameworkHints: [],
      }),
    })
    const registry = new IntegrationRegistry(); registry.register(integration)
    const revision = { documentId: 'doc', revisionId: 'rev', revisionNumber: 1 }
    const result = await registry.run(integration.manifest.id, {
      operation: 'preview', base: revision, current: revision, locator: 'host-authorized:repo',
      metadata: { role: 'reference', license: { kind: 'unknown', rationale: 'User must confirm.' } },
      session: {
        id: 'session', integrationId: integration.manifest.id, surface: 'desktop', authMode: 'host-session',
        secretHandle: { kind: 'secret-handle', id: 'host:repository-picker' }, createdAt: '2026-07-12T00:00:00Z',
      },
    })
    expect(result).toMatchObject({ ok: true, data: { operation: 'preview', integrationId: 'cutout.repository' } })
    expect(JSON.stringify(result)).not.toContain('host:repository-picker')
  })
})
