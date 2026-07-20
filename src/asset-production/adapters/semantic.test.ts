import { describe, expect, it } from 'vitest'
import type { SemanticSliceArtifact, SemanticSlicePlan } from '@/services/ai/semantic-slices'
import { bytesToBlob } from '@/lib/image'
import { emptyAssetProductionSnapshot } from '../contracts'
import { projectProductionMaterials, projectProductionReviewQueue } from '../projection'
import { publishSemanticSliceProduction } from './semantic'

const plan: SemanticSlicePlan = {
  version: 'semantic-slices.v0',
  sourceSummary: 'A product with a hero and logo',
  style: { domain: 'software', palette: ['#000000'], density: 'quiet', tone: 'direct' },
  slices: [
    {
      id: 'hero', name: 'Hero', role: 'illustration', description: 'One hero illustration',
      priority: 'required', targetSize: { width: 100, height: 80 }, background: 'transparent',
      styleHints: [], generationPrompt: 'Hero', mustInclude: [], mustExclude: [],
    },
    {
      id: 'logo', name: 'Logo', role: 'brand', description: 'One logo',
      priority: 'required', targetSize: { width: 40, height: 40 }, background: 'transparent',
      styleHints: [], generationPrompt: 'Logo', mustInclude: [], mustExclude: [],
    },
    {
      id: 'badge', name: 'Badge', role: 'badge', description: 'One badge',
      priority: 'required', targetSize: { width: 32, height: 32 }, background: 'transparent',
      styleHints: [], generationPrompt: 'Badge', mustInclude: [], mustExclude: [],
    },
  ],
}

const generated = (
  specId: string,
  overrides: Partial<SemanticSliceArtifact> = {},
): SemanticSliceArtifact => ({
  spec: plan.slices.find((spec) => spec.id === specId)!,
  route: 'text-to-image',
  asset: { mediaType: 'image/png', bytes: new Uint8Array([1]) },
  validation: {
    verdict: 'pass', hasSingleSubject: true, hasTransparentBackground: true,
    matchesSpec: true, issues: [],
  },
  accepted: true,
  retryable: false,
  ...overrides,
})

describe('semantic production adapter', () => {
  it('publishes passed assets, keeps rejected assets in review, and fails missing output', async () => {
    const artifacts = [
      generated('hero'),
      generated('logo', {
        accepted: false,
        validation: {
          verdict: 'reject', hasSingleSubject: true, hasTransparentBackground: false,
          matchesSpec: false, issues: ['Background is opaque.'],
        },
      }),
      generated('logo', { route: 'image-to-image', accepted: true }),
      generated('badge', { asset: undefined, validation: undefined, accepted: false, error: 'provider failed' }),
    ]
    const result = await publishSemanticSliceProduction({
      snapshot: emptyAssetProductionSnapshot(),
      semanticPlan: plan,
      artifacts,
      projectRevisionId: 'revision:1',
      runId: 'semantic:run:1',
      providerRoute: 'provider/model',
      at: 10,
      materialize: async (artifact) => ({
        artifact: {
          artifactId: `artifact:${artifact.spec.id}`,
          sha256: (artifact.spec.id === 'hero' ? 'a' : 'b').repeat(64),
          mediaType: 'image/png',
          width: artifact.spec.targetSize.width,
          height: artifact.spec.targetSize.height,
        },
        blob: bytesToBlob(artifact.asset.bytes, 'image/png'),
      }),
    })

    expect(result.run.status).toBe('partial')
    expect(projectProductionMaterials(result.snapshot)).toEqual(expect.arrayContaining([
      expect.objectContaining({ manifestItemId: 'semantic:hero', status: 'ready' }),
      expect.objectContaining({ manifestItemId: 'semantic:logo', status: 'ready' }),
    ]))
    expect(projectProductionReviewQueue(result.snapshot)).toEqual([
      expect.objectContaining({ manifestItemId: 'semantic:badge', status: 'failed' }),
    ])
    expect(result.projections.map((item) => item.manifestItemId)).toEqual([
      'semantic:hero', 'semantic:logo',
    ])
  })

  it('does not publish an unvalidated generated asset as ready', async () => {
    const singlePlan = { ...plan, slices: [plan.slices[0]!] }
    const result = await publishSemanticSliceProduction({
      snapshot: emptyAssetProductionSnapshot(), semanticPlan: singlePlan,
      artifacts: [generated('hero', { validation: undefined, accepted: false })],
      projectRevisionId: 'revision:1', runId: 'semantic:run:review',
      providerRoute: 'provider/model', at: 10,
      materialize: async (artifact) => ({
        artifact: { artifactId: 'artifact:hero', sha256: 'a'.repeat(64), mediaType: 'image/png', width: 100, height: 80 },
        blob: bytesToBlob(artifact.asset.bytes, 'image/png'),
      }),
    })
    expect(result.run.status).toBe('needs-review')
    expect(projectProductionMaterials(result.snapshot)).toEqual([])
    expect(projectProductionReviewQueue(result.snapshot)).toEqual([
      expect.objectContaining({ status: 'needs-review', issues: [expect.objectContaining({ code: 'semantic-qa-missing' })] }),
    ])
  })
})
