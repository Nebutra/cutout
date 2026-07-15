import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { scanLocalRepository } from './repo-scanner'
import { ingestEverything } from './everything-inbox'

const roots: string[] = []
const license = { kind: 'proprietary', holder: 'Example, Inc.' } as const

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cutout-repo-scanner-'))
  roots.push(root)
  return root
}

async function file(root: string, relativePath: string, contents: string): Promise<void> {
  const target = join(root, relativePath)
  await mkdir(join(target, '..'), { recursive: true })
  await writeFile(target, contents)
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('scanLocalRepository', () => {
  it('builds a safe inventory without placing source contents in the snapshot', async () => {
    const root = await fixture()
    await file(root, 'package.json', '{"private":true}')
    await file(root, 'src/App.tsx', 'export function App() { return <main /> }')
    await file(root, 'README.md', '# Product')
    await file(root, 'DESIGN.md', '# Design')

    const result = await scanLocalRepository(root, { label: 'product', role: 'implementation', license })

    expect(result.snapshot).toMatchObject({ type: 'repository-snapshot', label: 'product', role: 'implementation', license })
    expect(result.snapshot.entries.map((entry) => entry.path)).toEqual([
      'DESIGN.md', 'README.md', 'package.json', 'src/App.tsx',
    ])
    expect(result.snapshot.entries.every((entry) => /^[a-f0-9]{64}$/.test(entry.sha256 ?? ''))).toBe(true)
    expect(JSON.stringify(result.snapshot)).not.toContain('return <main')
    expect(JSON.stringify(result.snapshot)).not.toContain('"private":true')
  })

  it('rejects a root that is a symlink and excludes symlink children without following them', async () => {
    const root = await fixture()
    const outside = await fixture()
    await file(root, 'src/App.tsx', 'export const app = true')
    await file(outside, 'secret.ts', 'export const secret = "outside"')
    await symlink(join(outside, 'secret.ts'), join(root, 'src', 'linked.ts'))
    const linkedRoot = `${root}-link`
    await symlink(root, linkedRoot)
    roots.push(linkedRoot)

    await expect(scanLocalRepository(linkedRoot, { label: 'linked', role: 'implementation', license })).rejects.toThrow('symbolic link')
    const result = await scanLocalRepository(root, { label: 'product', role: 'implementation', license })
    expect(result.snapshot.entries.map((entry) => entry.path)).toEqual(['src/App.tsx'])
    expect(result.excluded.symbolicLink).toBe(1)
    expect(JSON.stringify(result.snapshot)).not.toContain('linked.ts')
  })

  it('never accepts traversal-shaped labels', async () => {
    const root = await fixture()
    await file(root, 'src/App.tsx', 'export const app = true')

    await expect(scanLocalRepository(root, { label: '../unsafe', role: 'implementation', license })).rejects.toThrow('label')
  })

  it('filters secret paths, secret-looking contents, binary files, generated folders, and oversized files', async () => {
    const root = await fixture()
    await file(root, 'src/App.tsx', 'export const app = true')
    await file(root, '.env.local', 'OPENAI_API_KEY=sk-this-should-not-be-recorded')
    await file(root, 'src/provider.ts', 'const key = "sk-this-should-not-be-recorded"')
    await file(root, 'node_modules/pkg/index.js', 'module.exports = 1')
    await file(root, 'dist/index.js', 'generated')
    await file(root, 'public/logo.png', '\0PNG\0')
    await file(root, 'src/large.ts', 'x'.repeat(80))

    const result = await scanLocalRepository(root, {
      label: 'product', role: 'implementation', license, maxFileBytes: 64,
    })

    expect(result.snapshot.entries.map((entry) => entry.path)).toEqual(['src/App.tsx'])
    expect(result.excluded).toMatchObject({ secretPath: 1, secretContent: 1, ignoredDirectory: 2, binary: 1, oversized: 1 })
    expect(JSON.stringify(result.snapshot)).not.toContain('sk-this')
    expect(JSON.stringify(result.snapshot)).not.toContain('.env')
  })

  it('derives framework hints only from observed configuration and source evidence', async () => {
    const root = await fixture()
    await file(root, 'next.config.ts', 'export default {}')
    await file(root, 'app/page.tsx', 'export default function Page() { return null }')
    await file(root, 'vite.config.ts', 'export default {}')
    await file(root, 'src/main.tsx', 'export {}')
    await file(root, 'nuxt.config.ts', 'export default {}')
    await file(root, 'app.vue', '<template />')
    await file(root, 'src/routes/__root.tsx', 'export {}')
    await file(root, 'src/router.tsx', 'createRouter({})')

    const result = await scanLocalRepository(root, { label: 'multi', role: 'implementation', license })
    expect(result.frameworkHints).toEqual(expect.arrayContaining([
      expect.objectContaining({ framework: 'next', evidence: expect.arrayContaining(['next.config.ts', 'app/page.tsx']) }),
      expect.objectContaining({ framework: 'vite', evidence: expect.arrayContaining(['vite.config.ts', 'src/main.tsx']) }),
      expect.objectContaining({ framework: 'nuxt', evidence: expect.arrayContaining(['nuxt.config.ts', 'app.vue']) }),
      expect.objectContaining({ framework: 'tanstack-start', evidence: expect.arrayContaining(['src/routes/__root.tsx', 'src/router.tsx']) }),
    ]))
    expect(result.frameworkHints.every((hint) => hint.evidence.length > 0)).toBe(true)
  })

  it('makes a changed source file a distinct repository descriptor without recording its text', async () => {
    const root = await fixture()
    await file(root, 'src/App.tsx', 'export const title = "first"')
    const first = await scanLocalRepository(root, { label: 'product', role: 'implementation', license })
    await file(root, 'src/App.tsx', 'export const title = "second"')
    const second = await scanLocalRepository(root, { label: 'product', role: 'implementation', license })

    const initial = await ingestEverything(first.snapshot, { capturedAt: '2026-07-11T00:00:00.000Z' })
    const changed = await ingestEverything(second.snapshot, { capturedAt: '2026-07-11T00:00:00.000Z' })
    expect(initial).toMatchObject({ ok: true })
    expect(changed).toMatchObject({ ok: true })
    if (!initial.ok || !changed.ok) throw new Error('Expected repository ingestion.')
    expect(initial.data.patch.sources[0]?.id).not.toEqual(changed.data.patch.sources[0]?.id)
    expect(JSON.stringify(changed.data.patch.sources[0])).not.toContain('second')
  })

  it('enforces traversal and file-count limits before returning a partial inventory', async () => {
    const root = await fixture()
    await file(root, 'src/one.ts', 'export {}')
    await file(root, 'src/two.ts', 'export {}')

    await expect(scanLocalRepository(root, {
      label: 'limited', role: 'implementation', license, maxEntries: 1,
    })).rejects.toThrow('entry limit')
  })
})
