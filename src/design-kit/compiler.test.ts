import { describe, expect, it } from 'vitest'
import type { DesignDocument } from '@/design-ir'
import {
  compileDesignKit,
  designKitInputSchema,
  type DesignKitInput,
} from './compiler'

const timestamp = '2026-07-10T10:00:00.000Z'

function document(): DesignDocument {
  return {
    version: 'design-ir.v1',
    meta: { id: 'project:kit', title: 'Kit', createdAt: timestamp, updatedAt: timestamp },
    revision: { id: 'revision:1', number: 1, createdAt: timestamp, author: { kind: 'human', id: 'user:1' } },
    needs: [],
    sources: [{
      id: 'source:brand', kind: 'document', role: 'brand-asset', title: 'Brand guide',
      license: { kind: 'proprietary', holder: 'Cutout' },
      content: [{ id: 'content:brand', uri: 'cutout://brand' }],
    }],
    brands: [],
    tokens: [
      { id: 'token:color:brand', name: 'Brand', kind: 'color', value: '#0ea5e9', provenanceId: 'provenance:brand' },
      { id: 'token:color:primary', name: 'Primary', kind: 'color', value: '#0284c7', provenanceId: 'provenance:brand' },
      { id: 'token:spacing:md', name: 'Medium', kind: 'spacing', value: '1rem' },
      { id: 'token:radius:card', name: 'Card radius', kind: 'radius', value: '0.75rem' },
      { id: 'token:font:sans', name: 'Sans', kind: 'typography', value: 'Inter, sans-serif' },
      { id: 'token:shadow:card', name: 'Card shadow', kind: 'shadow', value: '0 1px 2px rgb(0 0 0 / 0.08)' },
      { id: 'token:breakpoint:sm', name: 'Small', kind: 'other', value: '40rem' },
    ],
    components: [],
    materials: [],
    provenance: [{
      id: 'provenance:brand', operation: 'import', sourceIds: ['source:brand'],
      actor: { kind: 'human', id: 'user:1' }, recordedAt: timestamp,
    }],
    relations: [],
  }
}

function input(overrides: Partial<DesignKitInput> = {}): DesignKitInput {
  return {
    document: document(),
    tokens: [
      { tokenId: 'token:color:brand', status: 'verified', category: 'color', cssName: 'brand' },
      { tokenId: 'token:color:primary', status: 'draft', category: 'color', cssName: 'primary', aliasOf: 'token:color:brand' },
      { tokenId: 'token:spacing:md', status: 'verified', category: 'spacing', cssName: 'md' },
      { tokenId: 'token:radius:card', status: 'verified', category: 'radius', cssName: 'card' },
      { tokenId: 'token:font:sans', status: 'verified', category: 'typography', cssName: 'sans' },
      { tokenId: 'token:shadow:card', status: 'draft', category: 'shadow', cssName: 'card' },
      { tokenId: 'token:breakpoint:sm', status: 'verified', category: 'breakpoint', cssName: 'sm' },
    ],
    ...overrides,
  }
}

