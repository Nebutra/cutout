import { describe, expect, it } from 'vitest'
import type { DesignDocument } from '@/design-ir'
import {
  compileComponentCandidates,
  componentCandidateInputSchema,
  validateComponentManifest,
  type ComponentCandidateInput,
} from './compiler'

const timestamp = '2026-07-11T09:00:00.000Z'

function document(): DesignDocument {
  return {
    version: 'design-ir.v1',
    meta: { id: 'project:components', title: 'Components', createdAt: timestamp, updatedAt: timestamp },
    revision: { id: 'revision:1', number: 1, createdAt: timestamp, author: { kind: 'human', id: 'user:1' } },
    needs: [],
    sources: [],
    brands: [],
    tokens: [
      { id: 'token:color:primary', name: 'Primary', kind: 'color', value: '#0284c7' },
      { id: 'token:radius:control', name: 'Control radius', kind: 'radius', value: '0.5rem' },
    ],
    components: [{
      id: 'component:button', name: 'Button', status: 'draft',
      tokenIds: ['token:color:primary', 'token:radius:control'],
    }],
    prototype: {
      id: 'prototype:1',
      plan: {
        version: 'prototype-plan.v0',
        product: { name: 'Components', summary: 'A component test.', audience: 'Designers', primaryGoal: 'Test', platform: 'web' },
        designSystem: {
          styleSummary: 'Simple', palette: ['#0284c7'], typography: 'Inter', spacing: '4px scale',
          componentPrinciples: ['Accessible'], assetDirection: 'Minimal',
        },
        pages: [{
          id: 'page:home', name: 'Home', route: '/', purpose: 'Landing',
          viewport: { platform: 'web', width: 1440, height: 900, scroll: 'single-screen' },
          regions: [{
            id: 'region:hero', name: 'Hero', role: 'hero', summary: 'Hero', complexity: 'low',
            decompositionStrategy: 'direct', assetRoute: 'board-cutout', assetOpportunities: [],
          }],
          interactions: [], overlays: [], states: [],
        }],
        flows: [{ id: 'flow:home', name: 'Home', goal: 'Land', startPageId: 'page:home', steps: [] }],
        humanLoop: { mode: 'continue', rationale: 'The test fixture is explicit.' },
      },
    },
    materials: [],
    provenance: [],
    relations: [
      {
        id: 'relation:button:primary', kind: 'component-uses-token',
        from: { kind: 'component', id: 'component:button' },
        to: { kind: 'token', id: 'token:color:primary' },
      },
      {
        id: 'relation:button:radius', kind: 'component-uses-token',
        from: { kind: 'component', id: 'component:button' },
        to: { kind: 'token', id: 'token:radius:control' },
      },
      {
        id: 'relation:prototype:button', kind: 'prototype-uses-component',
        from: { kind: 'prototype', id: 'prototype:1' },
        to: { kind: 'component', id: 'component:button' },
      },
    ],
  }
}

function input(overrides: Partial<ComponentCandidateInput> = {}): ComponentCandidateInput {
  return {
    document: document(),
    candidates: [{
      id: 'component:button',
      name: 'Button',
      kind: 'primitive',
      sourcePageIds: ['page:home'],
      tokenRefs: ['token:color:primary', 'token:radius:control'],
      props: [
        { name: 'disabled', type: 'boolean', required: false, defaultValue: false },
        { name: 'size', type: 'enum', required: false, values: ['sm', 'md', 'lg'], defaultValue: 'md' },
      ],
      variants: [{ name: 'intent', values: ['primary', 'secondary'] }],
      slots: [{ name: 'icon', required: false }, { name: 'children', required: true }],
      status: 'draft',
    }],
    ...overrides,
  }
}

