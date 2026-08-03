import { describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { compileComponentCandidates, type ComponentManifest } from '@/components-compiler'
import { compileDesignKit, type DesignKit, type DesignKitInput } from '@/design-kit'
import { fingerprint, type DesignDocument } from '@/design-ir'
import {
  compileStarter,
  type StarterCompilerInput,
} from './compiler'

const timestamp = '2026-07-11T00:00:00.000Z'

function document(): DesignDocument {
  return {
    version: 'design-ir.v1',
    meta: { id: 'project:starter', title: 'Starter Studio', createdAt: timestamp, updatedAt: timestamp },
    revision: { id: 'revision:1', number: 1, createdAt: timestamp, author: { kind: 'human', id: 'human:1' } },
    needs: [],
    sources: [{
      id: 'source:brand', kind: 'document', role: 'brand-asset', title: 'Brand guide',
      license: { kind: 'proprietary', holder: 'Cutout' },
      content: [{ id: 'content:brand', uri: 'cutout://brand' }],
    }],
    brands: [],
    tokens: [{ id: 'token:brand', name: 'Brand', kind: 'color', value: '#0ea5e9' }],
    components: [{ id: 'component:hero', name: 'Hero', status: 'ready', description: 'A focused launch surface.', tokenIds: ['token:brand'] }],
    prototype: {
      id: 'prototype:1',
      plan: {
        version: 'prototype-plan.v0',
        product: { name: 'Starter Studio', summary: 'A starter', audience: 'Makers', primaryGoal: 'Ship', platform: 'web' },
        designSystem: { styleSummary: 'Clean', palette: ['#0ea5e9'], typography: 'Sans', spacing: 'Loose', componentPrinciples: ['Clear'], assetDirection: 'Minimal' },
        pages: [{
          id: 'page:home', name: 'Home', route: '/', purpose: 'Landing',
          viewport: { platform: 'web', width: 1440, height: 900, scroll: 'single-screen' },
          regions: [{ id: 'region:hero', name: 'Hero', role: 'hero', summary: 'Welcome', complexity: 'low', assetRoute: 'ignore-code-ui', decompositionStrategy: 'direct', assetOpportunities: [] }],
          overlays: [], states: [], interactions: [],
        }],
        flows: [{ id: 'flow:main', name: 'Main', goal: 'Ship', startPageId: 'page:home', steps: [] }],
        humanLoop: { mode: 'continue', rationale: 'Clear' },
      },
    },
    materials: [{
      id: 'material:logo', kind: 'image', name: 'Logo', currentRevisionId: 'revision:logo:1',
      revisions: [{ id: 'revision:logo:1', ordinal: 1, createdAt: timestamp, content: { id: 'content:logo', uri: 'sha256:aaaaaaaa', mediaType: 'image/png', sha256: 'a'.repeat(64) } }],
    }],
    provenance: [],
    relations: [
      { id: 'relation:hero:brand', kind: 'component-uses-token', from: { kind: 'component', id: 'component:hero' }, to: { kind: 'token', id: 'token:brand' } },
      { id: 'relation:prototype:hero', kind: 'prototype-uses-component', from: { kind: 'prototype', id: 'prototype:1' }, to: { kind: 'component', id: 'component:hero' } },
    ],
  }
}

async function kit(): Promise<DesignKit> {
  const input: DesignKitInput = {
    document: document(),
    tokens: [{ tokenId: 'token:brand', status: 'verified', category: 'color', cssName: 'brand' }],
  }
  return compileDesignKit(input)
}

async function candidates(): Promise<ComponentManifest> {
  const compiled = await compileComponentCandidates({
    document: document(),
    candidates: [{
      id: 'component:hero', name: 'Hero', kind: 'composite', sourcePageIds: ['page:home'], tokenRefs: ['token:brand'],
      props: [{ name: 'eyebrow', type: 'string', required: false, defaultValue: 'For makers' }],
      variants: [{ name: 'tone', values: ['brand', 'neutral'] }],
      slots: [{ name: 'actions', required: false }], status: 'ready',
    }],
  })
  const manifestFile = compiled.files.find((file) => file.path === 'components.manifest.json')
  if (!manifestFile) throw new Error('Missing component manifest.')
  return JSON.parse(manifestFile.content) as ComponentManifest
}

async function input(overrides: Partial<StarterCompilerInput> = {}): Promise<StarterCompilerInput> {
  return {
    framework: 'next-app-router', document: document(), kit: await kit(), candidates: await candidates(),
    assetBindings: [{ candidateId: 'component:hero', materialId: 'material:logo', revisionId: 'revision:logo:1', outputPath: 'assets/logo.png' }],
    mergePolicy: 'fail',
    ...overrides,
  }
}

describe('Starter Compiler v1', () => {
  it('creates a deterministic, in-memory Next App Router plan with Design Kit, component and agent contracts', async () => {
    const first = await compileStarter(await input())
    const second = await compileStarter(await input())

    expect(second).toEqual(first)
    expect(first.framework).toBe('next-app-router')
    expect(first.files.map((file) => file.path)).toEqual([
      'AGENTS.md', 'README.md', 'app/globals.css', 'app/layout.tsx', 'app/page.tsx',
      'components.manifest.json', 'design-kit/DESIGN.md', 'design-kit/demo.html', 'design-kit/design-system.html',
      'design-kit/manifest.json', 'design-kit/tailwind.css',
      'design-kit/theme.ts', 'design-kit/tokens.css', 'design-kit/tokens.json', 'package.json',
      'src/components/Hero.tsx', 'src/components/generated.css', 'src/env.d.ts', 'src/theme.ts', 'tsconfig.json',
    ])
    expect(file(first, 'app/globals.css')).toContain('@import "../design-kit/tailwind.css";')
    expect(file(first, 'app/page.tsx')).toContain('Hero')
    expect(file(first, 'src/components/Hero.tsx')).toContain('export interface HeroProps')
    expect(file(first, 'src/components/Hero.tsx')).toContain('data-cutout-region="region:hero"')
    expect(file(first, 'src/components/Hero.tsx')).toContain('src="/assets/logo.png"')
    expect(file(first, 'src/components/Hero.tsx')).not.toContain('placeholder')
    expect(file(first, 'components.manifest.json')).toContain('component:hero')
    await expect(Promise.all(first.files.map(async (entry) => sha256(entry.content)))).resolves.toEqual(first.files.map((entry) => entry.sha256))
    expect(first.assets).toEqual([{
      outputPath: 'public/assets/logo.png', candidateId: 'component:hero', materialId: 'material:logo', revisionId: 'revision:logo:1',
      contentId: 'content:logo', sourceUri: 'sha256:aaaaaaaa', sha256: 'a'.repeat(64), mediaType: 'image/png',
    }])
  })

  it('supports Vite React with a framework-specific minimal shell', async () => {
    const plan = await compileStarter(await input({ framework: 'vite-react' }))

    expect(plan.files.map((entry) => entry.path)).toContain('src/main.tsx')
    expect(plan.files.map((entry) => entry.path)).toContain('src/App.tsx')
    expect(file(plan, 'src/styles.css')).toContain('@import "../design-kit/tailwind.css";')
    expect(file(plan, 'package.json')).toContain('"vite"')
    expect(file(plan, 'vite.config.ts')).toContain("@vitejs/plugin-react")
    expect(file(plan, 'src/App.tsx')).toContain("window.location.pathname")
  })

  it('builds a runnable Nuxt project with native Vue components, routes, assets, tokens, and registry metadata', async () => {
    const plan = await compileStarter(await input({ framework: 'nuxt' }))
    expect(plan.files.map((entry) => entry.path)).toEqual(expect.arrayContaining(['nuxt.config.ts', 'app.vue', 'pages/index.vue', 'components/generated/Hero.vue', 'assets/css/generated.css', 'cutout.registry.json']))
    expect(file(plan, 'package.json')).toContain('"nuxt"')
    expect(file(plan, 'components/generated/Hero.vue')).toContain('<script setup lang="ts">')
    expect(file(plan, 'components/generated/Hero.vue')).toContain('/assets/logo.png')
    expect(file(plan, 'pages/index.vue')).toContain('<GeneratedHero />')
    expect(JSON.parse(file(plan, 'cutout.registry.json'))).toMatchObject({ framework: 'nuxt', routes: ['/'], components: [{ id: 'component:hero', exportName: 'Hero' }] })
    validateRunnableStructure(plan)
  })

  it('builds a runnable TanStack project with a typed route tree and registry metadata', async () => {
    const plan = await compileStarter(await input({ framework: 'tanstack-start' }))
    expect(plan.files.map((entry) => entry.path)).toEqual(expect.arrayContaining(['src/main.tsx', 'src/router.tsx', 'vite.config.ts', 'index.html', 'cutout.registry.json']))
    expect(file(plan, 'package.json')).toContain('@tanstack/react-router')
    expect(file(plan, 'src/router.tsx')).toContain("createRouter({ routeTree })")
    expect(file(plan, 'src/router.tsx')).toContain('path: "/"')
    expect(file(plan, 'src/router.tsx')).toContain('<Hero />')
    expect(JSON.parse(file(plan, 'cutout.registry.json'))).toMatchObject({ framework: 'tanstack-start', routes: ['/'] })
    validateRunnableStructure(plan)
  })

  it.each(['next-app-router', 'vite-react'] as const)('writes a %s bundle that passes an offline TypeScript compile against installed React types', async (framework) => {
    const plan = await compileStarter(await input({ framework }))
    const directory = await mkdtemp(join(tmpdir(), `cutout-${framework}-`))
    try {
      for (const entry of plan.files) {
        const destination = join(directory, entry.path)
        await mkdir(dirname(destination), { recursive: true })
        await writeFile(destination, entry.content, 'utf8')
      }
      await symlink(resolve('node_modules'), join(directory, 'node_modules'), 'dir')
      await promisify(execFile)(process.execPath, [resolve('node_modules/typescript/lib/tsc.js'), '--project', join(directory, 'tsconfig.json'), '--noEmit'], { cwd: directory })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }, 20_000)

  it('rejects unready components, token drift, invalid kit provenance and missing asset revisions before creating a plan', async () => {
    const draft = await candidates()
    draft.candidates[0] = { ...draft.candidates[0]!, status: 'draft' }
    draft.source = { ...draft.source, declarationFingerprint: await fingerprint(draft.candidates) }
    await expect(compileStarter(await input({ candidates: draft }))).rejects.toThrow('does not match the matching Design IR component')
    const unknownToken = await candidates()
    unknownToken.candidates[0] = { ...unknownToken.candidates[0]!, tokenRefs: ['token:missing'] }
    unknownToken.source = { ...unknownToken.source, declarationFingerprint: await fingerprint(unknownToken.candidates) }
    await expect(compileStarter(await input({ candidates: unknownToken }))).rejects.toThrow('unknown Design IR token')
    const invalidKit = await kit()
    const mismatched = { ...invalidKit, source: { ...invalidKit.source, documentId: 'project:other' } }
    await expect(compileStarter(await input({ kit: mismatched }))).rejects.toThrow('does not belong')
    const tamperedKit = await kit()
    tamperedKit.files[0] = { ...tamperedKit.files[0]!, content: 'tampered' }
    await expect(compileStarter(await input({ kit: tamperedKit }))).rejects.toThrow('invalid content digest')
    const tamperedManifest = await candidates()
    tamperedManifest.source = { ...tamperedManifest.source, declarationFingerprint: 'b'.repeat(64) }
    await expect(compileStarter(await input({ candidates: tamperedManifest }))).rejects.toThrow('declaration fingerprint')
    await expect(compileStarter(await input({ assetBindings: [{ candidateId: 'component:hero', materialId: 'material:logo', revisionId: 'missing', outputPath: 'assets/logo.png' }] }))).rejects.toThrow('unknown material revision')
  })

  it('rejects unsafe paths, duplicate output paths, duplicate component exports, unknown framework and implicit merging', async () => {
    await expect(compileStarter(await input({ assetBindings: [{ candidateId: 'component:hero', materialId: 'material:logo', revisionId: 'revision:logo:1', outputPath: '../logo.png' }] }))).rejects.toThrow('safe relative')
    await expect(compileStarter(await input({ assetBindings: [
      { candidateId: 'component:hero', materialId: 'material:logo', revisionId: 'revision:logo:1', outputPath: 'assets/logo.png' },
      { candidateId: 'component:hero', materialId: 'material:logo', revisionId: 'revision:logo:1', outputPath: 'assets/logo.png' },
    ] }))).rejects.toThrow('declared more than once')

    const duplicateName = await candidates()
    duplicateName.candidates = [...duplicateName.candidates, { ...duplicateName.candidates[0]!, id: 'component:hero-two' }]
    duplicateName.source = { ...duplicateName.source, declarationFingerprint: await fingerprint(duplicateName.candidates) }
    await expect(compileStarter(await input({ candidates: duplicateName }))).rejects.toThrow('duplicate export')
    await expect(compileStarter(await input({ existingPaths: ['package.json'] }))).rejects.toThrow('collides')
    await expect(compileStarter({ ...(await input()), framework: 'unknown' as never })).rejects.toThrow()
  })

  it('rejects token values that can escape generated CSS', async () => {
    const unsafe = document()
    unsafe.tokens[0] = { ...unsafe.tokens[0]!, value: 'red; } body { display: none' }
    await expect(compileStarter({ ...(await input()), document: unsafe })).rejects.toThrow('unsafe CSS value')
  })

  it('keeps page membership without inventing a component-to-region mapping from co-location', async () => {
    const ambiguous = document()
    ambiguous.prototype!.plan.pages[0]!.regions[0] = {
      ...ambiguous.prototype!.plan.pages[0]!.regions[0]!, name: 'Primary content', role: 'content',
    }
    const ambiguousKit = await compileDesignKit({
      document: ambiguous,
      tokens: [{ tokenId: 'token:brand', status: 'verified', category: 'color', cssName: 'brand' }],
    })
    const compiled = await compileComponentCandidates({
      document: ambiguous,
      candidates: [{
        id: 'component:hero', name: 'Hero', kind: 'composite', sourcePageIds: ['page:home'], tokenRefs: ['token:brand'],
        props: [], variants: [], slots: [], status: 'ready',
      }],
    })
    const manifest = JSON.parse(compiled.files.find((entry) => entry.path === 'components.manifest.json')!.content) as ComponentManifest
    const plan = await compileStarter({ framework: 'vite-react', document: ambiguous, kit: ambiguousKit, candidates: manifest, mergePolicy: 'fail' })
    expect(file(plan, 'src/App.tsx')).toContain('<Hero />')
    expect(file(plan, 'src/components/Hero.tsx')).not.toContain('data-cutout-region=')
  })
})

function file(plan: Awaited<ReturnType<typeof compileStarter>>, path: string): string {
  const entry = plan.files.find((candidate) => candidate.path === path)
  if (!entry) throw new Error(`Missing ${path}`)
  return entry.content
}

async function sha256(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function validateRunnableStructure(plan: Awaited<ReturnType<typeof compileStarter>>) {
  const paths = new Set(plan.files.map(({ path }) => path))
  expect(paths.has('package.json')).toBe(true)
  expect(paths.has('README.md')).toBe(true)
  expect(paths.has('AGENTS.md')).toBe(true)
  expect(paths.has('design-kit/tokens.css')).toBe(true)
  expect(paths.has('components.manifest.json')).toBe(true)
  const pkg = JSON.parse(file(plan, 'package.json'))
  expect(pkg.private).toBe(true)
  expect(pkg.scripts.dev).toBeTruthy()
  expect(pkg.scripts.build).toBeTruthy()
  expect(plan.assets).toContainEqual(expect.objectContaining({ outputPath: 'public/assets/logo.png' }))
}
