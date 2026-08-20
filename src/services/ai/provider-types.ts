/**
 * BYOK provider model (spec §4) — the non-secret shape.
 *
 * A `ProviderConfig` is a user-configured connection. It is stored as plain JSON
 * in the app-config dir (via the Rust `load_providers`/`save_providers`
 * commands) and carries **no key**: the secret lives only in the OS keychain,
 * referenced by `id`. Gateway is modeled as "just a provider" (`kind:'gateway'`).
 *
 * Field casing is the on-the-wire shape the Rust `providers.rs` serde struct
 * uses (`#[serde(rename_all="camelCase")]`), so `baseUrl` here maps 1:1 to the
 * persisted JSON. (The AI SDK factory option is spelled `baseURL`; the mapping
 * happens in `generation-service.local.ts`.)
 */
import { z } from 'zod'

/** Every provider kind Rust knows how to inject auth for (spec §4). */
export type ProviderKind = string
export const providerWireProtocolSchema = z.enum([
  'responses',
  'chat-completions',
  'anthropic-messages',
  'google-generate-content',
])
export type ProviderWireProtocol = z.infer<typeof providerWireProtocolSchema>

export function isOpenAIShapedProvider(kind: ProviderKind): boolean {
  return kind === 'openai' || kind === 'openai-compatible' || kind === 'cc-switch' || [
    'dashscope','deepseek','zhipu','moonshot','volcengine','siliconflow',
    'openrouter','together','groq','fireworks','xai','mistral',
    'ollama','vllm','lm-studio',
  ].includes(kind)
}

/** Provider routes implemented by the native `/images/generations` and `/images/edits` bridge. */
export function supportsOpenAIImageEndpoints(
  provider: ProviderKind | Pick<ProviderConfig, 'kind' | 'wireProtocol'> | undefined,
): boolean {
  const kind = typeof provider === 'string' ? provider : provider?.kind
  if (kind !== 'openai' && kind !== 'openai-compatible' && kind !== 'cc-switch') return false
  if (!provider || typeof provider === 'string') return true
  const protocol = effectiveProviderWireProtocol(provider)
  return protocol === 'responses' || protocol === 'chat-completions'
}

/** Product default used only while creating a new provider draft. */
export function defaultProviderWireProtocol(kind: ProviderKind): ProviderWireProtocol | undefined {
  if (kind === 'openai' || kind === 'cc-switch') return 'responses'
  if (kind === 'anthropic') return 'anthropic-messages'
  if (kind === 'google') return 'google-generate-content'
  if (isOpenAIShapedProvider(kind)) return 'chat-completions'
  return undefined
}

export function supportedProviderWireProtocols(
  kind: ProviderKind,
): readonly ProviderWireProtocol[] {
  if (kind === 'openai' || kind === 'cc-switch') return ['responses', 'chat-completions']
  if (kind === 'anthropic') return ['anthropic-messages']
  if (kind === 'google') return ['google-generate-content']
  if (kind === 'openai-compatible') {
    return [
      'responses',
      'chat-completions',
      'anthropic-messages',
      'google-generate-content',
    ]
  }
  if (isOpenAIShapedProvider(kind)) return ['chat-completions']
  return []
}

export function effectiveProviderWireProtocol(
  config: Pick<ProviderConfig, 'kind' | 'wireProtocol'>,
): ProviderWireProtocol | undefined {
  if (config.kind === 'gateway') return undefined
  if (!config.wireProtocol) {
    throw new Error(`wire protocol is required for ${config.kind}`)
  }
  return config.wireProtocol
}

export function isProviderWireProtocolSupported(
  kind: ProviderKind,
  protocol: ProviderWireProtocol | undefined,
): boolean {
  const supported = supportedProviderWireProtocols(kind)
  return protocol === undefined ? supported.length === 0 : supported.includes(protocol)
}

/** The ordered, user-selectable kinds (drives the Settings `Select`). */
export const PROVIDER_KINDS: readonly ProviderKind[] = [
  'anthropic',
  'openai',
  'google',
  'gateway',
  'openai-compatible',
  'cc-switch',
  'dashscope','deepseek','zhipu','moonshot','volcengine','siliconflow',
  'openrouter','together','groq','fireworks','xai','mistral',
  'ollama','vllm','lm-studio',
] as const

/**
 * Layer 2 — the models this connection actually advertises.
 *
 * Written by exactly two paths: the native draft import (new provider) and the
 * credential probe behind Settings "Verify" (`ProviderService.test`). It lives
 * beside the connection in `providers.json` so it survives a browser-storage
 * wipe, and it is the only source the task-routing pickers read.
 */
export interface ProviderCatalog {
  readonly models: readonly string[]
  /** ISO timestamp of the probe that produced `models`. */
  readonly fetchedAt: string
}

