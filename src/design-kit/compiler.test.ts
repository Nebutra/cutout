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

function selectedCandidateSet(materialId: string) {
  return {
    id: 'candidate-set:design-system:1',
    kind: 'design-system' as const,
    baseRevisionId: 'revision:1',
    proposal: {
      mode: 'fixed' as const,
      decidedBy: 'user' as const,
      count: 1,
      rationale: 'Use the approved single direction.',
      directions: [{
        id: 'direction:1',
        label: 'Selected',
        thesis: 'Use the selected image-grounded direction.',
        vary: ['visual tone'],
        preserve: ['product brief'],
      }],
      bounds: { maxCandidates: 4, maxParallelism: 2 },
    },
    candidates: [{
      id: 'candidate:1',
      directionId: 'direction:1',
      status: 'ready' as const,
      outputs: [{ role: 'design-markdown', materialId }],
      provenanceIds: ['provenance:brand'],
    }],
    selection: {
      candidateId: 'candidate:1',
      selectedAt: timestamp,
      actor: { kind: 'human' as const, id: 'user:1' },
      baseRevisionId: 'revision:1',
      provenanceId: 'provenance:selection',
    },
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

  it('emits a hash-verified selected DESIGN.md verbatim and binds it in the manifest', async () => {
    const designMarkdown = [
      '---',
      'tokens:',
      '  color:',
      '    primary: "#0ea5e9"',
      '---',
      '# Selected visual direction',
      '',
      'This image-grounded document remains authoritative.',
      '',
    ].join('\n')
    const contentSha256 = await sha256(designMarkdown)
    const selectedDocument: DesignDocument = {
      ...document(),
      candidateSets: [selectedCandidateSet('material:design-markdown')],
      provenance: [
        ...document().provenance,
        {
          id: 'provenance:selection',
          operation: 'manual',
          sourceIds: ['source:brand'],
          actor: { kind: 'human', id: 'user:1' },
          recordedAt: timestamp,
        },
      ],
      materials: [{
        id: 'material:design-markdown',
        kind: 'design-markdown',
        name: 'DESIGN.md',
        revisions: [{
          id: 'material:design-markdown:revision:1',
          ordinal: 1,
          createdAt: timestamp,
          content: {
            id: 'content:design-markdown',
            uri: `artifact:sha256:${contentSha256}`,
            mediaType: 'text/markdown',
            sha256: contentSha256,
          },
          provenanceId: 'provenance:brand',
        }],
        currentRevisionId: 'material:design-markdown:revision:1',
      }],
    }
    const compiled = await compileDesignKit({
      ...input({ document: selectedDocument }),
      selectedDesignMarkdown: {
        candidateSetId: 'candidate-set:design-system:1',
        candidateId: 'candidate:1',
        materialId: 'material:design-markdown',
        revisionId: 'material:design-markdown:revision:1',
        provenanceId: 'provenance:selection',
        content: designMarkdown,
      },
    })

    expect(content(compiled, 'DESIGN.md')).toBe(designMarkdown)
    expect(content(compiled, 'design-system.html')).toContain('This image-grounded document remains authoritative.')
    expect(compiled.source.designMarkdown).toEqual({
      kind: 'selected-material',
      candidateSetId: 'candidate-set:design-system:1',
      candidateId: 'candidate:1',
      materialId: 'material:design-markdown',
      revisionId: 'material:design-markdown:revision:1',
      contentSha256,
      provenanceId: 'provenance:selection',
    })
    expect(JSON.parse(content(compiled, 'manifest.json')).source.designMarkdown).toEqual(
      compiled.source.designMarkdown,
    )
    expect(compiled.files.every((file) => file.provenance.provenanceIds.includes('provenance:selection'))).toBe(true)
  })

  it('retains the generated token-table fallback when no selected DESIGN.md is provided', async () => {
    const compiled = await compileDesignKit(input())

    expect(compiled.source.designMarkdown).toEqual({ kind: 'generated-token-table' })
    expect(content(compiled, 'DESIGN.md')).toContain('| `color.primary` | draft |')
  })

  it('rejects selected DESIGN.md bytes or validation that do not match the authoritative material', async () => {
    const validDesignMarkdown = '---\nprimary: "#0ea5e9"\n---\n# Selected\n'
    const contentSha256 = await sha256(validDesignMarkdown)
    const selectedDocument: DesignDocument = {
      ...document(),
      candidateSets: [selectedCandidateSet('material:design-markdown')],
      provenance: [
        ...document().provenance,
        {
          id: 'provenance:selection',
          operation: 'manual',
          sourceIds: ['source:brand'],
          actor: { kind: 'human', id: 'user:1' },
          recordedAt: timestamp,
        },
      ],
      materials: [{
        id: 'material:design-markdown',
        kind: 'design-markdown',
        name: 'DESIGN.md',
        revisions: [{
          id: 'material:design-markdown:revision:1',
          ordinal: 1,
          createdAt: timestamp,
          content: { id: 'content:design-markdown', uri: 'artifact:design-md', sha256: contentSha256 },
        }],
        currentRevisionId: 'material:design-markdown:revision:1',
      }],
    }
    const selected = {
      candidateSetId: 'candidate-set:design-system:1',
      candidateId: 'candidate:1',
      materialId: 'material:design-markdown',
      revisionId: 'material:design-markdown:revision:1',
      provenanceId: 'provenance:selection',
    } as const

    await expect(compileDesignKit({
      ...input({ document: selectedDocument }),
      selectedDesignMarkdown: { ...selected, candidateId: 'candidate:stale', content: validDesignMarkdown },
    })).rejects.toThrow('not the promoted selection')

    await expect(compileDesignKit({
      ...input({ document: selectedDocument }),
      selectedDesignMarkdown: { ...selected, content: `${validDesignMarkdown}changed` },
    })).rejects.toThrow('does not match revision')

    const invalidDesignMarkdown = '---\nradius: 12px\n---\n# Selected\n'
    const invalidSha256 = await sha256(invalidDesignMarkdown)
    await expect(compileDesignKit({
      ...input({
        document: {
          ...selectedDocument,
          materials: [{
            ...selectedDocument.materials[0]!,
            revisions: [{
              ...selectedDocument.materials[0]!.revisions[0]!,
              content: {
                ...selectedDocument.materials[0]!.revisions[0]!.content,
                sha256: invalidSha256,
              },
            }],
          }],
        },
      }),
      selectedDesignMarkdown: { ...selected, content: invalidDesignMarkdown },
    })).rejects.toThrow('no color tokens')
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

  it('keeps the flat swatch grid when no color token declares a tier', async () => {
    const compiled = await compileDesignKit(input())
    const specimen = content(compiled, 'design-system.html')
    // the stylesheet always defines .tier-label (cheap, unconditional CSS);
    // what must NOT appear is any element actually using it.
    expect(specimen).not.toContain('class="tier-label"')
    expect((specimen.match(/class="swatch-grid"/g) ?? []).length).toBe(1)
  })

  it('groups the swatch grid into Primitive/Semantic/Alias sections once any color token declares a tier', async () => {
    const tieredDocument: DesignDocument = {
      ...document(),
      tokens: [
        { id: 'token:color:brand', name: 'Brand', kind: 'color', value: '#0ea5e9', provenanceId: 'provenance:brand', tier: 'primitive' },
        { id: 'token:color:primary', name: 'Primary', kind: 'color', value: '#0284c7', provenanceId: 'provenance:brand', tier: 'semantic', aliasOf: 'token:color:brand' },
        { id: 'token:color:accent', name: 'Accent', kind: 'color', value: '#f59e0b', tier: 'alias', aliasOf: 'token:color:primary' },
        { id: 'token:color:loose', name: 'Loose', kind: 'color', value: '#111827' },
      ],
    }
    const compiled = await compileDesignKit({
      document: tieredDocument,
      tokens: [
        { tokenId: 'token:color:brand', status: 'verified', category: 'color', cssName: 'brand' },
        { tokenId: 'token:color:primary', status: 'verified', category: 'color', cssName: 'primary' },
        { tokenId: 'token:color:accent', status: 'verified', category: 'color', cssName: 'accent' },
        { tokenId: 'token:color:loose', status: 'verified', category: 'color', cssName: 'loose' },
      ],
    })
    const specimen = content(compiled, 'design-system.html')

    expect(specimen).toContain('<h3 class="tier-label">Primitive</h3>')
    expect(specimen).toContain('<h3 class="tier-label">Semantic</h3>')
    expect(specimen).toContain('<h3 class="tier-label">Alias</h3>')
    expect(specimen).toContain('<h3 class="tier-label">Ungrouped</h3>')
    expect((specimen.match(/class="swatch-grid"/g) ?? []).length).toBe(4)

    // the tokenId, not the IR-alias tokenId, is what a reader can act on —
    // resolved swatch alias references are shown by cssName.
    expect(specimen).toContain('alias of brand')
    expect(specimen).toContain('alias of primary')
    // "loose" carries no tier and no alias — falls into Ungrouped, no alias line.
    expect(specimen).toContain('color.loose')
  })

  it('does not crash when a tiered token aliases a target that exists in the document but was not selected into this kit', async () => {
    const tieredDocument: DesignDocument = {
      ...document(),
      tokens: [
        { id: 'token:color:brand', name: 'Brand', kind: 'color', value: '#0ea5e9', tier: 'semantic', aliasOf: 'token:color:not-included' },
        { id: 'token:color:not-included', name: 'Not included', kind: 'color', value: '#111827' },
      ],
    }
    const compiled = await compileDesignKit({
      document: tieredDocument,
      // Only "brand" is adapted into this kit — its alias target is a real
      // document token, just not one this kit chose to compile.
      tokens: [{ tokenId: 'token:color:brand', status: 'verified', category: 'color', cssName: 'brand' }],
    })
    const specimen = content(compiled, 'design-system.html')
    expect(specimen).toContain('<h3 class="tier-label">Semantic</h3>')
    expect(specimen).toContain('alias of token:color:not-included')
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
