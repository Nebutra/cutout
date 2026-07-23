import { describe, expect, it } from 'vitest'
import { prototypePlanSchema } from './prototype-plan'
import {
  createPrototypeDesignSystemCandidateSet,
  recoverPrototypeDesignSystemCandidateSet,
  selectPrototypeDesignSystemCandidate,
  selectedPrototypeDesignSystem,
  selectedDesignMarkdownBinding,
  persistPrototypeDesignSystemCandidateSet,
  updatePrototypeDesignSystemCandidate,
} from './design-system-candidates'
import { createEmptyWorkspaceSnapshot } from '@/workspace/workspace-snapshot'
import type { DesignDocument } from '@/design-ir'

const plan = prototypePlanSchema.parse({
  version: 'prototype-plan.v0',
  product: {
    name: 'Cutout',
    summary: 'A visual production workspace.',
    audience: 'Design teams',
    primaryGoal: 'Produce coherent assets',
    platform: 'desktop',
  },
  designSystem: {
    styleSummary: 'Focused and editorial',
    palette: ['white', 'black'],
    typography: 'Grotesk',
    spacing: 'Compact',
    componentPrinciples: ['Clear hierarchy'],
    assetDirection: 'Crisp image-led assets',
    exploration: {
      mode: 'auto',
      decidedBy: 'agent',
      count: 2,
      rationale: 'Two coherent directions expose the meaningful tradeoff.',
      directions: [
        { id: 'quiet', label: 'Quiet editorial', thesis: 'Restrained and precise', vary: ['density'], preserve: ['product identity'] },
        { id: 'expressive', label: 'Expressive studio', thesis: 'Bold and tactile', vary: ['shape language'], preserve: ['product identity'] },
      ],
      bounds: { maxCandidates: 8, maxParallelism: 2 },
    },
  },
  pages: [{
    id: 'home',
    name: 'Home',
    route: '/',
    purpose: 'Start work',
    viewport: { platform: 'desktop', width: 1440, height: 900 },
    regions: [{ id: 'main', name: 'Main', role: 'content', summary: 'Workspace', complexity: 'medium' }],
  }],
  flows: [{ id: 'main', name: 'Main', goal: 'Start', startPageId: 'home', steps: [] }],
})

const artifact = {
  name: 'Quiet editorial',
  designMarkdown: '---\ntokens:\n  color:\n    primary: "#123456"\n---\n# Design',
  bytes: new Uint8Array([1, 2, 3]),
  mediaType: 'image/png',
  width: 100,
  height: 100,
  blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
}

describe('Design System candidate runtime', () => {
  it('requires a human to choose among multiple ready candidates', () => {
    let state = createPrototypeDesignSystemCandidateSet({ plan, baseRevisionId: 'revision:1', id: 'set:1' })
    for (const candidate of state.set.candidates) {
      state = updatePrototypeDesignSystemCandidate(state, candidate.id, { status: 'ready', artifact })
    }
    expect(() => selectPrototypeDesignSystemCandidate(
      state,
      state.set.candidates[0]!.id,
      { kind: 'agent', id: 'agent' },
    )).toThrow(/human actor/i)
    const selected = selectPrototypeDesignSystemCandidate(
      state,
      state.set.candidates[0]!.id,
      { kind: 'human', id: 'user' },
    )
    expect(selectedPrototypeDesignSystem(selected)?.designMarkdown).toContain('# Design')

    const markdownMaterialId = selected.set.candidates[0]!.outputs
      .find((output) => output.role === 'design-markdown')!.materialId
    const document: DesignDocument = {
      version: 'design-ir.v1',
      meta: { id: 'document:1', title: 'Test', createdAt: '2026-07-23T00:00:00.000Z', updatedAt: '2026-07-23T00:00:00.000Z' },
      revision: { id: 'revision:1', number: 1, createdAt: '2026-07-23T00:00:00.000Z', author: { kind: 'human', id: 'user' } },
      needs: [], sources: [], brands: [], tokens: [], components: [], materials: [{
        id: markdownMaterialId,
        kind: 'design-markdown',
        name: 'DESIGN.md',
        revisions: [{
          id: 'material-revision:1',
          ordinal: 1,
          createdAt: '2026-07-23T00:00:00.000Z',
          content: { id: 'content:1', uri: 'sha256:test', mediaType: 'text/markdown' },
        }],
        currentRevisionId: 'material-revision:1',
      }],
      candidateSets: [selected.set], provenance: [], relations: [],
    }
    const snapshot = createEmptyWorkspaceSnapshot({
      prototypeDesignSystemCandidates: persistPrototypeDesignSystemCandidateSet(selected),
    })
    expect(selectedDesignMarkdownBinding(snapshot, document)).toMatchObject({
      candidateSetId: 'set:1',
      candidateId: selected.set.candidates[0]!.id,
      materialId: markdownMaterialId,
      revisionId: 'material-revision:1',
      content: artifact.designMarkdown,
    })
  })

  it('recovers a historical singular Design System as one selected candidate', () => {
    const recovered = recoverPrototypeDesignSystemCandidateSet(null, artifact)
    expect(recovered?.set.proposal.count).toBe(1)
    expect(recovered?.set.selection?.actor.kind).toBe('agent')
    expect(selectedPrototypeDesignSystem(recovered)?.name).toBe('Quiet editorial')
  })

  it('retains completed siblings when another candidate is cancelled', () => {
    let state = createPrototypeDesignSystemCandidateSet({ plan, baseRevisionId: 'revision:1', id: 'set:partial' })
    state = updatePrototypeDesignSystemCandidate(state, state.set.candidates[0]!.id, {
      status: 'ready',
      artifact,
    })
    state = updatePrototypeDesignSystemCandidate(state, state.set.candidates[1]!.id, {
      status: 'cancelled',
    })
    expect(state.set.candidates.map((candidate) => candidate.status)).toEqual(['ready', 'cancelled'])
    expect(state.artifacts[state.set.candidates[0]!.id]).toBe(artifact)
    expect(recoverPrototypeDesignSystemCandidateSet(
      persistPrototypeDesignSystemCandidateSet(state),
    )?.set.candidates.map((candidate) => candidate.status)).toEqual(['ready', 'cancelled'])
  })
})
