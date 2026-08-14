import {
  classifyGenerationError,
  isGenerationTimeoutFailure,
} from './generation-error'

export type ImageRouteOperation = 'image-generation' | 'image-edit'

export interface ImageRouteHealthKey {
  readonly providerId: string
  readonly model: string
  readonly operation: ImageRouteOperation
}

export type ImageRouteHealthOutcome =
  | 'success'
  | 'timeout'
  | 'transient-failure'
  | 'terminal-failure'
  | 'cancelled'

export interface ImageRouteHealthSample {
  readonly outcome: ImageRouteHealthOutcome
  readonly latencyMs: number
}

export interface ImageRouteHealthSnapshot {
  readonly route: ImageRouteHealthKey
  readonly circuit: 'closed' | 'open' | 'half-open'
  readonly consecutiveTimeouts: number
  readonly samples: readonly ImageRouteHealthSample[]
}

export interface ImageRouteHealthRegistryOptions {
  readonly maximumRoutes?: number
  readonly sampleLimit?: number
  readonly timeoutThreshold?: number
  readonly circuitCooldownMs?: number
  readonly maximumLatencyMs?: number
  readonly now?: () => number
}

interface RouteHealthState {
  readonly route: ImageRouteHealthKey
  readonly samples: ImageRouteHealthSample[]
  circuit: ImageRouteHealthSnapshot['circuit']
  consecutiveTimeouts: number
  openedAt: number | undefined
  probeInFlight: boolean
}

interface ImageRouteHealthAttempt {
  readonly state: RouteHealthState
  readonly startedAt: number
  readonly probe: boolean
  completed: boolean
}

const DEFAULT_MAXIMUM_ROUTES = 32
const DEFAULT_SAMPLE_LIMIT = 12
const DEFAULT_TIMEOUT_THRESHOLD = 2
const DEFAULT_CIRCUIT_COOLDOWN_MS = 30_000
// The desktop image owner settles after the native 300-second transport owner.
const DEFAULT_MAXIMUM_LATENCY_MS = 315_000

export class ImageRouteCircuitOpenError extends Error {
  constructor() {
    super('Bulk image production paused after repeated timeouts on the selected exact Provider route.')
    this.name = 'ImageRouteCircuitOpenError'
  }
}

export class ImageRouteHealthRegistry {
  readonly #maximumRoutes: number
  readonly #sampleLimit: number
  readonly #timeoutThreshold: number
  readonly #circuitCooldownMs: number
  readonly #maximumLatencyMs: number
  readonly #now: () => number
  readonly #states = new Map<string, RouteHealthState>()

