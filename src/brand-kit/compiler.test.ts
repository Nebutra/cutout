import { describe, expect, it } from 'vitest'
import type { DesignDocument } from '@/design-ir'
import {
  compileBrandKit,
  brandKitInputSchema,
  type BrandKitInput,
} from './compiler'

const timestamp = '2026-07-11T10:00:00.000Z'
const digest = 'a'.repeat(64)

function document(): DesignDocument {
  return {
    version: 'design-ir.v1',
    meta: { id: 'project:acme', title: 'Acme', createdAt: timestamp, updatedAt: timestamp },
    revision: { id: 'revision:1', number: 1, createdAt: timestamp, author: { kind: 'human', id: 'user:acme' } },
    needs: [],
    sources: [
      source('source:logo', 'Logo master', 'brand-asset', 'content:logo', 'image/svg+xml'),
      source('source:guide', 'Brand guide', 'evidence', 'content:guide', 'text/markdown'),
      source('source:type', 'Typeface license', 'brand-asset', 'content:type', 'application/pdf'),
      source('source:photo', 'Photography guide', 'evidence', 'content:photo', 'image/jpeg'),
    ],
    brands: [{ id: 'brand:acme', name: 'Acme', status: 'active', provenanceId: 'provenance:logo' }],
    tokens: [],
    components: [],
    materials: [],
    provenance: [
      provenance('provenance:logo', 'source:logo'),
      provenance('provenance:guide', 'source:guide'),
      provenance('provenance:type', 'source:type'),
      provenance('provenance:photo', 'source:photo'),
    ],
    relations: [],
  }
}

function source(
  id: string,
  title: string,
  role: 'brand-asset' | 'evidence',
  contentId: string,
  mediaType: string,
): DesignDocument['sources'][number] {
  return {
    id,
    kind: role === 'brand-asset' ? 'document' : 'photo',
    role,
    title,
    license: { kind: 'proprietary', holder: 'Acme, Inc.' },
    content: [{ id: contentId, uri: `sha256:${digest}`, mediaType, sha256: digest }],
  }
}

function provenance(id: string, sourceId: string): DesignDocument['provenance'][number] {
  return {
    id,
    operation: 'import',
    sourceIds: [sourceId],
    actor: { kind: 'human', id: 'user:acme' },
    recordedAt: timestamp,
  }
}

function evidence(sourceId: string, contentId: string, provenanceId: string) {
  return { sourceId, contentId, provenanceId }
}

function input(overrides: Partial<BrandKitInput> = {}): BrandKitInput {
  return {
    document: document(),
    brand: {
      brandId: 'brand:acme',
      logo: {
        variants: [{ id: 'logo:primary', label: 'Primary logo', kind: 'primary', evidence: evidence('source:logo', 'content:logo', 'provenance:logo') }],
      },
      clearspace: { rule: 'Keep one cap-height clear on every side.', evidence: evidence('source:guide', 'content:guide', 'provenance:guide') },
      minSize: [{ logoId: 'logo:primary', width: 24, height: 24, unit: 'px', evidence: evidence('source:guide', 'content:guide', 'provenance:guide') }],
      colors: [
        { id: 'color:primary', name: 'Primary', cssName: 'primary', value: '#0EA5E9', evidence: evidence('source:guide', 'content:guide', 'provenance:guide') },
        { id: 'color:ink', name: 'Ink', cssName: 'ink', value: '#0F172A', evidence: evidence('source:guide', 'content:guide', 'provenance:guide') },
      ],
      type: [{ id: 'type:sans', role: 'body', family: 'Acme Sans', evidence: evidence('source:type', 'content:type', 'provenance:type') }],
      icon: { guidance: 'Use a 2px rounded stroke.', evidence: evidence('source:guide', 'content:guide', 'provenance:guide') },
      photo: { guidance: 'Use documented studio product photography only.', evidence: evidence('source:photo', 'content:photo', 'provenance:photo') },
      voice: { guidance: 'Use concise, factual language.', evidence: evidence('source:guide', 'content:guide', 'provenance:guide') },
      assetRecipes: [{ id: 'recipe:og', name: 'Open Graph image', kind: 'social-image', instructions: 'Place the approved primary logo on the approved blue field.', evidence: evidence('source:guide', 'content:guide', 'provenance:guide') }],
    },
    ...overrides,
  }
}

