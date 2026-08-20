/**
 * Layer 3 — resolve "which connection + model serves this task".
 *
 * Settings persists one binding per `ModelTaskKind`. Before this module, the
 * runtime consumed a two-slot projection (`chat` / `image`) instead, so a
 * binding for `webdev` was dead whenever `text` was set, and `image-edit` was
 * dead whenever `image-generation` was set — the UI promised per-task routing
 * the runtime never honoured. Every call site now resolves through here.
 *
 * Fallback is a **routing** convenience, not a capability guarantee: inheriting
 * `vision` from `text` says nothing about whether that model accepts images.
 * Capability gating stays where the evidence lives (`requiresVerifiedVision`,
 * `assessImageRoute`), and `inheritedFrom` lets the UI say so out loud.
 */
import type { ModelAssignment } from './model-assignment-types'
import type { CapabilityBindings, ModelTaskKind } from './model-capabilities'

/**
 * Ordered inheritance per task. `text` and `image-generation` are roots: they
 * have no fallback, so "not configured" stays visible instead of silently
 * borrowing an unrelated route.
 */
const FALLBACK: Record<ModelTaskKind, readonly ModelTaskKind[]> = {
  text: [],
  vision: ['text'],
  research: ['text'],
  webdev: ['text'],
  'image-to-webdev': ['vision', 'webdev', 'text'],
  'image-generation': [],
  'image-edit': ['image-generation'],
  asr: [],
  tts: [],
  'video-generation': [],
  'video-edit': [],
}

export interface ResolvedTaskRoute {
  readonly assignment: ModelAssignment
  /** Set when the task itself is unbound and the route came from another task. */
  readonly inheritedFrom?: ModelTaskKind
}

/** The route for `task`, or `undefined` when neither it nor its chain is bound. */
export function resolveTaskRoute(
  bindings: CapabilityBindings['bindings'] | undefined,
  task: ModelTaskKind,
): ResolvedTaskRoute | undefined {
  const own = bindings?.[task]
  if (own) return { assignment: own }
  for (const source of FALLBACK[task]) {
    const inherited = bindings?.[source]
    if (inherited) return { assignment: inherited, inheritedFrom: source }
  }
  return undefined
}

/** The assignment for `task`, discarding provenance. */
export function resolveTaskAssignment(
  bindings: CapabilityBindings['bindings'] | undefined,
  task: ModelTaskKind,
): ModelAssignment | undefined {
  return resolveTaskRoute(bindings, task)?.assignment
}

/** The tasks a given task may inherit from, in order. Exposed for the UI. */
export function taskFallbackChain(task: ModelTaskKind): readonly ModelTaskKind[] {
  return FALLBACK[task]
}