  constructor(options: ImageRouteHealthRegistryOptions = {}) {
    this.#maximumRoutes = positiveInteger(options.maximumRoutes, DEFAULT_MAXIMUM_ROUTES)
    this.#sampleLimit = positiveInteger(options.sampleLimit, DEFAULT_SAMPLE_LIMIT)
    this.#timeoutThreshold = positiveInteger(
      options.timeoutThreshold,
      DEFAULT_TIMEOUT_THRESHOLD,
    )
    this.#circuitCooldownMs = positiveNumber(
      options.circuitCooldownMs,
      DEFAULT_CIRCUIT_COOLDOWN_MS,
    )
    this.#maximumLatencyMs = positiveNumber(
      options.maximumLatencyMs,
      DEFAULT_MAXIMUM_LATENCY_MS,
    )
    this.#now = options.now ?? Date.now
  }

  async run<T>(route: ImageRouteHealthKey, operation: () => Promise<T>): Promise<T> {
    const attempt = this.#begin(route)
    try {
      const result = await operation()
      this.#complete(attempt, 'success')
      return result
    } catch (error) {
      this.#complete(attempt, imageRouteHealthOutcomeForError(error))
      throw error
    }
  }

  snapshot(route: ImageRouteHealthKey): ImageRouteHealthSnapshot | undefined {
    const state = this.#states.get(routeKey(route))
    return state ? projectSnapshot(state) : undefined
  }

  snapshots(): readonly ImageRouteHealthSnapshot[] {
    return [...this.#states.values()].map(projectSnapshot)
  }

  /**
   * A catalog-verified route is still cold until one real execution settles.
   * Keep cold or recently pressured routes to one paid request while allowing
   * an independently healthy exact route to use the caller's full ceiling.
   */
  admissionLimit(route: ImageRouteHealthKey, maximumConcurrency: number): number {
    const maximum = positiveInteger(maximumConcurrency, 1)
    const state = this.#states.get(routeKey(route))
    // An open circuit rejects synchronously before starting paid work, so let
    // the scheduler drain queued claims instead of leaving them parked behind
    // an already-known failure. Half-open remains a single recovery probe.
    if (state?.circuit === 'open') return maximum
    if (!state || state.circuit !== 'closed' || state.samples.length === 0) return 1
    return state.samples.at(-1)?.outcome === 'success' ? maximum : 1
  }

  /**
   * Preserve caller ordering among equally healthy exact routes, but move a
   * recently failed route behind healthy or cold alternatives before its
   * circuit fully opens. If every candidate is equally degraded, the first
   * remains eligible for bounded retry or cooldown-probe ownership.
   */
  prefer<T extends ImageRouteHealthKey>(routes: readonly T[]): T | undefined {
    const unique = new Map<string, { readonly route: T; readonly index: number }>()
    routes.forEach((route, index) => {
      const key = routeKey(route)
      if (!unique.has(key)) unique.set(key, { route, index })
    })
    return [...unique.values()].sort((left, right) =>
      circuitRank(this.#states.get(routeKey(left.route)))
      - circuitRank(this.#states.get(routeKey(right.route)))
      || left.index - right.index,
    )[0]?.route
  }

  #begin(route: ImageRouteHealthKey): ImageRouteHealthAttempt {
    const state = this.#state(route)
    const now = this.#now()
    let probe = false
    if (state.circuit === 'open') {
      if (state.openedAt === undefined || now - state.openedAt < this.#circuitCooldownMs) {
        throw new ImageRouteCircuitOpenError()
      }
      state.circuit = 'half-open'
      state.probeInFlight = true
      probe = true
    } else if (state.circuit === 'half-open') {
      throw new ImageRouteCircuitOpenError()
    }
    return { state, startedAt: now, probe, completed: false }
  }

  #complete(attempt: ImageRouteHealthAttempt, outcome: ImageRouteHealthOutcome): void {
    if (attempt.completed) throw new Error('Image route health attempt already settled.')
    attempt.completed = true
    const latencyMs = Math.min(
      this.#maximumLatencyMs,
      Math.max(0, Math.round(this.#now() - attempt.startedAt)),
    )
    attempt.state.samples.push({ outcome, latencyMs })
    if (attempt.state.samples.length > this.#sampleLimit) attempt.state.samples.shift()

    if (outcome === 'timeout') {
      attempt.state.consecutiveTimeouts += 1
      if (
        attempt.probe
        || attempt.state.consecutiveTimeouts >= this.#timeoutThreshold
      ) {
        attempt.state.circuit = 'open'
        attempt.state.openedAt = this.#now()
        attempt.state.probeInFlight = false
      }
      return
    }

    if (attempt.probe) {
      if (outcome !== 'success') {
        attempt.state.circuit = 'open'
        attempt.state.openedAt = this.#now()
        attempt.state.probeInFlight = false
        return
      }
    } else if (attempt.state.circuit !== 'closed' && outcome !== 'success') {
      // A late failure from work admitted before the circuit opened is not
      // recovery evidence. Only a successful paid result or probe may close it.
      return
    }

    if (outcome !== 'cancelled' || attempt.state.circuit === 'closed') {
      attempt.state.circuit = 'closed'
      attempt.state.openedAt = undefined
      attempt.state.probeInFlight = false
      attempt.state.consecutiveTimeouts = 0
    }
  }

  #state(route: ImageRouteHealthKey): RouteHealthState {
    const key = routeKey(route)
    const existing = this.#states.get(key)
    if (existing) {
      this.#states.delete(key)
      this.#states.set(key, existing)
      return existing
    }
    if (this.#states.size >= this.#maximumRoutes) {
      const oldest = this.#states.keys().next().value as string | undefined
      if (oldest !== undefined) this.#states.delete(oldest)
    }
    const state: RouteHealthState = {
      route: { ...route },
      samples: [],
      circuit: 'closed',
      consecutiveTimeouts: 0,
      openedAt: undefined,
      probeInFlight: false,
    }
    this.#states.set(key, state)
    return state
  }
}

export function createImageRouteHealthRegistry(
  options: ImageRouteHealthRegistryOptions = {},
): ImageRouteHealthRegistry {
  return new ImageRouteHealthRegistry(options)
}

export function imageRouteHealthOutcomeForError(error: unknown): ImageRouteHealthOutcome {
  const message = error instanceof Error ? error.message : String(error)
  const classification = classifyGenerationError(message)
  if (classification.kind === 'cancelled') return 'cancelled'
  if (isGenerationTimeoutFailure(message)) return 'timeout'
  return classification.kind === 'transient' ? 'transient-failure' : 'terminal-failure'
}

function projectSnapshot(state: RouteHealthState): ImageRouteHealthSnapshot {
  return {
    route: { ...state.route },
    circuit: state.circuit,
    consecutiveTimeouts: state.consecutiveTimeouts,
    samples: state.samples.map((sample) => ({ ...sample })),
  }
}

function routeKey(route: ImageRouteHealthKey): string {
  return JSON.stringify([route.providerId, route.model, route.operation])
}

function circuitRank(state: RouteHealthState | undefined): number {
  if (!state) return 0
  if (state.circuit === 'open') return 3
  if (state.circuit === 'half-open') return 2
  const latest = state.samples.at(-1)
  return !latest || latest.outcome === 'success' ? 0 : 1
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && value !== undefined && value > 0 ? value : fallback
}

function positiveNumber(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value !== undefined && value > 0 ? value : fallback
}
