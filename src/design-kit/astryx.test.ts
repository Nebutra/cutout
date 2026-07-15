import { describe, expect, it } from 'vitest'
import type { DesignDocument } from '@/design-ir'
import { astryxAgentPrompt, compileAstryxBinding, detectAstryxCapability } from './astryx'

const document: DesignDocument = {
  version: 'design-ir.v1',
  meta: { id: 'project:astryx', title: 'Astryx Consumer', createdAt: '2026-07-12T00:00:00.000Z', updatedAt: '2026-07-12T00:00:00.000Z' },
  revision: { id: 'revision:astryx:1', number: 1, createdAt: '2026-07-12T00:00:00.000Z', author: { kind: 'human', id: 'user' } },
  needs: [], sources: [], brands: [],
  tokens: [
    { id: 'color:accent:light', name: 'Accent light', kind: 'color', value: '#7b61ff' },
    { id: 'color:accent:dark', name: 'Accent dark', kind: 'color', value: '#9b87ff' },
    { id: 'radius:control', name: 'Control radius', kind: 'radius', value: '8px' },
  ],
  components: [{ id: 'component:button', name: 'Button', status: 'ready', tokenIds: ['color:accent:light', 'radius:control'] }],
  materials: [], provenance: [], relations: [],
}

const input = {
  document, themeName: 'cutout-consumer' as const, extends: 'neutral' as const,
  tokens: [
    { astryxVariable: '--color-accent', lightTokenId: 'color:accent:light', darkTokenId: 'color:accent:dark' },
    { astryxVariable: '--radius-control', lightTokenId: 'radius:control' },
  ],
  components: [{ designComponentId: 'component:button', astryxComponent: 'Button' }],
}

describe('Astryx Design System consumer binding', () => {
  it('projects explicit Design IR mappings into an official defineTheme input with token parity', async () => {
    const binding = await compileAstryxBinding(input, {
      dependencies: { '@astryxdesign/core': '^1', '@astryxdesign/theme-neutral': '^1' },
      devDependencies: { '@astryxdesign/cli': '^1' },
    })
    expect(binding.artifactId).toBe('ds.binding.astryx')
    expect(binding.capability.status).toBe('available')
    const theme = file(binding, 'astryx/cutout-consumer.ts')
    expect(theme).toContain("from '@astryxdesign/core/theme'")
    expect(theme).toContain("from '@astryxdesign/theme-neutral'")
    expect(theme).toContain('export const cutoutConsumerTheme = defineTheme({')
    expect(theme).toContain('"--color-accent": ["#7b61ff", "#9b87ff"]')
    expect(theme).toContain('"--radius-control": ["8px", "8px"]')
    const mapping = JSON.parse(file(binding, 'astryx/component-mapping.json'))
    expect(mapping.tokens).toEqual([
      { astryxVariable: '--color-accent', sourceTokenIds: ['color:accent:light', 'color:accent:dark'] },
      { astryxVariable: '--radius-control', sourceTokenIds: ['radius:control', 'radius:control'] },
    ])
    expect(mapping.components).toEqual([{ designComponentId: 'component:button', astryxComponent: 'Button' }])
    const plan = JSON.parse(file(binding, 'astryx/cli-plan.json'))
    expect(plan).toMatchObject({ mode: 'dry-run', command: ['npx', 'astryx', 'theme', 'build', './astryx/cutout-consumer.ts'], writesAllowedByThisCompiler: false })

    const globalsCss = file(binding, 'astryx/globals.css')
    expect(globalsCss).toContain('@layer reset, astryx-base, cutout-consumer-theme, app;')
    expect(globalsCss).toContain("@import '@astryxdesign/theme-neutral/theme.css' layer(cutout-consumer-theme);")

    const usage = file(binding, 'astryx/usage.tsx')
    expect(usage).toContain("import {cutoutConsumerTheme} from './cutout-consumer';")
    expect(usage).toContain('export function CutoutConsumerDesignProvider({children}: {children: ReactNode}) {')

    const packageSnippet = JSON.parse(file(binding, 'astryx/package-snippet.json'))
    expect(packageSnippet.scripts['theme:build']).toBe('npx astryx theme build ./astryx/cutout-consumer.ts')

    // README.md / AGENTS.md are not compiled here — this compiler emits only
    // structured artifacts. `agentBrief` carries the facts an Agent (or a
    // human) needs to author that prose separately.
    expect(binding.files.some((f) => f.path === 'astryx/README.md')).toBe(false)
    expect(binding.files.some((f) => f.path === 'astryx/AGENTS.md')).toBe(false)
    expect(binding.agentBrief).toEqual({
      themeName: 'cutout-consumer',
      themeConstName: 'cutoutConsumerTheme',
      providerName: 'CutoutConsumerDesignProvider',
      themePath: 'astryx/cutout-consumer.ts',
      usagePath: 'astryx/usage.tsx',
      globalsCssPath: 'astryx/globals.css',
      packageSnippetPath: 'astryx/package-snippet.json',
      installCommand: 'npm install @astryxdesign/core @astryxdesign/theme-neutral @astryxdesign/cli',
      buildCommand: 'npx astryx theme build ./astryx/cutout-consumer.ts',
      mappedVariableCount: 2,
      unmappedCustomPropertyCount: 0,
      officialDocs: [
        'https://astryx.atmeta.com/docs/getting-started',
        'https://astryx.atmeta.com/docs/theme',
        'https://astryx.atmeta.com/docs/cli',
      ],
    })
  })

  it('ships unbound colors as theme-namespaced custom properties instead of dropping them', async () => {
    const withExtra: DesignDocument = {
      ...document,
      tokens: [...document.tokens, { id: 'color:brand:accessory', name: 'Ion Cyan', kind: 'color', value: '#8edbd2' }],
    }
    const binding = await compileAstryxBinding({ ...input, document: withExtra })
    const globalsCss = file(binding, 'astryx/globals.css')
    expect(globalsCss).toContain('--cutout-consumer-ion-cyan: #8edbd2;')
  })

  it('degrades to adapter-required without installing packages and refuses inferred mappings', async () => {
    expect(detectAstryxCapability({ dependencies: { '@astryxdesign/core': '^1' } })).toEqual(expect.objectContaining({ status: 'adapter-required', missing: ['@astryxdesign/cli', '@astryxdesign/theme-neutral'] }))
    const binding = await compileAstryxBinding(input, {})
    expect(binding.capability.status).toBe('adapter-required')
    await expect(compileAstryxBinding({ ...input, tokens: [{ astryxVariable: '--color-accent', lightTokenId: 'missing' }] })).rejects.toThrow('Unknown Design IR token')
    await expect(compileAstryxBinding({ ...input, components: [{ designComponentId: 'missing', astryxComponent: 'Button' }] })).rejects.toThrow('Unknown Design IR component')
  })

  it('formats agentBrief into a groundable prompt without prescribing the actual prose', async () => {
    const binding = await compileAstryxBinding(input)
    const prompt = astryxAgentPrompt(binding.agentBrief)
    expect(prompt).toContain('Write README.md and AGENTS.md for the Astryx theme "cutout-consumer".')
    expect(prompt).toContain('astryx/cutout-consumer.ts')
    expect(prompt).toContain('CutoutConsumerDesignProvider')
    expect(prompt).toContain('Verify current CLI commands and API shape against the official docs before writing')
  })
})

function file(binding: Awaited<ReturnType<typeof compileAstryxBinding>>, path: string) {
  const result = binding.files.find((candidate) => candidate.path === path)
  if (!result) throw new Error(`Missing ${path}`)
  return result.content
}
