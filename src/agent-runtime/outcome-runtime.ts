export type MaterialKind =
  | 'design-system'
  | 'prototype-page'
  | 'cutout-slice'
  | 'design-markdown'

export interface OutcomeRequirement {
  readonly kind: MaterialKind
  readonly minCount: number
  readonly label: string
  /** Stable evidence identities required for intent-specific completion. */
  readonly expectedKeys?: readonly string[]
}

/** The user-facing definition of done for one agent session. */
export interface OutcomeContract {
  readonly id: string
  readonly intent: string
  readonly requirements: readonly OutcomeRequirement[]
}

/** A durable, inspectable result produced by an agent or deterministic tool. */
export interface MaterialEvidence {
  readonly id: string
  readonly kind: MaterialKind
  readonly label: string
  readonly source: 'agent' | 'algorithm' | 'user'
  /** Optional plan/run provenance. Unkeyed material cannot satisfy keyed requirements. */
  readonly evidenceKey?: string
}

export interface MissingRequirement {
  readonly kind: MaterialKind
  readonly count: number
  readonly label: string
}

export interface OutcomeEvaluation {
  readonly status: 'satisfied' | 'needs-repair'
  readonly missing: readonly MissingRequirement[]
}

export type OutcomeRuntimeStatus = 'running' | 'ready-to-deliver' | 'cancelled'

export type OutcomeEvent =
  | {
      readonly id: string
      readonly type: 'run-started'
      readonly runId: string
      readonly at: number
    }
  | {
      readonly id: string
      readonly type: 'material-recorded'
      readonly runId: string
      readonly at: number
      readonly material: MaterialEvidence
    }
  | {
      readonly id: string
      readonly type: 'run-cancelled'
      readonly runId: string
      readonly at: number
      readonly reason: string
    }

export interface OutcomeRuntimeState {
  readonly version: 'outcome-runtime.v1'
  readonly contract: OutcomeContract
  readonly runId: string
  readonly status: OutcomeRuntimeStatus
  readonly materials: readonly MaterialEvidence[]
  readonly evaluation: OutcomeEvaluation
  /** Append-only current-run event stream, suitable for persistence and replay. */
  readonly events: readonly OutcomeEvent[]
}

export function createOutcomeRuntime(
  contract: OutcomeContract,
  runId: string,
): OutcomeRuntimeState {
  const materials: readonly MaterialEvidence[] = []
  return {
    version: 'outcome-runtime.v1',
    contract,
    runId,
    status: 'running',
    materials,
    evaluation: evaluateOutcome(contract, materials),
    events: [],
  }
}

/**
 * Pure event reducer. A new run replaces the prior event stream and evidence;
 * late events from an older run are ignored so stale async work cannot corrupt
 * the current outcome.
 */
export function applyOutcomeEvent(
  state: OutcomeRuntimeState,
  event: OutcomeEvent,
): OutcomeRuntimeState {
  if (event.type === 'run-started') {
    if (event.runId === state.runId || state.events.some((item) => item.id === event.id)) {
      return state
    }
    const materials: readonly MaterialEvidence[] = []
    return {
      ...state,
      runId: event.runId,
      status: 'running',
      materials,
      evaluation: evaluateOutcome(state.contract, materials),
      events: [event],
    }
  }

  if (event.runId !== state.runId || state.events.some((item) => item.id === event.id)) {
    return state
  }

  if (event.type === 'run-cancelled') {
    return {
      ...state,
      status: 'cancelled',
      events: [...state.events, event],
    }
  }

  if (state.status === 'cancelled') return state

  const materials = state.materials.some((item) => item.id === event.material.id)
    ? state.materials
    : [...state.materials, event.material]
  const evaluation = evaluateOutcome(state.contract, materials)
  return {
    ...state,
    status: evaluation.status === 'satisfied' ? 'ready-to-deliver' : 'running',
    materials,
    evaluation,
    events: [...state.events, event],
  }
}

export function evaluateOutcome(
  contract: OutcomeContract,
  materials: readonly MaterialEvidence[],
): OutcomeEvaluation {
  const missing = contract.requirements.flatMap((requirement) => {
    const eligible = materials.filter((material) => material.kind === requirement.kind)
    const found = requirement.expectedKeys
      ? new Set(
          eligible.flatMap((material) =>
            material.evidenceKey && requirement.expectedKeys?.includes(material.evidenceKey)
              ? [material.evidenceKey]
              : [],
          ),
        ).size
      : eligible.length
    const count = Math.max(0, requirement.minCount - found)
    return count === 0 ? [] : [{ kind: requirement.kind, count, label: requirement.label }]
  })

  return {
    status: missing.length === 0 ? 'satisfied' : 'needs-repair',
    missing,
  }
}
