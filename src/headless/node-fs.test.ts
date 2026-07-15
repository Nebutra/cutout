import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createNodeFsRuntimeStore, type HeadlessProjectState } from './index'
import { compileHeadlessDesignKit } from '@/design-kit'
import { compileBrandKit, type BrandKitInput } from '@/brand-kit'
import { compileComponentCandidates, type ComponentManifest } from '@/components-compiler'
import { compileStarter } from '@/starter-compiler'
import { replayRunEvents } from '@/agent-runtime/run-events'

const DIGEST = 'b'.repeat(64)

function sha256(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex')
}

function state(): HeadlessProjectState {
  return {
    manifest: {
      version: 'cutout.manifest.v1',
      project: { id: 'project', name: 'Project' },
      files: { designIr: 'design-ir.json', designMarkdown: 'DESIGN.md', artifactIndex: 'artifacts.json', policy: 'policy.json', controlLedger: 'control-ledger.json' },
    },
    design: {
      version: 'design-ir.v1',
      meta: { id: 'project', title: 'Project', createdAt: '2026-07-10T00:00:00.000Z', updatedAt: '2026-07-10T00:00:00.000Z' },
      revision: { id: 'r1', number: 1, createdAt: '2026-07-10T00:00:00.000Z', author: { kind: 'human', id: 'human' } },
      needs: [], sources: [], brands: [], tokens: [], components: [], materials: [], provenance: [], relations: [],
    },
    designMarkdown: '# Project',
    artifactIndex: { version: 'cutout.artifacts.v1', artifacts: [{ sha256: DIGEST, mediaType: 'text/plain', byteLength: 0 }] },
    policy: { version: 'cutout.policy.v1', allowApply: false, allowedOperations: ['project.context'], requireApprovalForExternal: true },
  }
}

