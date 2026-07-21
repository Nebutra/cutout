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
  return kind === 'openai' || kind === 'openai-compatible' || [
    'dashscope','deepseek','zhipu','moonshot','volcengine','siliconflow',
    'openrouter','together','groq','fireworks','xai','mistral',
    'ollama','vllm','lm-studio',
  ].includes(kind)
}

/** Effective wire default for old records that predate the persisted field. */
export function defaultProviderWireProtocol(kind: ProviderKind): ProviderWireProtocol | undefined {
  if (kind === 'openai') return 'responses'
  if (kind === 'anthropic') return 'anthropic-messages'
  if (kind === 'google') return 'google-generate-content'
  if (isOpenAIShapedProvider(kind)) return 'chat-completions'
  return undefined
}

export function supportedProviderWireProtocols(
  kind: ProviderKind,
): readonly ProviderWireProtocol[] {
  if (kind === 'openai') return ['responses', 'chat-completions']
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
  return config.wireProtocol ?? defaultProviderWireProtocol(config.kind)
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
  'dashscope','deepseek','zhipu','moonshot','volcengine','siliconflow',
  'openrouter','together','groq','fireworks','xai','mistral',
  'ollama','vllm','lm-studio',
] as const

/** A user-configured provider connection. NO key field — see module doc. */
export interface ProviderConfig {
  /** Stable uuid; also the keychain entry account (`provider:{id}`). */
  readonly id: string
  readonly kind: ProviderKind
  /** User-facing name ("My Anthropic", "Team Gateway"). */
  readonly label: string
  /** Required for `openai-compatible`; optional override for other kinds. */
  readonly baseUrl?: string
  /** Explicit generation wire protocol. Old records may omit it. */
  readonly wireProtocol?: ProviderWireProtocol
  /** Default model slug, e.g. `claude-sonnet-4.6` or `anthropic/claude-sonnet-4.6`. */
  readonly defaultModel: string
  readonly enabled: boolean
}

/** A new-or-updated provider: `id` optional (generated on create). */
export type ProviderDraft = Omit<ProviderConfig, 'id'> & { readonly id?: string }

/**
 * Boundary validation for provider config coming back from Rust / a form.
 * Kept permissive on `baseUrl` (host allowlisting is enforced in Rust, not here)
 * so we never reject a persisted config the UI could otherwise repair.
 */
export const providerKindSchema = z.string().min(1).max(120).regex(/^[a-z0-9][a-z0-9._-]*$/)

const providerConfigFields = {
  kind: providerKindSchema,
  label: z.string().min(1),
  baseUrl: z.string().min(1).optional(),
  wireProtocol: providerWireProtocolSchema.optional(),
  defaultModel: z.string().min(1),
  enabled: z.boolean(),
}

function unsupportedWireProtocolMessage(
  config: Pick<ProviderConfig, 'kind' | 'wireProtocol'>,
): string | undefined {
  if (
    PROVIDER_KINDS.includes(config.kind) &&
    !isProviderWireProtocolSupported(
      config.kind,
      config.wireProtocol ?? defaultProviderWireProtocol(config.kind),
    )
  ) {
    return `${config.wireProtocol ?? 'no wire protocol'} is not supported for ${config.kind}`
  }
  return undefined
}

function addWireProtocolIssue(
  config: Pick<ProviderConfig, 'kind' | 'wireProtocol'>,
  context: { addIssue(issue: { code: 'custom'; path: string[]; message: string }): void },
): void {
  const message = unsupportedWireProtocolMessage(config)
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

export const providerDraftSchema = z.object({
  id: z.string().min(1).optional(),
  ...providerConfigFields,
}).superRefine(addWireProtocolIssue)

/** Parse an unknown array (e.g. `load_providers` result) into typed configs. */
export const providerConfigsSchema = z.array(providerConfigSchema)
