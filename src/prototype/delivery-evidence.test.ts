import { describe, expect, it } from 'vitest'
import type { PersistedPrototypeSuiteCandidateSet } from '@/workspace/workspace-snapshot'
import { createPrototypeAssetManifest } from './asset-manifest'
import { sha256Bytes } from '@/asset-production/hash'
import { projectPrototypeDeliveryEvidence } from './delivery-evidence'
import type { VerifiedResourcePackArtifact } from './resource-pack-production'
import { prototypePlanSchema } from './prototype-plan'

const markdown = '---\ntokens:\n  color:\n    primary: "#123456"\n  spacing:\n    medium: "16px"\n---\n# Design'

describe('prototype delivery evidence', () => {
  it('derives complete sanitized deterministic proof from the validated artifact', async () => {
    const evidence = await projectPrototypeDeliveryEvidence(await candidateSet(), await verifiedArtifacts())
    expect(evidence).toHaveLength(1)
    expect(evidence[0]).toMatchObject({
      candidateId: 'suite-1',
      designSystemId: 'design-1',
      resourcePackId: 'resource-pack-1',
      status: 'ready',
      routes: ['/atlas'],
      routeCount: 1,
      pageCount: 1,
      resourceAssetCount: 1,
      artifactCount: 1,
      qualityReviewStatus: 'passed',
    })
    expect(Object.values(evidence[0]!.digests)).toHaveLength(16)
    expect(Object.values(evidence[0]!.digests).every((digest) => /^[a-f0-9]{64}$/.test(digest)))
      .toBe(true)
    expect(JSON.stringify(evidence)).not.toMatch(/artifact:private|provenance:private|bytes|prompt|provider/i)
    expect(await projectPrototypeDeliveryEvidence(await candidateSet(), await verifiedArtifacts()))
      .toEqual(evidence)
  })

  it.each([
    ['review document', (set: PersistedPrototypeSuiteCandidateSet) => {
      delete (set.artifacts['candidate:suite:1']!.plan as { reviewDocument?: unknown }).reviewDocument
    }],
    ['page review', (set: PersistedPrototypeSuiteCandidateSet) => {
      delete (set.artifacts['candidate:suite:1']!.pages[0] as { review?: unknown }).review
    }],
    ['resource review', (set: PersistedPrototypeSuiteCandidateSet) => {
      delete (set.artifacts['candidate:suite:1']!.resourcePack.assets[0] as { review?: unknown }).review
    }],
    ['DESIGN.md tokens', (set: PersistedPrototypeSuiteCandidateSet) => {
      (set.artifacts['candidate:suite:1']!.designSystem.artifact as { designMarkdown: string })
        .designMarkdown = '# Missing frontmatter'
    }],
    ['complete pages', (set: PersistedPrototypeSuiteCandidateSet) => {
      (set.artifacts['candidate:suite:1'] as unknown as { pages: unknown[] }).pages = []
    }],
    ['exact resource binding', (set: PersistedPrototypeSuiteCandidateSet) => {
      (set.artifacts['candidate:suite:1']!.resourcePack as unknown as { assets: unknown[] }).assets = []
    }],
    ['suite provenance', (set: PersistedPrototypeSuiteCandidateSet) => {
      (set.artifacts['candidate:suite:1'] as unknown as { provenanceIds: string[] }).provenanceIds = []
    }],
  ])('fails closed when %s evidence is absent', async (_label, mutate) => {
    const set = await candidateSet()
    mutate(set)
    await expect(projectPrototypeDeliveryEvidence(set, await verifiedArtifacts())).rejects.toThrow()
  })

  it('fails closed when a bound local resource artifact is missing or mismatched', async () => {
    await expect(projectPrototypeDeliveryEvidence(await candidateSet(), {}))
      .rejects.toThrow(/verified local resource artifacts/i)
    const verified = await verifiedArtifacts()
    const candidate = verified['candidate:suite:1']![0]!
    await expect(projectPrototypeDeliveryEvidence(await candidateSet(), {
      'candidate:suite:1': [{ ...candidate, artifactId: 'artifact:other' }],
    })).rejects.toThrow(/unverified resource bytes/i)
  })

  it('reports attention-required without rejecting integral reviewed artifacts', async () => {
    const set = await candidateSet()
    const page = set.artifacts['candidate:suite:1']!.pages[0]!
    ;(page.review!.verdict as { pass: boolean }).pass = false
    ;(page.review!.verdict.failures as string[]).push('Text needs review')
    await expect(projectPrototypeDeliveryEvidence(set, await verifiedArtifacts()))
      .resolves.toMatchObject([{ qualityReviewStatus: 'attention-required' }])
  })

  it('reports attention-required when resource review warnings remain observational', async () => {
    const set = await candidateSet()
    const review = set.artifacts['candidate:suite:1']!.resourcePack.assets[0]!.review!
    ;(review.observationalIssues as Array<{ code: string; message: string }>).push({
      code: 'board-background-noncompliant',
      message: 'Board background needs attention.',
    })
    await expect(projectPrototypeDeliveryEvidence(set, await verifiedArtifacts()))
      .resolves.toMatchObject([{ qualityReviewStatus: 'attention-required' }])
  })

  it('rejects a page review bound to stale bytes', async () => {
    const set = await candidateSet()
    ;(set.artifacts['candidate:suite:1']!.pages[0]!.review as { artifactSha256: string })
      .artifactSha256 = 'f'.repeat(64)
    await expect(projectPrototypeDeliveryEvidence(set, await verifiedArtifacts()))
      .rejects.toThrow(/stale page review/i)
  })
})