describe('Brand Kit v1 compiler', () => {
  it('emits only explicit, attributable brand facts as deterministic portable artifacts', async () => {
    const compiled = await compileBrandKit(input())

    expect(compiled.version).toBe('brand-kit.v1')
    expect(compiled.files.map((file) => file.path)).toEqual([
      'BRAND.md',
      'brand.css',
      'brand.manifest.json',
      'brand.tokens.json',
    ])
    expect(compiled.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true)
    expect(compiled.files.every((file) => file.sourceFingerprint === compiled.source.documentFingerprint)).toBe(true)
    expect(compiled.files.every((file) => file.provenance.sourceIds.length > 0)).toBe(true)
    await expect(Promise.all(compiled.files.map(async (file) => sha256(file.content)))).resolves.toEqual(
      compiled.files.map((file) => file.sha256),
    )

    expect(content(compiled, 'brand.css')).toBe(':root {\n  --cutout-brand-color-ink: #0F172A;\n  --cutout-brand-color-primary: #0EA5E9;\n}\n')
    expect(JSON.parse(content(compiled, 'brand.tokens.json')).color.primary.$value).toBe('#0EA5E9')
    expect(content(compiled, 'BRAND.md')).toContain('`logo:primary`')
    expect(content(compiled, 'BRAND.md')).toContain('Use documented studio product photography only.')
    expect(content(compiled, 'brand.manifest.json')).not.toContain('brand.manifest.json')
  })

  it('is byte stable when semantically unordered collections are reordered', async () => {
    const first = await compileBrandKit(input())
    const original = input()
    const second = await compileBrandKit({
      ...original,
      brand: {
        ...original.brand,
        colors: [...original.brand.colors].reverse(),
        minSize: [...original.brand.minSize].reverse(),
        assetRecipes: [...original.brand.assetRecipes].reverse(),
      },
    })

    expect(second).toEqual(first)
  })

  it('rejects speculative or unlicensed brand claims before emitting output', async () => {
    expect(() => brandKitInputSchema.parse({ document: document(), brand: { brandId: 'brand:acme' } })).toThrow()

    const missingEvidence = input()
    const invalid = structuredClone(missingEvidence) as BrandKitInput
    invalid.brand.logo.variants[0] = { ...invalid.brand.logo.variants[0]!, evidence: { sourceId: 'source:logo', contentId: 'content:missing', provenanceId: 'provenance:logo' } }
    await expect(compileBrandKit(invalid)).rejects.toThrow('content')

    const unlicensed = input()
    const unknownLicense = structuredClone(unlicensed) as BrandKitInput
    unknownLicense.document.sources[0] = {
      ...unknownLicense.document.sources[0]!,
      license: { kind: 'unknown', rationale: 'Not reviewed.' },
    }
    await expect(compileBrandKit(unknownLicense)).rejects.toThrow('license')

    const missingProvenance = input()
    const noProvenance = structuredClone(missingProvenance) as BrandKitInput
    noProvenance.brand.photo = { ...noProvenance.brand.photo, evidence: evidence('source:photo', 'content:photo', 'provenance:guide') }
    await expect(compileBrandKit(noProvenance)).rejects.toThrow('does not cite source')
  })
})

function content(compiled: Awaited<ReturnType<typeof compileBrandKit>>, path: string): string {
  const file = compiled.files.find((entry) => entry.path === path)
  if (!file) throw new Error(`Missing compiled file ${path}`)
  return file.content
}

async function sha256(value: string): Promise<string> {
  const result = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(result)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
