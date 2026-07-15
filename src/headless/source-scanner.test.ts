import { mkdir, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import type { SourceIngestOperation } from '@/control-protocol'
import { scanSourceInput } from './source-scanner'

const license = { kind: 'unknown', rationale: 'Test supplied.' } as const

function fileOperation(path: string): SourceIngestOperation {
  return {
    type: 'source.ingest',
    input: { type: 'local-file-scan', path, sourceKind: 'code', role: 'implementation', license },
  }
}

describe('controlled source scanner', () => {
  it('reads only a regular relative file beneath the canonical project root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cutout-source-scan-'))
    try {
      await mkdir(join(root, 'src'))
      await writeFile(join(root, 'src', 'App.tsx'), 'export const App = () => null\n')
      const scanned = await scanSourceInput(root, fileOperation('src/App.tsx'))

      expect(scanned.input).toMatchObject({ type: 'local-file', path: 'src/App.tsx', sourceKind: 'code' })
      expect(scanned.artifacts[0]?.bytes.byteLength).toBeGreaterThan(0)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects a symlink pivot and skips secret files before repository hashing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cutout-source-scan-'))
    const outside = await mkdtemp(join(tmpdir(), 'cutout-source-outside-'))
    try {
      await writeFile(join(root, '.env.local'), 'SHOULD_NOT_BE_READ')
      await writeFile(join(root, 'package.json'), '{"name":"safe"}')
      await writeFile(join(outside, 'outside.ts'), 'export const outside = true')
      await symlink(join(outside, 'outside.ts'), join(root, 'pivot.ts'))

      await expect(scanSourceInput(root, fileOperation('pivot.ts'))).rejects.toThrow(/controlled project root|symbolic-link/)
      const repository = await scanSourceInput(root, {
        type: 'source.ingest',
        input: { type: 'repository-scan', root: '.', role: 'implementation', license },
      })
      expect(repository.input).toMatchObject({ type: 'repository-snapshot' })
      const entries = (repository.input.type === 'repository-snapshot' ? repository.input.entries : [])
      expect(entries.map((entry) => entry.path)).toEqual(['package.json'])
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })
})
