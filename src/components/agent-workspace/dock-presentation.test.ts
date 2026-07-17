import { describe, expect, it } from 'vitest'
import type { AgentWorkspaceViewModel } from './agent-view-model'
import { deriveDockPresentation } from './dock-presentation'

const draftModel: AgentWorkspaceViewModel = {
  summary: {
    status: 'draft',
    title: 'Describe the result you need',
    detail: 'The Agent will plan and execute against a visible outcome checklist.',
    intent: null,
    elapsedLabel: null,
  },
  feed: [],
  checklist: [],
  costNotice: '自动执行付费模型，费用以提供商为准',
}

describe('deriveDockPresentation', () => {
  it('collapses a fact-free draft to the composer instead of reserving empty panels', () => {
    expect(deriveDockPresentation(draftModel, { hasIntervention: false })).toEqual({
      mode: 'empty',
      showOverview: false,
      showFeed: false,
      showChecklist: false,
      showIntervention: false,
      showControls: false,
    })
  })

  it('keeps capability notices visible even when the run summary is still draft', () => {
    const presentation = deriveDockPresentation({
      ...draftModel,
      feed: [{
        id: 'runtime:notice:0',
        type: 'notice',
        status: 'complete',
        title: 'Capability fallback',
        detail: 'Web search is unavailable; continuing without grounding.',
        provenance: 'runtime',
      }],
    }, { hasIntervention: false })

    expect(presentation.mode).toBe('empty')
    expect(presentation.showFeed).toBe(true)
    expect(presentation.showOverview).toBe(false)
  })

  it('classifies a running agent as active and shows factual run context', () => {
    const presentation = deriveDockPresentation({
      ...draftModel,
      summary: { ...draftModel.summary, status: 'running' },
      feed: [{
        id: 'stage:planning',
        type: 'stage',
        status: 'running',
        title: 'Creating Plan',
        detail: 'Mapping the requested outcomes.',
        provenance: 'runtime',
      }],
    }, { hasIntervention: false })

    expect(presentation).toMatchObject({
      mode: 'active',
      showOverview: true,
      showFeed: true,
      showControls: true,
    })
  })

  it('shows outcome evidence for a delivered result without retaining an empty feed', () => {
    const presentation = deriveDockPresentation({
      ...draftModel,
      summary: { ...draftModel.summary, status: 'ready' },
      checklist: [{
        id: 'prototype-page',
        label: 'Prototype pages',
        status: 'complete',
        completedCount: 2,
        requiredCount: 2,
        detail: '2 of 2 verified',
      }],
    }, { hasIntervention: false })

    expect(presentation).toMatchObject({
      mode: 'result',
      showOverview: false,
      showFeed: false,
      showChecklist: true,
      showControls: false,
    })
  })

  it('keeps errors, evidence, and repair controls visible after a stopped run', () => {
    const presentation = deriveDockPresentation({
      ...draftModel,
      summary: { ...draftModel.summary, status: 'stopped' },
      feed: [{
        id: 'runtime:error',
        type: 'error',
        status: 'stopped',
        title: 'Run stopped',
        detail: 'Provider timed out.',
        provenance: 'runtime',
      }],
      checklist: [{
        id: 'prototype-page',
        label: 'Prototype pages',
        status: 'missing',
        completedCount: 1,
        requiredCount: 2,
        detail: '1 of 2 verified; 1 remaining',
      }],
    }, { hasIntervention: false })

    expect(presentation).toEqual({
      mode: 'repair',
      showOverview: false,
      showFeed: true,
      showChecklist: true,
      showIntervention: false,
      showControls: true,
    })
  })

  it('keeps overview and activity context around a human-loop intervention', () => {
    const presentation = deriveDockPresentation(draftModel, { hasIntervention: true })

    expect(presentation).toEqual({
      mode: 'active',
      showOverview: true,
      showFeed: true,
      showChecklist: false,
      showIntervention: true,
      showControls: true,
    })
  })
})
