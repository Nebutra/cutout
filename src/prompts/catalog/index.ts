/**
 * Built-in prompt catalog (spec §3/§8) — registers every shipped prompt.
 *
 * P1 shipped `ui-asset-deconstruction`; P2 adds `ui-mockup-generation` (the
 * forward brief→mockup step). Add future built-ins to `BUILTIN_PROMPTS`;
 * `createBuiltinRegistry()` is the ready-to-use catalog the local
 * `PromptService` is backed by.
 */
import { createPromptRegistry, type PromptRegistry } from '../registry'
import type { PromptVersion } from '../types'
import { uiAssetDeconstruction } from './ui-asset-deconstruction'
import { uiMockupGeneration } from './ui-mockup-generation'

/** Every built-in prompt version shipped in the app. */
export const BUILTIN_PROMPTS: readonly PromptVersion[] = [
  uiAssetDeconstruction,
  uiMockupGeneration,
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
