export type PrototypeDeliveryCandidateStatus =
  | 'planned'
  | 'generating'
  | 'ready'
  | 'failed'
  | 'cancelled'

export interface PrototypeDeliveryCompletionSample {
  readonly completedNodes: number
  readonly at: number
}

export type PrototypeDeliveryPageStage =
  | 'generating'
  | 'generated'
  | 'reviewing'
  | 'accepted'
  | 'rejected'
  | 'retrying'

export interface PrototypeDeliveryPageProgress {
  readonly pageId: string
  readonly stage: PrototypeDeliveryPageStage
  readonly attempt: number
}

export interface PrototypeDeliveryObservation {
  readonly completedPages: number
  readonly totalPages: number
  readonly completedResources: number
  readonly totalResources: number
  readonly firstObservedAt: number
  readonly completionSamples: readonly PrototypeDeliveryCompletionSample[]
  readonly retryPreservedNodes: number
  readonly pageProgress: Readonly<Record<string, PrototypeDeliveryPageProgress>>
}

export interface PrototypeDeliveryProgress {
  readonly completedNodes: number
  readonly totalNodes: number
  readonly completed: number
  readonly active: number
  readonly queued: number
  readonly failed: number
  readonly retryPreserved: number
  readonly generatingPages: number
  readonly generatedPages: number
  readonly reviewingPages: number
  readonly rejectedPages: number
  readonly retryingPages: number
  readonly estimate:
    | { readonly state: 'unavailable' }
    | { readonly state: 'collecting' }
    | { readonly state: 'bounded'; readonly lowerMs: number; readonly upperMs: number }
}

export function updatePrototypeDeliveryObservation(input: {
  readonly previous?: PrototypeDeliveryObservation
  readonly update: Partial<Pick<
    PrototypeDeliveryObservation,
    'completedPages' | 'totalPages' | 'completedResources' | 'totalResources' | 'retryPreservedNodes'
  >> & { readonly pageProgress?: PrototypeDeliveryPageProgress }
  readonly at: number
}): PrototypeDeliveryObservation {
  const previous = input.previous
  const completedPages = monotonic(input.update.completedPages, previous?.completedPages ?? 0)
  const totalPages = monotonic(input.update.totalPages, previous?.totalPages ?? 0)
  const completedResources = monotonic(
    input.update.completedResources,
    previous?.completedResources ?? 0,
  )
  const totalResources = monotonic(input.update.totalResources, previous?.totalResources ?? 0)
  if (completedPages > totalPages || completedResources > totalResources) {
    throw new Error('Prototype delivery completion cannot exceed its resolved graph.')
  }
  const completedNodes = completedPages + completedResources
  const previousCompleted = (previous?.completedPages ?? 0) + (previous?.completedResources ?? 0)
  const retryPreservedNodes = Math.min(
    completedNodes,
    monotonic(input.update.retryPreservedNodes, previous?.retryPreservedNodes ?? 0),
  )
  const completionSamples = previous ? [...previous.completionSamples] : []
  if (previous && completedNodes > previousCompleted) {
    completionSamples.push({ completedNodes, at: input.at })
  }
  const pageProgress = { ...(previous?.pageProgress ?? {}) }
  if (input.update.pageProgress) {
    const update = input.update.pageProgress
    if (
      !update.pageId.trim()
      || !Number.isSafeInteger(update.attempt)
      || update.attempt < 1
    ) {
      throw new Error('Prototype page progress requires a page id and positive attempt.')
    }
    pageProgress[update.pageId] = { ...update }
  }
  return {
    completedPages,
    totalPages,
    completedResources,
    totalResources,
    firstObservedAt: previous?.firstObservedAt ?? input.at,
    completionSamples: completionSamples.slice(-64),
    retryPreservedNodes,
    pageProgress,
  }
}

export function projectPrototypeDeliveryProgress(input: {
  readonly status: PrototypeDeliveryCandidateStatus
  readonly observation?: PrototypeDeliveryObservation
  readonly now: number
}): PrototypeDeliveryProgress {
  const observation = input.observation
  const completedNodes = observation
    ? observation.completedPages + observation.completedResources
    : 0
  const totalNodes = observation ? observation.totalPages + observation.totalResources : 0
  const remaining = Math.max(0, totalNodes - completedNodes)
  const retryPreserved = Math.min(completedNodes, observation?.retryPreservedNodes ?? 0)
  const pageProgress = Object.values(observation?.pageProgress ?? {})
  const generatingPages = pageProgress.filter(({ stage }) => stage === 'generating').length
  const activePageCount = pageProgress.filter(({ stage }) =>
    stage === 'generating' || stage === 'reviewing' || stage === 'retrying').length
  const active = input.status === 'generating' && remaining > 0
    ? Math.min(remaining, Math.max(1, activePageCount))
    : 0
  const failed = input.status === 'failed' ? remaining : 0
  const queued = input.status === 'planned' || input.status === 'cancelled'
    ? remaining
    : Math.max(0, remaining - active - failed)

  return {
    completedNodes,
    totalNodes,
    completed: completedNodes - retryPreserved,
    active,
    queued,
    failed,
    retryPreserved,
    generatingPages,
    // A later attempt can be generating only after a prior image was rejected.
    generatedPages: pageProgress.filter(({ stage, attempt }) =>
      stage !== 'generating' || attempt > 1).length,
    reviewingPages: pageProgress.filter(({ stage }) => stage === 'reviewing').length,
    rejectedPages: pageProgress.filter(({ stage }) => stage === 'rejected').length,
    retryingPages: pageProgress.filter(({ stage }) => stage === 'retrying').length,
    estimate: estimate(input.status, observation, remaining, input.now),
  }
}

function estimate(
  status: PrototypeDeliveryCandidateStatus,
  observation: PrototypeDeliveryObservation | undefined,
  remaining: number,
  now: number,
): PrototypeDeliveryProgress['estimate'] {
  if (status !== 'generating' || !observation || observation.totalPages + observation.totalResources === 0) {
    return { state: 'unavailable' }
  }
  if (remaining === 0) return { state: 'unavailable' }
  const samples = observation.completionSamples
  if (samples.length < 2) return { state: 'collecting' }
  const last = samples.at(-1)!
  const elapsed = Math.max(last.at - observation.firstObservedAt, now - observation.firstObservedAt)
  const observedNodes = last.completedNodes - observation.retryPreservedNodes
  if (elapsed <= 0 || observedNodes < 2) return { state: 'collecting' }
  const averageMs = elapsed / observedNodes
  const lowerMs = Math.max(1_000, Math.ceil(remaining * averageMs * 0.75))
  const upperMs = Math.max(lowerMs, Math.ceil(remaining * averageMs * 1.5))
  return { state: 'bounded', lowerMs, upperMs }
}

function monotonic(next: number | undefined, previous: number): number {
  if (next === undefined) return previous
  if (!Number.isSafeInteger(next) || next < 0) {
    throw new Error('Prototype delivery progress requires non-negative safe integers.')
  }
  return Math.max(previous, next)
}
