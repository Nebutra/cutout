import { describe, expect, it } from 'vitest'
import { createEmptyWorkspaceSnapshot, isWorkspaceSnapshotEmpty, workspaceSnapshotFingerprint } from '@/workspace/workspace-snapshot'
import type { CodingReceipt } from '@/coding-runtime/contracts'
import { createPrototypeAssetManifest } from './asset-manifest'
import {
  createPrototypeDesignSystemCandidateSet,
  persistPrototypeDesignSystemCandidateSet,
  updatePrototypeDesignSystemCandidate,
} from './design-system-candidates'
import { prototypePlanSchema, type PrototypePlan } from './prototype-plan'
import {
  cancelUnstartedPrototypeSuiteCandidates,
  createPrototypeSuiteCandidateSet,
  projectSelectedPrototypeSuiteToWorkspace,
  recoverPrototypeSuiteCandidateSet,
  selectPrototypeSuiteCandidate,
  updatePrototypeSuiteCandidate,
  validatePrototypeSuiteCandidateSet,
} from './prototype-suite-candidates'

const designMarkdown = '---\ntokens:\n  color:\n    primary: "#123456"\n---\n# Design'

describe('persisted prototype suite candidates', () => {
  it('cancels only unstarted candidates when a strict benchmark cannot complete', () => {
    const designSystems = readyDesignSystems()
    let suites = createPrototypeSuiteCandidateSet({
      designSystemCandidates: designSystems,
      baseRevisionId: 'revision:suites:1',
    })
    suites = updatePrototypeSuiteCandidate(
      suites,
      suites.set.candidates[0]!.id,
      { status: 'generating' },
      designSystems,
    )
    suites = updatePrototypeSuiteCandidate(
      suites,
      suites.set.candidates[1]!.id,
      { status: 'failed', error: 'provider rejected the suite' },
      designSystems,
    )

    const cancelled = cancelUnstartedPrototypeSuiteCandidates(suites, designSystems)

    expect(cancelled.set.candidates.map(({ status }) => status)).toEqual([
      'generating',
      'failed',
      'cancelled',
    ])
  })

  it('persists three complete alternatives and projects only the human-selected suite to legacy fields', () => {
    const designSystems = readyDesignSystems()
    let suites = createPrototypeSuiteCandidateSet({
      designSystemCandidates: designSystems,
      baseRevisionId: 'revision:suites:1',
      id: 'candidate-set:suites:1',
    })

    for (const [index, candidate] of suites.set.candidates.entries()) {
      suites = updatePrototypeSuiteCandidate(
        suites,
        candidate.id,
        { status: 'ready', artifact: suiteArtifact(suites, candidate.id, designSystems, `route-${index + 1}`, index === 0) },
        designSystems,
      )
    }

    expect(validatePrototypeSuiteCandidateSet(suites, designSystems).ok).toBe(true)
    expect(() => selectPrototypeSuiteCandidate(
      suites,
      suites.set.candidates[0]!.id,
      { kind: 'agent', id: 'agent:planner' },
    )).toThrow(/human actor/i)

    const selectedId = suites.set.candidates[1]!.id
    const selected = selectPrototypeSuiteCandidate(
      suites,
      selectedId,
      { kind: 'human', id: 'user:1' },
      '2026-07-28T08:00:00.000Z',
    )
    const projected = projectSelectedPrototypeSuiteToWorkspace(
      createEmptyWorkspaceSnapshot(),
      selected,
    )

    expect(projected.prototypeSuiteCandidates?.set.candidates).toHaveLength(3)
    expect(projected.prototypeSuiteCandidates?.artifacts[selectedId]?.codingReceipt).toBeUndefined()
    expect(projected.prototypePlan?.pages.map((page) => page.route)).toEqual([
      '/route-2',
      '/route-2/detail',
    ])
    expect(projected.prototypeDesignSystem?.name).toBe('Direction 2')
    expect(projected.prototypePages).toHaveLength(2)
    expect(projected.selectedPrototypePageId).toBe('route-2-home')
    expect(projected.prototypeScope).toBe('full-plan')
    expect(isWorkspaceSnapshotEmpty(projected)).toBe(false)
    expect(workspaceSnapshotFingerprint(projected)).not.toBe('')
  })

  it('rejects incomplete pages, incomplete resource packs, and mismatched Design System bindings', () => {
    const designSystems = readyDesignSystems()
    const suites = createPrototypeSuiteCandidateSet({
      designSystemCandidates: designSystems,
      baseRevisionId: 'revision:suites:1',
    })
    const candidateId = suites.set.candidates[0]!.id
    const complete = suiteArtifact(suites, candidateId, designSystems, 'alpha')

    expect(() => updatePrototypeSuiteCandidate(
      suites,
      candidateId,
      { status: 'ready', artifact: { ...complete, pages: complete.pages.slice(0, 1) } },
      designSystems,
    )).toThrow(/requires 2 pages/i)

    expect(() => updatePrototypeSuiteCandidate(
      suites,
      candidateId,
      {
        status: 'ready',
        artifact: {
          ...complete,
          resourcePack: { ...complete.resourcePack, assets: complete.resourcePack.assets.slice(0, -1) },
        },
      },
      designSystems,
    )).toThrow(/requires 4 attributable assets/i)

    const otherDirection = designSystems.set.candidates[1]!
    expect(() => updatePrototypeSuiteCandidate(
      suites,
      candidateId,
      {
        status: 'ready',
        artifact: {
          ...complete,
          designSystem: {
            ...complete.designSystem,
            candidateId: otherDirection.id,
            directionId: otherDirection.directionId,
            provenanceIds: otherDirection.provenanceIds,
            artifact: designSystems.artifacts[otherDirection.id]!,
          },
        },
      },
      designSystems,
    )).toThrow(/bound to Design System direction/i)
  })

  it('requires Agent-authored alternatives to have distinct route graphs', () => {
    const designSystems = readyDesignSystems()
    let suites = createPrototypeSuiteCandidateSet({
      designSystemCandidates: designSystems,
      baseRevisionId: 'revision:suites:1',
    })
    const first = suites.set.candidates[0]!
    suites = updatePrototypeSuiteCandidate(
      suites,
      first.id,
      { status: 'ready', artifact: suiteArtifact(suites, first.id, designSystems, 'same') },
      designSystems,
    )
    const second = suites.set.candidates[1]!

    expect(() => updatePrototypeSuiteCandidate(
      suites,
      second.id,
      { status: 'ready', artifact: suiteArtifact(suites, second.id, designSystems, 'same') },
      designSystems,
    )).toThrow(/duplicates the route graph/i)
  })

  it('round-trips optional controlled Coding evidence and fails closed on corrupted persisted state', () => {
    const designSystems = readyDesignSystems()
    let suites = createPrototypeSuiteCandidateSet({
      designSystemCandidates: designSystems,
      baseRevisionId: 'revision:suites:1',
    })
    const candidate = suites.set.candidates[0]!
    const artifact = suiteArtifact(suites, candidate.id, designSystems, 'coded', true)
    suites = updatePrototypeSuiteCandidate(
      suites,
      candidate.id,
      { status: 'ready', artifact },
      designSystems,
    )

    expect(recoverPrototypeSuiteCandidateSet(suites)?.artifacts[candidate.id]?.codingReceipt)
      .toEqual(codingReceipt())
    expect(recoverPrototypeSuiteCandidateSet({
      ...suites,
      artifacts: {
        ...suites.artifacts,
        [candidate.id]: { ...artifact, provenanceIds: [] },
      },
    })).toBeNull()
  })
})

