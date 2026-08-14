import { classifyGenerationError } from './generation-error'
import type { ModelAssignment } from './model-assignment-types'

export interface TextRouteHealthSample {
  readonly outcome: 'success' | 'transient-failure' | 'terminal-failure' | 'cancelled'
  readonly latencyMs: number
}

export interface TextRouteHealthSnapshot {
  readonly route: Pick<ModelAssignment, 'providerId' | 'model'>
  readonly samples: readonly TextRouteHealthSample[]
}

export interface TextRouteHealthRegistryOptions {
  readonly maximumRoutes?: number
  readonly sampleLimit?: number
  readonly maximumLatencyMs?: number
  readonly now?: () => number
}

interface TextRouteHealthState {
  readonly route: Pick<ModelAssignment, 'providerId' | 'model'>
  readonly samples: TextRouteHealthSample[]
}

const DEFAULT_MAXIMUM_ROUTES = 32
const DEFAULT_SAMPLE_LIMIT = 12
const DEFAULT_MAXIMUM_LATENCY_MS = 315_000

export class TextRouteHealthRegistry {
  readonly #maximumRoutes: number
  readonly #sampleLimit: number
  readonly #maximumLatencyMs: number
  readonly #now: () => number
  readonly #states = new Map<string, TextRouteHealthState>()

  constructor(options: TextRouteHealthRegistryOptions = {}) {
    this.#maximumRoutes = positiveInteger(options.maximumRoutes, DEFAULT_MAXIMUM_ROUTES)
    this.#sampleLimit = positiveInteger(options.sampleLimit, DEFAULT_SAMPLE_LIMIT)
    this.#maximumLatencyMs = positiveNumber(
      options.maximumLatencyMs,
      DEFAULT_MAXIMUM_LATENCY_MS,
    )
    this.#now = options.now ?? Date.now
  }

  async run<T>(route: ModelAssignment, operation: () => Promise<T>): Promise<T> {
    const startedAt = this.#now()
    try {
      const result = await operation()
      this.#record(route, 'success', startedAt)
      return result
    } catch (error) {
      const classification = classifyGenerationError(
        error instanceof Error ? error.message : String(error),
      )
      this.#record(
        route,
        classification.kind === 'cancelled'
          ? 'cancelled'
          : classification.kind === 'transient'
            ? 'transient-failure'
            : 'terminal-failure',
        startedAt,
      )
      throw error
    }
  }

  /**
   * Cold routes remain eligible for one real turn. A recently successful route
   * stays first, while transiently pressured routes move behind healthy and
   * cold alternatives without turning catalog discovery into readiness proof.
   */
  prefer<T extends ModelAssignment>(routes: readonly T[]): readonly T[] {
    const unique = new Map<string, { readonly route: T; readonly index: number }>()
    routes.forEach((route, index) => {
      const key = routeKey(route)
      if (!unique.has(key)) unique.set(key, { route, index })
    })
    return [...unique.values()]
      .sort((left, right) =>
        routeRank(this.#states.get(routeKey(left.route)))
        - routeRank(this.#states.get(routeKey(right.route)))
        || left.index - right.index)
      .map(({ route }) => route)
  }

  snapshot(route: ModelAssignment): TextRouteHealthSnapshot | undefined {
    const state = this.#states.get(routeKey(route))
    return state ? projectSnapshot(state) : undefined
  }

  snapshots(): readonly TextRouteHealthSnapshot[] {
    return [...this.#states.values()].map(projectSnapshot)
  }

  #record(
    route: ModelAssignment,
    outcome: TextRouteHealthSample['outcome'],
    startedAt: number,
  ): void {
    const state = this.#state(route)
    state.samples.push({
      outcome,
      latencyMs: Math.min(
        this.#maximumLatencyMs,
        Math.max(0, Math.round(this.#now() - startedAt)),
      ),
    })
    if (state.samples.length > this.#sampleLimit) state.samples.shift()
  }

  #state(route: ModelAssignment): TextRouteHealthState {
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
    const state: TextRouteHealthState = {
      route: { providerId: route.providerId, model: route.model },
      samples: [],
    }
    this.#states.set(key, state)
    return state
  }
}

export function createTextRouteHealthRegistry(
  options: TextRouteHealthRegistryOptions = {},
): TextRouteHealthRegistry {
  return new TextRouteHealthRegistry(options)
}

export function shouldFailOverTextRoute(error: unknown): boolean {
  const classification = classifyGenerationError(
    error instanceof Error ? error.message : String(error),
  )
  return classification.kind === 'transient'
}

function routeKey(route: Pick<ModelAssignment, 'providerId' | 'model'>): string {
  return JSON.stringify([route.providerId, route.model])
}

function routeRank(state: TextRouteHealthState | undefined): number {
  const latest = state?.samples.at(-1)?.outcome
  if (latest === 'success') return 0
  if (latest === undefined) return 1
  if (latest === 'transient-failure') return 2
  return 3
}

function projectSnapshot(state: TextRouteHealthState): TextRouteHealthSnapshot {
  return {
    route: { ...state.route },
    samples: state.samples.map((sample) => ({ ...sample })),
  }
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && value !== undefined && value > 0 ? value : fallback
}

function positiveNumber(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value !== undefined && value > 0 ? value : fallback
}
