/**
 * Built-in prompt catalog (spec §3/§8) — registers every shipped prompt.
 *
 * P1 shipped `ui-asset-deconstruction`; P2 adds `ui-mockup-generation` (the
 * forward brief→mockup step); P3 adds the reverse `ui-mockup-composition`
 * (board→mockup) and the vision `ui-slice-naming` step; P6a adds
 * `ui-graph-planner` (the AI Planner that emits a validated GraphSpec); P7a adds
 * `ui-intent-recognition` (the open-world intent miner upstream of the Planner).
 * P8 adds `ui-prototype-planner` (the multi-page prototype graph planner).
 * Add future built-ins to `BUILTIN_PROMPTS`; `createBuiltinRegistry()` is the
 * ready-to-use catalog the local `PromptService` is backed by.
 */
import { createPromptRegistry, type PromptRegistry } from '../registry'
import type { PromptVersion } from '../types'
import { uiAssetDeconstruction } from './ui-asset-deconstruction'
import { uiMockupGeneration } from './ui-mockup-generation'
import { uiMockupComposition } from './ui-mockup-composition'
import { uiSliceNaming } from './ui-slice-naming'
import { uiGraphPlanner } from './ui-graph-planner'
import { uiIntentRecognition } from './ui-intent-recognition'
import { uiPrototypePlanner } from './ui-prototype-planner'
import { uiGenerationQa } from './ui-generation-qa'

/** Every built-in prompt version shipped in the app. */
export const BUILTIN_PROMPTS: readonly PromptVersion[] = [
  uiAssetDeconstruction,
  uiMockupGeneration,
  uiMockupComposition,
  uiSliceNaming,
  uiGraphPlanner,
  uiIntentRecognition,
  uiPrototypePlanner,
  uiGenerationQa,
]

/** Register all built-ins into an existing registry. */
export function registerBuiltins(registry: PromptRegistry): void {
  registry.register(BUILTIN_PROMPTS)
}

/** A fresh registry pre-loaded with the built-in catalog. */
export function createBuiltinRegistry(): PromptRegistry {
  const registry = createPromptRegistry()
  registerBuiltins(registry)
  return registry
}
