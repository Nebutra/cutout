import { describe, expect, it } from 'vitest'
import {
  projectPrototypeDeliveryProgress,
  updatePrototypeDeliveryObservation,
} from './delivery-progress'

describe('prototype delivery progress', () => {
  it('keeps counts monotonic and exposes retry-preserved work separately', () => {
    const first = updatePrototypeDeliveryObservation({
      update: { completedPages: 3, totalPages: 6, completedResources: 2, totalResources: 8 },
      at: 1_000,
    })
    const retry = updatePrototypeDeliveryObservation({
      previous: first,
      update: { completedPages: 1, completedResources: 0, retryPreservedNodes: 5 },
      at: 2_000,
    })
    const projected = projectPrototypeDeliveryProgress({
      status: 'generating', observation: retry, now: 2_000,
    })

    expect(retry).toMatchObject({ completedPages: 3, completedResources: 2 })
    expect(projected).toMatchObject({
      completedNodes: 5,
      totalNodes: 14,
      completed: 0,
      active: 1,
      queued: 8,
      failed: 0,
      retryPreserved: 5,
      estimate: { state: 'collecting' },
    })
  })

  it('requires two observed completions before returning a conservative range', () => {
    let observation = updatePrototypeDeliveryObservation({
      update: { completedPages: 0, totalPages: 4, completedResources: 0, totalResources: 4 },
      at: 0,
    })
    observation = updatePrototypeDeliveryObservation({
      previous: observation, update: { completedPages: 1 }, at: 1_000,
    })
    expect(projectPrototypeDeliveryProgress({
      status: 'generating', observation, now: 1_000,
    }).estimate).toEqual({ state: 'collecting' })

    observation = updatePrototypeDeliveryObservation({
      previous: observation, update: { completedPages: 2 }, at: 2_000,
    })
    const estimate = projectPrototypeDeliveryProgress({
      status: 'generating', observation, now: 2_000,
    }).estimate
    expect(estimate).toMatchObject({ state: 'bounded' })
    if (estimate.state !== 'bounded') throw new Error('Expected a bounded estimate.')
    expect(estimate.lowerMs).toBeGreaterThan(0)
    expect(estimate.upperMs).toBeGreaterThanOrEqual(estimate.lowerMs)
  })

  it('uses unavailable for unresolved, ready, and failed graphs without false precision', () => {
    expect(projectPrototypeDeliveryProgress({ status: 'planned', now: 0 }).estimate)
      .toEqual({ state: 'unavailable' })
    const observation = updatePrototypeDeliveryObservation({
      update: { completedPages: 2, totalPages: 2, completedResources: 1, totalResources: 1 },
      at: 0,
    })
    expect(projectPrototypeDeliveryProgress({ status: 'ready', observation, now: 10_000 }).estimate)
      .toEqual({ state: 'unavailable' })
    expect(projectPrototypeDeliveryProgress({ status: 'failed', observation, now: 10_000 }).estimate)
      .toEqual({ state: 'unavailable' })
  })

  it('projects live page generation, review, rejection, and retry stages', () => {
    let observation = updatePrototypeDeliveryObservation({
      update: { totalPages: 3, pageProgress: { pageId: 'home', stage: 'reviewing', attempt: 1 } },
      at: 0,
    })
    observation = updatePrototypeDeliveryObservation({
      previous: observation,
      update: { pageProgress: { pageId: 'catalog', stage: 'rejected', attempt: 1 } },
      at: 1,
    })
    observation = updatePrototypeDeliveryObservation({
      previous: observation,
      update: { pageProgress: { pageId: 'catalog', stage: 'retrying', attempt: 2 } },
      at: 2,
    })
    const projected = projectPrototypeDeliveryProgress({
      status: 'generating', observation, now: 2,
    })

    expect(projected).toMatchObject({
      generatingPages: 0,
      generatedPages: 2,
      reviewingPages: 1,
      rejectedPages: 0,
      retryingPages: 1,
    })
  })

  it('projects a pre-settlement page as active without reporting generation or completion', () => {
    const observation = updatePrototypeDeliveryObservation({
      update: {
        totalPages: 2,
        pageProgress: { pageId: 'home', stage: 'generating', attempt: 1 },
      },
      at: 0,
    })

    expect(projectPrototypeDeliveryProgress({
      status: 'generating',
      observation,
      now: 1,
    })).toMatchObject({
      completedNodes: 0,
      completed: 0,
      active: 1,
      queued: 1,
      generatingPages: 1,
      generatedPages: 0,
      reviewingPages: 0,
    })
  })

  it('rejects negative values and completion beyond the graph', () => {
    expect(() => updatePrototypeDeliveryObservation({
      update: { completedPages: -1 }, at: 0,
    })).toThrow(/non-negative/i)
    expect(() => updatePrototypeDeliveryObservation({
      update: { completedPages: 2, totalPages: 1 }, at: 0,
    })).toThrow(/cannot exceed/i)
    expect(() => updatePrototypeDeliveryObservation({
      update: { pageProgress: { pageId: '', stage: 'generated', attempt: 0 } }, at: 0,
    })).toThrow(/page id and positive attempt/i)
  })
})