describe('Design Kit v1 compiler', () => {
  it('compiles explicit verified and draft IR tokens into stable portable kit files', async () => {
    const compiled = await compileDesignKit(input())

    expect(compiled.version).toBe('design-kit.v1')
    expect(compiled.files.map((file) => file.path)).toEqual([
      'DESIGN.md',
      'demo.html',
      'design-system.html',
      'manifest.json',
      'tailwind.css',
      'theme.ts',
      'tokens.css',
      'tokens.json',
    ])
    expect(compiled.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true)
    expect(compiled.files.every((file) => file.sourceFingerprint === compiled.source.documentFingerprint)).toBe(true)
    expect(compiled.files.every((file) => file.provenance.tokenIds.length > 0)).toBe(true)
    await expect(Promise.all(compiled.files.map(async (file) => sha256(file.content)))).resolves.toEqual(
      compiled.files.map((file) => file.sha256),
    )

    const css = content(compiled, 'tokens.css')
    expect(css).toContain('--cutout-color-brand: #0ea5e9;')
    expect(css).toContain('--cutout-color-primary: var(--cutout-color-brand);')
    expect(content(compiled, 'tailwind.css')).toContain('--color-primary: var(--cutout-color-primary);')
    expect(content(compiled, 'tailwind.css')).toContain('--breakpoint-sm: var(--cutout-breakpoint-sm);')
    expect(JSON.parse(content(compiled, 'tokens.json')).color.primary.$status).toBe('draft')
    expect(content(compiled, 'DESIGN.md')).toContain('| `color.primary` | draft | alias of `color.brand` |')
  })

  it('is byte stable for identical semantic input regardless of adapter ordering', async () => {
    const first = await compileDesignKit(input())
    const second = await compileDesignKit(input({ tokens: [...input().tokens].reverse() }))

    expect(second).toEqual(first)
  })

  it('refuses inferred or incompatible token bindings at the adapter boundary', async () => {
    expect(() => designKitInputSchema.parse({ document: document(), tokens: [] })).not.toThrow()
    expect(() => designKitInputSchema.parse({
      document: document(),
      tokens: [{ tokenId: 'token:color:brand', status: 'verified', category: 'color', cssName: 'brand', value: '#fff' }],
    })).toThrow()
    await expect(compileDesignKit(input({ tokens: [{
      tokenId: 'token:spacing:md', status: 'verified', category: 'color', cssName: 'not-spacing',
    }] }))).rejects.toThrow('incompatible')
    await expect(compileDesignKit(input({ tokens: [{
      tokenId: 'token:missing', status: 'verified', category: 'color', cssName: 'missing',
    }] }))).rejects.toThrow('does not exist')
  })

  it('rejects unknown aliases and semantic alias cycles before emitting any artifact', async () => {
    await expect(compileDesignKit(input({ tokens: [
      { tokenId: 'token:color:brand', status: 'verified', category: 'color', cssName: 'brand', aliasOf: 'token:color:primary' },
      { tokenId: 'token:color:primary', status: 'draft', category: 'color', cssName: 'primary', aliasOf: 'token:color:brand' },
    ] }))).rejects.toThrow('cycle')

    await expect(compileDesignKit(input({ tokens: [{
      tokenId: 'token:color:brand', status: 'verified', category: 'color', cssName: 'brand', aliasOf: 'token:missing',
    }] }))).rejects.toThrow('unknown token')
  })

  it('compiles a specimen sheet that embeds the demo and a demo page styled by the compiled CSS variables', async () => {
    const compiled = await compileDesignKit(input())

    const specimen = content(compiled, 'design-system.html')
    expect(specimen).toContain('<iframe class="demo-frame" src="demo.html"')
    expect(specimen).toContain('color.brand')
    expect(specimen).toContain('#0ea5e9')
    expect(specimen).toContain(content(compiled, 'DESIGN.md').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'))

    const demo = content(compiled, 'demo.html')
    expect(demo).toContain('--cutout-color-brand: #0ea5e9;')
    expect(demo).toContain('var(--cutout-color-brand)')
    expect(demo).not.toContain('<script>alert')
  })

  it('escapes token values so they cannot break out of HTML attributes or text nodes', async () => {
    // isSafeCssValue already forbids `;{}\r\n` and comment markers, so a
    // hostile value can only carry quote/angle-bracket characters — prove
    // those still can't break out of the generated markup.
    const unsafeInput = input({
      document: { ...document(), tokens: [
        { id: 'token:color:brand', name: 'Brand', kind: 'color', value: '"><script>alert(1)</script>', provenanceId: 'provenance:brand' },
      ] },
      tokens: [{ tokenId: 'token:color:brand', status: 'verified', category: 'color', cssName: 'brand' }],
    })
    const compiled = await compileDesignKit(unsafeInput)
    const specimen = content(compiled, 'design-system.html')
    expect(specimen).not.toContain('<script>alert(1)</script>')
    expect(specimen).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(specimen).toMatch(/style="background:&quot;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;"/)
  })
})

function content(compiled: Awaited<ReturnType<typeof compileDesignKit>>, path: string): string {
  const file = compiled.files.find((entry) => entry.path === path)
  if (!file) throw new Error(`Missing compiled file ${path}`)
  return file.content
}

async function sha256(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
