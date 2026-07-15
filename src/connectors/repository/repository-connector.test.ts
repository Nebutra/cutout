import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ConnectorRegistry } from '../registry'
import { createNodeRepositoryHost } from './node-host'
import { createRepositoryConnector, REPOSITORY_CONNECTOR_ID } from './repository-connector'

const base = { documentId: 'document:1', revisionId: 'revision:1', revisionNumber: 1 }
const license = { kind: 'proprietary', holder: 'Project owner' } as const

describe('repository connector vertical slice', () => {
  it('previews and imports a reviewed safe inventory with provenance and receipt', async () => {
    const controlled = await mkdtemp(join(tmpdir(), 'cutout-repository-'))
    const repository = join(controlled, 'product')
    await mkdir(join(repository, 'src'), { recursive: true })
    await writeFile(join(repository, 'vite.config.ts'), 'export default {}')
    await writeFile(join(repository, 'src', 'main.tsx'), 'export const app = true')
    await writeFile(join(repository, '.env'), 'TOKEN=hidden')
    const registry = new ConnectorRegistry()
    registry.register(createRepositoryConnector(await createNodeRepositoryHost([controlled])))

    const input = { sourceKind: 'repository' as const, locator: repository, title: 'Product repo', metadata: { role: 'reference', license } }
    const preview = await registry.run({ connectorId: REPOSITORY_CONNECTOR_ID, operation: 'preview', input, base, current: base })
    expect(preview).toMatchObject({
      ok: true,
      data: {
        summary: '2 safe repository entries ready for review.',
        details: {
          label: 'Product repo',
          entries: [{ path: 'src/main.tsx' }, { path: 'vite.config.ts' }],
          frameworkHints: [{ framework: 'vite', confidence: 'high' }],
          excluded: { secretPath: 1 },
          license,
        },
        provenance: { externalRef: 'repository://authorized/Product%20repo' },
      },
    })
    if (!preview.ok || preview.data.kind !== 'connector-preview') throw new Error('preview failed')
    const reviewId = (preview.data.details as { reviewId: string }).reviewId
    const imported = await registry.run({
      connectorId: REPOSITORY_CONNECTOR_ID, operation: 'import',
      input: { ...input, metadata: { ...input.metadata, reviewId } }, base, current: base,
    })
    expect(imported).toMatchObject({
      ok: true,
      data: {
        sourcePatch: {
          sources: [{ kind: 'repository', title: 'Repository snapshot: Product repo', license, content: expect.any(Array) }],
          provenance: [{ tool: 'cutout.everything-inbox.v1', actor: { id: 'system:repository-connector' } }],
        },
        receipt: { connectorId: REPOSITORY_CONNECTOR_ID, operation: 'import', status: 'succeeded' },
      },
    })
    expect(JSON.stringify(imported)).not.toContain(repository)
  })

  it('requires explicit license and a matching one-use reviewed locator', async () => {
    const controlled = await mkdtemp(join(tmpdir(), 'cutout-repository-'))
    const repository = join(controlled, 'repo')
    await mkdir(repository)
    await writeFile(join(repository, 'README.md'), '# repo')
    const registry = new ConnectorRegistry()
    registry.register(createRepositoryConnector(await createNodeRepositoryHost([controlled])))
    const missingLicense = { sourceKind: 'repository' as const, locator: repository, metadata: { role: 'reference' } }
    await expect(registry.run({ connectorId: REPOSITORY_CONNECTOR_ID, operation: 'preview', input: missingLicense, base, current: base }))
      .resolves.toMatchObject({ ok: false, error: { code: 'connector-failed', message: expect.stringContaining('license') } })

    const input = { sourceKind: 'repository' as const, locator: repository, metadata: { role: 'reference', license } }
    const preview = await registry.run({ connectorId: REPOSITORY_CONNECTOR_ID, operation: 'preview', input, base, current: base })
    if (!preview.ok || preview.data.kind !== 'connector-preview') throw new Error('preview failed')
    const reviewId = (preview.data.details as { reviewId: string }).reviewId
    await expect(registry.run({
      connectorId: REPOSITORY_CONNECTOR_ID, operation: 'import',
      input: { ...input, locator: `${repository}-other`, metadata: { ...input.metadata, reviewId } }, base, current: base,
    })).resolves.toMatchObject({ ok: false, error: { code: 'stale-revision' } })
  })

  it('rejects roots outside the grant and root symlinks', async () => {
    const controlled = await mkdtemp(join(tmpdir(), 'cutout-controlled-'))
    const outside = await mkdtemp(join(tmpdir(), 'cutout-outside-'))
    const link = join(controlled, 'linked-repo')
    await symlink(outside, link)
    const host = await createNodeRepositoryHost([controlled])
    const signal = new AbortController().signal
    await expect(host.scan(outside, { role: 'reference', license, signal })).rejects.toThrow('outside the controlled roots')
    await expect(host.scan(link, { role: 'reference', license, signal })).rejects.toThrow('symbolic link')
  })
})