function readyDesignSystems() {
  const sourcePlan = prototypePlanSchema.parse({
    ...planFor('design-source'),
    designSystem: {
      ...planFor('design-source').designSystem,
      exploration: {
        mode: 'auto',
        decidedBy: 'agent',
        count: 3,
        rationale: 'Three deliberate directions expose meaningful product tradeoffs.',
        directions: [1, 2, 3].map((index) => ({
          id: `direction:${index}`,
          label: `Direction ${index}`,
          thesis: `Distinct thesis ${index}`,
          vary: [`axis:${index}`],
          preserve: ['product intent', 'platform contract'],
        })),
        bounds: { maxCandidates: 8, maxParallelism: 3 },
      },
    },
  })
  let state = createPrototypeDesignSystemCandidateSet({
    plan: sourcePlan,
    baseRevisionId: 'revision:design:1',
    id: 'candidate-set:design:1',
  })
  for (const [index, candidate] of state.set.candidates.entries()) {
    state = updatePrototypeDesignSystemCandidate(state, candidate.id, {
      status: 'ready',
      artifact: {
        name: `Direction ${index + 1}`,
        designMarkdown,
        bytes: new Uint8Array([index + 1, 2, 3]),
        mediaType: 'image/png',
        width: 100,
        height: 100,
        blob: new Blob([new Uint8Array([index + 1, 2, 3])], { type: 'image/png' }),
      },
    })
  }
  return persistPrototypeDesignSystemCandidateSet(state)
}