async function verifiedArtifacts(): Promise<
  Readonly<Record<string, readonly VerifiedResourcePackArtifact[]>>
> {
  const bytes = new Uint8Array([7, 8, 9])
  return {
    'candidate:suite:1': [{
      manifestItemId: 'atlas-home-hero-1',
      artifactId: 'artifact:private:1',
      sha256: await sha256Bytes(bytes),
      mediaType: 'image/png',
      width: 100,
      height: 80,
      byteLength: bytes.byteLength,
    }],
  }
}

async function candidateSet(): Promise<PersistedPrototypeSuiteCandidateSet> {
  const plan = prototypePlanSchema.parse({
    version: 'prototype-plan.v0',
    product: {
      name: 'Atlas', summary: 'Travel planning', audience: 'Travelers',
      primaryGoal: 'Plan a trip', platform: 'web',
    },
    designSystem: {
      styleSummary: 'Quiet editorial', palette: ['#123456'], typography: 'Sans',
      spacing: '8px', componentPrinciples: ['Clear hierarchy'], assetDirection: 'Crisp',
    },
    pages: [{
      id: 'atlas-home', name: 'Atlas', route: '/atlas', purpose: 'Plan a trip',
      viewport: { platform: 'web', width: 1440, height: 900 },
      regions: [{
        id: 'hero', name: 'Hero', role: 'content', summary: 'Trip image', complexity: 'medium',
        assetOpportunities: ['destination image'],
      }],
    }],
    flows: [{ id: 'flow:atlas', name: 'Plan', goal: 'Plan', startPageId: 'atlas-home', steps: [] }],
    reviewDocument: {
      format: 'markdown', primaryFlow: '# Primary review', fullPlan: '# Full review',
    },
  })
  const manifest = createPrototypeAssetManifest(plan, plan.pages)
  const pageBytes = new Uint8Array([4, 5, 6])
  const artifact = {
    designSystem: {
      candidateSetId: 'candidate-set:design:1', candidateId: 'candidate:design:1',
      directionId: 'direction:1', baseRevisionId: 'revision:1',
      provenanceIds: ['provenance:private:design'],
      artifact: {
        name: 'Atlas', designMarkdown: markdown, bytes: new Uint8Array([1, 2, 3]),
        mediaType: 'image/png', width: 100, height: 100,
      },
    },
    plan,
    pages: [{
      page: plan.pages[0]!, bytes: pageBytes,
      mediaType: 'image/png', width: 1440, height: 900,
      review: {
        version: 'prototype-page-review.v1' as const,
        artifactSha256: await sha256Bytes(pageBytes),
        reviewer: { providerId: 'reviewer', model: 'vision-model' },
        verdict: { pass: true, failures: [] },
        reviewedAt: '2026-08-03T00:00:00.000Z',
      },
    }],
    resourcePack: {
      id: 'resource-pack:private:run', manifest,
      manifestProvenanceId: 'provenance:private:manifest',
      assets: [{
        manifestItemId: manifest.assets[0]!.id,
        artifactId: 'artifact:private:1',
        provenanceIds: ['provenance:private:asset'],
        review: {
          version: 'prototype-resource-review.v1' as const,
          artifactId: 'artifact:private:1',
          reviewer: { providerId: 'reviewer', model: 'vision-model' },
          verdict: { pass: true, failures: [] },
          observationalIssues: [],
          reviewedAt: '2026-08-03T00:00:00.000Z',
        },
      }],
    },
    provenanceIds: ['provenance:private:suite'],
  }
  return {
    set: {
      id: 'candidate-set:suite:1', kind: 'prototype-suite', baseRevisionId: 'revision:1',
      proposal: {
        mode: 'fixed', decidedBy: 'user', count: 1, rationale: 'One direction',
        directions: [{
          id: 'direction:1', label: 'Atlas', thesis: 'Quiet planning',
          vary: ['composition'], preserve: ['identity'],
        }],
        bounds: { maxCandidates: 3, maxParallelism: 1 },
      },
      candidates: [{
        id: 'candidate:suite:1', directionId: 'direction:1', status: 'ready',
        outputs: [
          { role: 'prototype-suite', materialId: 'material:prototype-suite:candidate:suite:1:suite' },
          { role: 'resource-pack', materialId: 'material:prototype-suite:candidate:suite:1:resource-pack' },
        ],
        provenanceIds: artifact.provenanceIds,
      }],
    },
    artifacts: { 'candidate:suite:1': artifact },
  }
}
