import {
  createAsyncLimiter,
  forEachConcurrent,
  type AsyncLimiter,
} from '@/lib/async-pool'
import type {
  ImageRouteHealthKey,
  ImageRouteHealthRegistry,
} from '@/services/ai/image-route-health'

export interface PrototypeProductionScheduler {
  /** Shared by page, direct-asset, board, and same-Provider review calls. */
  readonly scheduleImage: AsyncLimiter
  /** Stable suite lanes are served round-robin under the shared image ceiling. */
  readonly imageLane: (laneId: string, route?: ImageRouteHealthKey) => AsyncLimiter
  /** Same-Provider non-image work shares the ceiling without changing image-route health. */
  readonly providerLane: (laneId: string) => AsyncLimiter
  /** Asset Production snapshots currently have one revisioned publication owner. */
  readonly scheduleAssetProduction: AsyncLimiter
}

export interface PrototypeProductionSchedulerOptions {
  /** Terminal route failures close queued work without cancelling paid calls already in flight. */
  readonly stopQueuedImageWorkAfter?: (error: unknown) => boolean
  /** Transient route pressure lowers future concurrency while preserving independent queued work. */
  readonly reduceImageConcurrencyAfter?: (error: unknown) => boolean
  /** Process-local exact-route health shared by fresh schedulers on Retry continuations. */
  readonly imageRouteHealth?: ImageRouteHealthRegistry
}

const IMAGE_SUCCESSES_PER_CONCURRENCY_RECOVERY = 2

interface QueuedImageWork<T = unknown> {
  readonly run: () => Promise<T>
  readonly route?: ImageRouteHealthKey
  readonly affectsImageHealth: boolean
  readonly resolve: (value: T) => void
  readonly reject: (error: unknown) => void
}

export function createPrototypeProductionScheduler(
  imageConcurrency: number,
  options: PrototypeProductionSchedulerOptions = {},
): PrototypeProductionScheduler {
  const requested = Number.isFinite(imageConcurrency) ? Math.floor(imageConcurrency) : 1
  const maximumImageConcurrency = Math.max(1, requested)
  let currentImageConcurrency = maximumImageConcurrency
  let successfulImageWorkSincePressure = 0
  const imageQueues = new Map<string, QueuedImageWork[]>()
  const readyLanes: string[] = []
  let activeImageWork = 0
  const activeRouteWork: ImageRouteHealthKey[] = []
  let imageCircuitFailure: unknown

  const routeActiveCount = (route: ImageRouteHealthKey): number =>
    activeRouteWork.filter((active) =>
      active.providerId === route.providerId
      && active.model === route.model
      && active.operation === route.operation,
    ).length

  const canRunImageWork = (work: QueuedImageWork): boolean => {
    if (!work.route || !options.imageRouteHealth) return true
    return routeActiveCount(work.route) < options.imageRouteHealth.admissionLimit(
      work.route,
      currentImageConcurrency,
    )
  }

  const runImageWork = (work: QueuedImageWork): void => {
    activeImageWork += 1
    if (work.route) activeRouteWork.push(work.route)
    void (async () => {
      if (imageCircuitFailure !== undefined) throw imageCircuitFailure
      try {
        const result = work.route && options.imageRouteHealth
          ? await options.imageRouteHealth.run(work.route, work.run)
          : await work.run()
        if (
          work.affectsImageHealth
          &&
          imageCircuitFailure === undefined
          && currentImageConcurrency < maximumImageConcurrency
        ) {
          successfulImageWorkSincePressure += 1
          if (
            successfulImageWorkSincePressure
            >= IMAGE_SUCCESSES_PER_CONCURRENCY_RECOVERY
          ) {
            currentImageConcurrency += 1
            successfulImageWorkSincePressure = 0
          }
        }
        return result
      } catch (error) {
        if (work.affectsImageHealth) successfulImageWorkSincePressure = 0
        if (work.affectsImageHealth && options.stopQueuedImageWorkAfter?.(error)) {
          imageCircuitFailure ??= error
        } else if (
          work.affectsImageHealth
          &&
          currentImageConcurrency > 1
          && options.reduceImageConcurrencyAfter?.(error)
        ) {
          currentImageConcurrency -= 1
        }
        throw error
      }
    })().then(work.resolve, work.reject).finally(() => {
      activeImageWork -= 1
      if (work.route) {
        const routeIndex = activeRouteWork.findIndex((active) =>
          active.providerId === work.route!.providerId
          && active.model === work.route!.model
          && active.operation === work.route!.operation,
        )
        if (routeIndex >= 0) activeRouteWork.splice(routeIndex, 1)
      }
      pumpImages()
    })
  }

  function takeRunnableImageWork(): QueuedImageWork | undefined {
    const lanesToInspect = readyLanes.length
    for (let index = 0; index < lanesToInspect; index += 1) {
      const laneId = readyLanes.shift()!
      const queue = imageQueues.get(laneId)!
      const work = queue[0]!
      if (!canRunImageWork(work)) {
        readyLanes.push(laneId)
        continue
      }
      queue.shift()
      if (queue.length > 0) readyLanes.push(laneId)
      else imageQueues.delete(laneId)
      return work
    }
    return undefined
  }

  function pumpImages(): void {
    while (activeImageWork < currentImageConcurrency && readyLanes.length > 0) {
      const work = takeRunnableImageWork()
      if (!work) break
      runImageWork(work)
    }
  }

  const enqueueImage = <T>(
    laneId: string,
    run: () => Promise<T>,
    route?: ImageRouteHealthKey,
    affectsImageHealth = true,
  ): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const queue = imageQueues.get(laneId)
      const work: QueuedImageWork<T> = {
        run,
        ...(route ? { route } : {}),
        affectsImageHealth,
        resolve,
        reject,
      }
      if (queue) {
        queue.push(work as QueuedImageWork)
      } else {
        imageQueues.set(laneId, [work as QueuedImageWork])
        readyLanes.push(laneId)
      }
      pumpImages()
    })

  const imageLane = (laneId: string, route?: ImageRouteHealthKey): AsyncLimiter => {
    const stableLaneId = laneId.trim() || 'shared'
    return (run) => enqueueImage(stableLaneId, run, route)
  }

  return {
    scheduleImage: imageLane('shared'),
    imageLane,
    providerLane: (laneId) => {
      const stableLaneId = laneId.trim() || 'shared-provider'
      return (run) => enqueueImage(stableLaneId, run, undefined, false)
    },
    scheduleAssetProduction: createAsyncLimiter(1),
  }
}

/** One deterministic bounded owner for every image-producing production item. */
export async function schedulePrototypeProductionWork<Work>(input: {
  readonly work: readonly Work[]
  readonly concurrency: number
  readonly run: (work: Work, index: number) => Promise<void>
}): Promise<void> {
  await forEachConcurrent(input.work, input.concurrency, input.run)
}

/** Stable round-robin lane merge prevents either work class from sitting behind a full phase. */
export function interleavePrototypeProductionWork<Work>(
  ...lanes: readonly (readonly Work[])[]
): Work[] {
  const work: Work[] = []
  const maximum = Math.max(0, ...lanes.map((lane) => lane.length))
  for (let index = 0; index < maximum; index += 1) {
    for (const lane of lanes) {
      const item = lane[index]
      if (item !== undefined) work.push(item)
    }
  }
  return work
}