describe('Node filesystem runtime store', () => {
  it('writes only fixed .cutout paths and round-trips a state', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cutout-runtime-'))
    try {
      const store = createNodeFsRuntimeStore(root)
      await store.save(state())
      expect(await store.load()).toMatchObject({ manifest: { project: { id: 'project' } }, designMarkdown: '# Project' })
      expect(await readFile(join(root, '.cutout', 'manifest.json'), 'utf8')).toContain('cutout.manifest.v1')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('durably stores replayable run events in the managed transaction', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cutout-runtime-'))
    try {
      const store = createNodeFsRuntimeStore(root)
      const input = {
        ...state(),
        runEvents: replayRunEvents([
          { eventId: 'event-1', runId: 'run-1', at: 1, type: 'run-started', mode: 'create' },
          { eventId: 'event-2', runId: 'run-1', at: 2, type: 'intent-recorded', intent: 'Build the verified result.' },
        ]),
      }
      await store.save(input)
      const loaded = await store.load()

      expect(loaded.runEvents?.activeRun).toMatchObject({ runId: 'run-1', status: 'running', intent: 'Build the verified result.' })
      expect(await readFile(join(root, '.cutout', 'run-events.json'), 'utf8')).toContain('agent-run-events.v1')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects unsafe manifest file names rather than resolving them outside .cutout', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cutout-runtime-'))
    try {
      const unsafe = state()
      unsafe.manifest = { ...unsafe.manifest, files: { ...unsafe.manifest.files, designIr: '../design-ir.json' } }
      await expect(createNodeFsRuntimeStore(root).save(unsafe)).rejects.toThrow('safe .cutout file name')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('recovers a crash-left journal by rolling every affected revision file back together', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cutout-runtime-'))
    try {
      const store = createNodeFsRuntimeStore(root)
      await store.save(state())
      const directory = join(root, '.cutout')
      await writeFile(join(directory, 'DESIGN.md'), '# Interrupted revision')
      await writeFile(join(directory, 'policy.json'), JSON.stringify({ version: 'cutout.policy.v1', allowApply: false, allowedOperations: ['validate'], requireApprovalForExternal: true }))
      await writeFile(join(directory, 'DESIGN.md.cutout-tmp-crashed-process'), 'incomplete temporary bytes')
      await writeFile(join(directory, '.transaction.json'), JSON.stringify({
        version: 1,
        id: 'crash-test',
        files: [
          { name: 'DESIGN.md', contents: '# Project' },
          { name: 'policy.json', contents: JSON.stringify(state().policy, null, 2) + '\n' },
        ],
      }))

      const recovered = await store.load()
      expect(recovered.designMarkdown).toBe('# Project')
      expect(recovered.policy.allowedOperations).toEqual(['project.context'])
      await expect(readFile(join(directory, '.transaction.json'))).rejects.toMatchObject({ code: 'ENOENT' })
      await expect(readFile(join(directory, 'DESIGN.md.cutout-tmp-crashed-process'))).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('recomputes object SHA-256 from persisted bytes and rejects a caller hash mismatch', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cutout-runtime-'))
    try {
      const store = createNodeFsRuntimeStore(root)
      const bytes = new TextEncoder().encode('verified artifact')
      const actual = sha256(bytes)
      await expect(store.writeArtifact({ bytes, mediaType: 'text/plain', sha256: DIGEST })).rejects.toThrow('does not match')

      const artifact = await store.writeArtifact({ bytes, mediaType: 'text/plain', sha256: actual })
      expect(artifact).toEqual({ sha256: actual, mediaType: 'text/plain', byteLength: bytes.byteLength })
      expect(Array.from(await store.readArtifact(actual))).toEqual(Array.from(bytes))

      await writeFile(join(root, '.cutout', 'objects', actual), 'tampered')
      await expect(store.readArtifact(actual)).rejects.toThrow('does not match its address')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses symlinked state files and a symlinked .cutout root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cutout-runtime-'))
    const outside = await mkdtemp(join(tmpdir(), 'cutout-outside-'))
    try {
      const store = createNodeFsRuntimeStore(root)
      await store.save(state())
      await symlink(join(outside, 'escaped.json'), join(root, '.cutout', 'escaped.json'))
      const unsafe = state()
      unsafe.manifest = { ...unsafe.manifest, files: { ...unsafe.manifest.files, designIr: 'escaped.json' } }
      await expect(store.save(unsafe)).rejects.toThrow('symbolic links')

      const linkedRoot = await mkdtemp(join(tmpdir(), 'cutout-linked-root-'))
      await rm(join(linkedRoot, '.cutout'), { force: true })
      await symlink(outside, join(linkedRoot, '.cutout'))
      await expect(createNodeFsRuntimeStore(linkedRoot).save(state())).rejects.toThrow('symbolic links')
      await rm(linkedRoot, { recursive: true, force: true })
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('refuses a symlink selected as the project root before creating .cutout', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cutout-runtime-'))
    const alias = `${root}-alias`
    try {
      await symlink(root, alias)
      await expect(createNodeFsRuntimeStore(alias).save(state())).rejects.toThrow('symbolic links')
      await expect(readFile(join(root, '.cutout', 'manifest.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(alias, { force: true })
      await rm(root, { recursive: true, force: true })
    }
  })

  it('coalesces concurrent content-addressed writes into one verified artifact', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cutout-runtime-'))
    try {
      const bytes = new TextEncoder().encode('same object from concurrent runs')
      const expected = sha256(bytes)
      const first = createNodeFsRuntimeStore(root)
      const second = createNodeFsRuntimeStore(root)
      const records = await Promise.all(Array.from({ length: 12 }, (_, index) =>
        (index % 2 ? first : second).writeArtifact({ bytes, mediaType: 'text/plain', sha256: expected }),
      ))
      expect(records).toEqual(Array.from({ length: 12 }, () => ({ sha256: expected, mediaType: 'text/plain', byteLength: bytes.byteLength })))
      expect(Array.from(await first.readArtifact(expected))).toEqual(Array.from(bytes))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('commits deletions with the same revision transaction instead of retaining stale ledger state', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cutout-runtime-'))
    try {
      const store = createNodeFsRuntimeStore(root)
      const withLedger = { ...state(), ledger: { revision: 1, completed: {} } }
      await store.save(withLedger)
      await store.save(state())
      expect((await store.load()).ledger).toBeUndefined()
      await expect(readFile(join(root, '.cutout', 'control-ledger.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('writes only a complete, hash-verified Design Kit under the controlled export root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cutout-runtime-'))
    try {
      const store = createNodeFsRuntimeStore(root)
      const source = state()
      source.design.tokens = [{ id: 'color-primary', name: 'color.primary', kind: 'color', value: '#0ea5e9' }]
      const kit = await compileHeadlessDesignKit(source.design)

      const first = await store.writeDesignKit(kit)
      const directory = join(root, first.directory)
      expect(first.idempotent).toBe(false)
      expect(first.directory).toMatch(/^\.cutout\/exports\/design-kit\/[a-z0-9-]+$/)
      expect((await readdir(directory)).sort()).toEqual(kit.files.map((file) => file.path).sort())
      for (const file of first.files) {
        expect(sha256(new Uint8Array(await readFile(join(directory, file.path))))).toBe(file.sha256)
      }

      const repeated = await store.writeDesignKit(kit)
      expect(repeated).toEqual({ ...first, idempotent: true })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses a symlinked Design Kit export root and never follows an existing revision path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cutout-runtime-'))
    const outside = await mkdtemp(join(tmpdir(), 'cutout-outside-'))
    try {
      const store = createNodeFsRuntimeStore(root)
      await store.save(state())
      const kit = await compileHeadlessDesignKit(state().design)
      await rm(join(root, '.cutout', 'exports'), { recursive: true, force: true })
      await symlink(outside, join(root, '.cutout', 'exports'))
      await expect(createNodeFsRuntimeStore(root).writeDesignKit(kit)).rejects.toThrow('symbolic links')
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('writes an evidenced Brand Kit atomically under its fixed root, verifies readback, and refuses symlink substitution', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cutout-runtime-'))
    const outside = await mkdtemp(join(tmpdir(), 'cutout-outside-'))
    try {
      const store = createNodeFsRuntimeStore(root)
      const kit = await compileBrandKit(brandInput())
      const first = await store.writeBrandKit(kit)
      expect(first.idempotent).toBe(false)
      expect(first.directory).toMatch(/^\.cutout\/exports\/brand-kit\/[a-z0-9-]+$/)
      expect(await readFile(join(root, first.directory, 'brand.manifest.json'), 'utf8')).toContain('cutout.brand-kit.v1')
      for (const file of first.files) {
        expect(sha256(new Uint8Array(await readFile(join(root, first.directory, file.path))))).toBe(file.sha256)
      }
      await expect(store.writeBrandKit(kit)).resolves.toEqual({ ...first, idempotent: true })

      await rm(join(root, first.directory, 'brand.css'))
      await symlink(join(outside, 'brand.css'), join(root, first.directory, 'brand.css'))
      await expect(store.writeBrandKit(kit)).rejects.toThrow('symbolic links')
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('writes a compiler-produced StarterPlan only under its deterministic export root and rejects tampered conflicts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cutout-runtime-'))
    try {
      const store = createNodeFsRuntimeStore(root)
      const source = state()
      source.design.tokens = [{ id: 'color-primary', name: 'color.primary', kind: 'color', value: '#0ea5e9' }]
      const plan = await starterPlan(source)

      const first = await store.writeStarter(plan)
      expect(first.idempotent).toBe(false)
      expect(first.directory).toMatch(/^\.cutout\/exports\/starter\/[a-z0-9-]+$/)
      expect(await readFile(join(root, first.directory, 'cutout.starter-export.json'), 'utf8')).toContain('cutout.starter-export.v1')
      for (const file of first.files) {
        expect(sha256(new Uint8Array(await readFile(join(root, first.directory, file.path))))).toBe(file.sha256)
      }
      await expect(store.writeStarter(plan)).resolves.toEqual({ ...first, idempotent: true })

      await writeFile(join(root, first.directory, 'package.json'), '{"tampered":true}\n')
      await expect(store.writeStarter(plan)).rejects.toThrow('different hash')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses a symbolic link substituted into an existing Starter export', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cutout-runtime-'))
    const outside = await mkdtemp(join(tmpdir(), 'cutout-outside-'))
    try {
      const store = createNodeFsRuntimeStore(root)
      const plan = await starterPlan(state())
      const receipt = await store.writeStarter(plan)
      const packageJson = join(root, receipt.directory, 'package.json')
      await rm(packageJson)
      await symlink(join(outside, 'package.json'), packageJson)

      await expect(store.writeStarter(plan)).rejects.toThrow('symbolic links')
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })
})

async function starterPlan(source: HeadlessProjectState) {
  const kit = await compileHeadlessDesignKit(source.design)
  const components = await compileComponentCandidates({ document: source.design, candidates: [] })
  const manifestFile = components.files.find((file) => file.path === 'components.manifest.json')
  if (!manifestFile) throw new Error('Missing component manifest.')
  return compileStarter({
    framework: 'next-app-router', document: source.design, kit,
    candidates: JSON.parse(manifestFile.content) as ComponentManifest,
    assetBindings: [], mergePolicy: 'fail',
  })
}

function brandInput(): BrandKitInput {
  const time = '2026-07-11T00:00:00.000Z'
  const document: BrandKitInput['document'] = {
    version: 'design-ir.v1',
    meta: { id: 'brand-project', title: 'Brand Project', createdAt: time, updatedAt: time },
    revision: { id: 'brand-r1', number: 1, createdAt: time, author: { kind: 'human', id: 'designer' } },
    needs: [],
    sources: [
      { id: 'logo-source', kind: 'document', role: 'brand-asset', title: 'Logo', license: { kind: 'proprietary', holder: 'Brand Co' }, content: [{ id: 'logo-content', uri: `sha256:${DIGEST}`, sha256: DIGEST, mediaType: 'image/svg+xml' }] },
      { id: 'guide-source', kind: 'document', role: 'evidence', title: 'Guide', license: { kind: 'proprietary', holder: 'Brand Co' }, content: [{ id: 'guide-content', uri: `sha256:${DIGEST}`, sha256: DIGEST, mediaType: 'text/markdown' }] },
    ],
    brands: [{ id: 'brand:co', name: 'Brand Co', status: 'active', provenanceId: 'logo-import' }],
    tokens: [], components: [], materials: [],
    provenance: [
      { id: 'logo-import', operation: 'import', sourceIds: ['logo-source'], actor: { kind: 'human', id: 'designer' }, recordedAt: time },
      { id: 'guide-import', operation: 'import', sourceIds: ['guide-source'], actor: { kind: 'human', id: 'designer' }, recordedAt: time },
    ],
    relations: [],
  }
  const logo = { sourceId: 'logo-source', contentId: 'logo-content', provenanceId: 'logo-import' }
  const guide = { sourceId: 'guide-source', contentId: 'guide-content', provenanceId: 'guide-import' }
  return {
    document,
    brand: {
      brandId: 'brand:co', logo: { variants: [{ id: 'logo-primary', label: 'Primary', kind: 'primary', evidence: logo }] },
      clearspace: { rule: 'One cap height.', evidence: guide }, minSize: [{ logoId: 'logo-primary', width: 24, unit: 'px', evidence: guide }],
      colors: [{ id: 'color-primary', name: 'Primary', cssName: 'primary', value: '#0EA5E9', evidence: guide }],
      type: [{ id: 'type-body', role: 'body', family: 'Brand Sans', evidence: logo }],
      icon: { guidance: 'Use round strokes.', evidence: guide }, photo: { guidance: 'Use approved photography.', evidence: guide }, voice: { guidance: 'Be concise.', evidence: guide },
      assetRecipes: [{ id: 'og-image', name: 'Open Graph', kind: 'social-image', instructions: 'Use the approved logo.', evidence: guide }],
    },
  }
}