/**
 * Layer 1 — a user-configured provider *connection*. NO key field (see module
 * doc) and NO model choice: which model serves which task is layer 3
 * (`CapabilityBindings`), resolved through `task-routing.ts`.
 */
export interface ProviderConfig {
  /** Stable uuid; also the keychain entry account (`provider:{id}`). */
  readonly id: string
  readonly kind: ProviderKind
  /** User-facing name ("My Anthropic", "Team Gateway"). */
  readonly label: string
  /** Required for `openai-compatible`; optional override for other kinds. */
  readonly baseUrl?: string
  /** Explicit generation wire protocol. Gateway is the only kind that omits it. */
  readonly wireProtocol?: ProviderWireProtocol
  /** Layer 2 catalog. Absent = never probed, or the endpoint serves no catalog. */
  readonly catalog?: ProviderCatalog
  /**
   * @deprecated A connection does not own a model. Retained only to parse
   * pre-v0.1.25 `providers.json` and to seed the one-time binding migration
   * (`legacy-binding-migration.ts`); never written for new providers and never
   * consulted when routing a call.
   */
  readonly defaultModel?: string
  readonly enabled: boolean
}

/** A new-or-updated provider: `id` optional (generated on create). */
export type ProviderDraft = Omit<ProviderConfig, 'id'> & { readonly id?: string }

/**
 * The models a connection advertises — the single read path for layer 2.
 * Empty means "not probed yet, or this endpoint serves no catalog"; callers
 * fall back to a manual model entry rather than to a guessed slug.
 */
export function providerCatalogModels(
  provider: Pick<ProviderConfig, 'catalog'> | undefined,
): readonly string[] {
  return provider?.catalog?.models ?? []
}

/** Does this connection's catalog prove `model` is reachable? */
export function providerCatalogHasModel(
  provider: Pick<ProviderConfig, 'catalog'> | undefined,
  model: string,
): boolean {
  return providerCatalogModels(provider).includes(model)
}

/**
 * Boundary validation for provider config coming back from Rust / a form.
 * Kept permissive on `baseUrl` (host allowlisting is enforced in Rust, not here)
 * so we never reject a persisted config the UI could otherwise repair.
 */
export const providerKindSchema = z.string().min(1).max(120).regex(/^[a-z0-9][a-z0-9._-]*$/)

export const providerCatalogSchema = z.object({
  models: z.array(z.string().min(1)),
  fetchedAt: z.string().datetime(),
})

const providerConfigFields = {
  kind: providerKindSchema,
  label: z.string().min(1),
  baseUrl: z.string().min(1).optional(),
  wireProtocol: providerWireProtocolSchema.optional(),
  catalog: providerCatalogSchema.optional(),
  /** @deprecated see {@link ProviderConfig.defaultModel} — parsed, never required. */
  defaultModel: z.string().min(1).optional(),
  enabled: z.boolean(),
}

function providerWireProtocolMessage(
  config: Pick<ProviderConfig, 'kind' | 'wireProtocol'>,
): string | undefined {
  if (config.kind !== 'gateway' && !config.wireProtocol) {
    return `wire protocol is required for ${config.kind}`
  }
  if (
    PROVIDER_KINDS.includes(config.kind) &&
    !isProviderWireProtocolSupported(config.kind, config.wireProtocol)
  ) {
    return `${config.wireProtocol ?? 'no wire protocol'} is not supported for ${config.kind}`
  }
  return undefined
}

function addWireProtocolIssue(
  config: Pick<ProviderConfig, 'kind' | 'wireProtocol'>,
  context: { addIssue(issue: { code: 'custom'; path: string[]; message: string }): void },
): void {
  const message = providerWireProtocolMessage(config)
  if (message) {
    context.addIssue({
      code: 'custom',
      path: ['wireProtocol'],
      message,
    })
  }
}

export const providerConfigSchema = z.object({
  id: z.string().min(1),
  ...providerConfigFields,
}).superRefine(addWireProtocolIssue)

function addDraftWireProtocolIssue(
  config: Pick<ProviderConfig, 'kind' | 'wireProtocol'>,
  context: { addIssue(issue: { code: 'custom'; path: string[]; message: string }): void },
): void {
  const protocol = config.wireProtocol ?? defaultProviderWireProtocol(config.kind)
  if (!isProviderWireProtocolSupported(config.kind, protocol)) {
    context.addIssue({
      code: 'custom',
      path: ['wireProtocol'],
      message: `${protocol ?? 'no wire protocol'} is not supported for ${config.kind}`,
    })
  }
}

export const providerDraftSchema = z.object({
  id: z.string().min(1).optional(),
  ...providerConfigFields,
}).superRefine(addDraftWireProtocolIssue)

/** Parse an unknown array (e.g. `load_providers` result) into typed configs. */
export const providerConfigsSchema = z.array(providerConfigSchema)