describe('Component Candidate Manifest v1', () => {
  it('compiles only explicitly declared candidates into deterministic manifest and mapping-only shadcn plan', async () => {
    const compiled = await compileComponentCandidates(input())
    expect(compiled.version).toBe('components.compiler.v1')
    expect(compiled.files.map((file) => file.path)).toEqual([
      'components.manifest.json',
      'shadcn.adapter-plan.json',
    ])
    expect(compiled.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true)

    const manifest = JSON.parse(content(compiled, 'components.manifest.json'))
    expect(manifest.candidates).toEqual([expect.objectContaining({ id: 'component:button', name: 'Button' })])
    expect(manifest.candidates[0].props.map((prop: { name: string }) => prop.name)).toEqual(['disabled', 'size'])

    const adapter = JSON.parse(content(compiled, 'shadcn.adapter-plan.json'))
    expect(adapter.generation).toEqual({ generatesShadcnSource: false, forksShadcnSource: false, implementation: 'manual' })
    expect(adapter.tokenMappings).toEqual([
      expect.objectContaining({ tokenId: 'token:color:primary', cssVariable: '--cutout-token-color-primary' }),
      expect.objectContaining({ tokenId: 'token:radius:control', cssVariable: '--cutout-token-radius-control' }),
    ])
    expect(JSON.stringify(adapter)).not.toContain('import ')
  })

  it('is byte-stable regardless of declaration ordering where ordering is not semantic', async () => {
    const secondary = {
      id: 'component:stack', name: 'Stack', kind: 'layout' as const,
      sourcePageIds: ['page:home'], tokenRefs: [], props: [], variants: [], slots: [], status: 'draft' as const,
    }
    const first = await compileComponentCandidates(input({ candidates: [...input().candidates, secondary] }))
    const candidate = input().candidates[0]
    if (!candidate) throw new Error('Missing candidate fixture.')
    const second = await compileComponentCandidates(input({ candidates: [secondary, {
      ...candidate,
      sourcePageIds: [...candidate.sourcePageIds].reverse(),
      tokenRefs: [...candidate.tokenRefs].reverse(),
      props: [...candidate.props].reverse(),
      variants: [...candidate.variants].reverse(),
      slots: [...candidate.slots].reverse(),
    }] }))
    expect(second).toEqual(first)
  })

  it('refuses missing page and token references, and mismatched IR component/relation declarations', async () => {
    await expect(compileComponentCandidates(input({ candidates: [{ ...input().candidates[0], sourcePageIds: ['page:missing'] }] }))).rejects.toThrow('unknown prototype page')
    await expect(compileComponentCandidates(input({ candidates: [{ ...input().candidates[0], tokenRefs: ['token:missing'] }] }))).rejects.toThrow('unknown Design IR token')
    await expect(compileComponentCandidates(input({ candidates: [{ ...input().candidates[0], tokenRefs: ['token:color:primary'] }] }))).rejects.toThrow('does not match the matching Design IR component')

    const relationMismatch = document()
    relationMismatch.relations = relationMismatch.relations.filter((relation) => relation.id !== 'relation:button:primary')
    await expect(compileComponentCandidates(input({ document: relationMismatch }))).rejects.toThrow('do not exactly match candidate tokenRefs')
  })

  it('rejects duplicate and unsupported component APIs at the schema and compiler boundaries', async () => {
    expect(() => componentCandidateInputSchema.parse({
      document: document(),
      candidates: [{ ...input().candidates[0], unsupported: 'source-code' }],
    })).toThrow()

    await expect(compileComponentCandidates(input({ candidates: [{
      ...input().candidates[0],
      props: [{ name: 'size', type: 'string', required: false }, { name: 'size', type: 'string', required: false }],
    }] }))).rejects.toThrow('duplicate prop')
    await expect(compileComponentCandidates(input({ candidates: [{
      ...input().candidates[0],
      variants: [{ name: 'size', values: ['sm', 'md'] }],
    }] }))).rejects.toThrow('conflicts with prop')
    await expect(compileComponentCandidates(input({ candidates: [{
      ...input().candidates[0],
      slots: [{ name: 'children', required: true }, { name: 'children', required: false }],
    }] }))).rejects.toThrow('duplicate slot')
    await expect(compileComponentCandidates(input({ candidates: [
      input().candidates[0]!,
      { ...input().candidates[0]!, name: 'Duplicate button' },
    ] }))).rejects.toThrow('duplicate id')
  })

  it('revalidates persisted manifests against page, token, and relation references', async () => {
    const compiled = await compileComponentCandidates(input())
    const file = compiled.files.find((entry) => entry.path === 'components.manifest.json')
    if (!file) throw new Error('Missing manifest fixture.')
    const manifest = JSON.parse(file.content) as { candidates: ComponentCandidateInput['candidates']; source: Record<string, string> }
    manifest.candidates[0] = { ...manifest.candidates[0]!, sourcePageIds: ['page:missing'] }
    manifest.source.declarationFingerprint = await fingerprintForTest(manifest.candidates)
    await expect(validateComponentManifest(document(), manifest)).rejects.toThrow('unknown prototype page')
  })
})

function content(compiled: Awaited<ReturnType<typeof compileComponentCandidates>>, path: string): string {
  const file = compiled.files.find((entry) => entry.path === path)
  if (!file) throw new Error(`Missing compiled file ${path}.`)
  return file.content
}

async function fingerprintForTest(value: unknown): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(value)))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}