function suiteArtifact(
  suites: ReturnType<typeof createPrototypeSuiteCandidateSet>,
  suiteCandidateId: string,
  designSystems: ReturnType<typeof readyDesignSystems>,
  route: string,
  withCodingReceipt = false,
) {
  const suiteCandidate = suites.set.candidates.find((candidate) => candidate.id === suiteCandidateId)!
  const designCandidate = designSystems.set.candidates.find(
    (candidate) => candidate.directionId === suiteCandidate.directionId,
  )!
  const plan = planFor(route)
  const manifest = createPrototypeAssetManifest(plan, plan.pages)
  return {
    designSystem: {
      candidateSetId: designSystems.set.id,
      candidateId: designCandidate.id,
      directionId: designCandidate.directionId,
      baseRevisionId: designSystems.set.baseRevisionId,
      provenanceIds: designCandidate.provenanceIds,
      artifact: designSystems.artifacts[designCandidate.id]!,
    },
    plan,
    pages: plan.pages.map((page, index) => ({
      page,
      bytes: new Uint8Array([index + 1, 7, 9]),
      mediaType: 'image/png',
      width: page.viewport.width,
      height: page.viewport.height,
    })),
    resourcePack: {
      id: `resource-pack:${route}`,
      manifest,
      manifestProvenanceId: `provenance:resource-pack:${route}`,
      assets: manifest.assets.map((asset, index) => ({
        manifestItemId: asset.id,
        artifactId: `artifact:${route}:${index + 1}`,
        provenanceIds: [`provenance:asset:${route}:${index + 1}`],
      })),
    },
    provenanceIds: [`provenance:suite:${route}`],
    ...(withCodingReceipt ? { codingReceipt: codingReceipt() } : {}),
  }
}

function planFor(route: string): PrototypePlan {
  return prototypePlanSchema.parse({
    version: 'prototype-plan.v0',
    product: {
      name: 'Atlas',
      summary: 'A multi-route planning workspace.',
      audience: 'Planning teams',
      primaryGoal: 'Coordinate work',
      platform: 'web',
    },
    designSystem: {
      styleSummary: 'Focused and editorial',
      palette: ['#123456', '#ffffff'],
      typography: 'Grotesk',
      spacing: '8px',
      componentPrinciples: ['Clear hierarchy'],
      assetDirection: 'Crisp image-led assets',
    },
    pages: [
      {
        id: `${route}-home`,
        name: 'Home',
        route: `/${route}`,
        purpose: 'Start planning',
        viewport: { platform: 'web', width: 1440, height: 900 },
        regions: [{
          id: 'hero', name: 'Hero', role: 'content', summary: 'Plan overview', complexity: 'medium',
          assetOpportunities: ['overview art', 'status motif'],
        }],
        interactions: [{
          id: 'open-detail', label: 'Open detail', trigger: 'click', sourceSectionId: 'hero',
          sourceElement: 'Detail link', intent: 'Inspect the plan',
          action: { type: 'navigate', targetPageId: `${route}-detail` },
        }],
      },
      {
        id: `${route}-detail`,
        name: 'Detail',
        route: `/${route}/detail`,
        purpose: 'Inspect plan detail',
        viewport: { platform: 'web', width: 1440, height: 900 },
        regions: [{
          id: 'detail', name: 'Detail', role: 'content', summary: 'Detailed plan', complexity: 'medium',
          assetOpportunities: ['detail art', 'timeline motif'],
        }],
      },
    ],
    flows: [{
      id: `flow:${route}`,
      name: 'Inspect plan',
      goal: 'Open plan detail',
      startPageId: `${route}-home`,
      steps: [{ fromPageId: `${route}-home`, interactionId: 'open-detail', toPageId: `${route}-detail` }],
    }],
  })
}

function codingReceipt(): CodingReceipt {
  return {
    version: 'cutout.coding-receipt.v1',
    receiptId: 'receipt:coded',
    taskId: 'coding:suite:coded',
    status: 'applied',
    baseSnapshotId: 'sha256:base',
    resultSnapshotId: 'sha256:result',
    changedFiles: [{ path: 'site/index.html', operation: 'create', sha256: 'a'.repeat(64) }],
    checks: [{ name: 'build', status: 'passed' }],
    screenshots: [],
    provenance: {
      backend: 'controlled-test-backend',
      inputRefs: ['candidate:prototype-suite:1'],
      patchSha256: 'b'.repeat(64),
    },
    startedAt: 1,
    completedAt: 2,
  }
}
