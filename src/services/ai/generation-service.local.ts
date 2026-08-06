/**
 * Local `GenerationService` (spec §5/§6) — the AI SDK doing its work.
 *
 * Provider factories are built with a **dummy** api key and the custom
 * `tauriFetch`, so all provider-specific request shaping / SSE parsing happens
 * here in JS while the real key stays in Rust (spec §1/§3). The config for a
 * `providerId` is resolved from the injected `ProviderService.list()`; only that
 * slice of the interface is needed, so the dependency is a `Pick`.
 *
 * The instruction comes from exactly one of `prompt` (raw text, back-compat),
 * `system` (explicit), or `promptRef` (resolved+rendered via the injected
 * `PromptService`). Multimodal `input` parts (the screenshot) attach to a single
 * user message. OpenAI-shaped image output goes through the Rust proxy directly
 * so compatible relays can return either `b64_json` or URL-shaped image data;
 * chat-image models still read image files from the AI SDK text path.
 */
import {
  generateText as aiGenerateText,
  hasToolCall,
  streamText as aiStreamText,
  stepCountIs,
  tool as aiTool,
  Output,
} from 'ai'
import type { ModelMessage } from 'ai'
import type { z } from 'zod'
import { err, isErr, ok } from '@/services/types'
import type { Result } from '@/services/types'
import type { PromptPart, PromptService } from '@/prompts/types'
import { reasoningProviderOptions } from './reasoning'
import type { ReasoningProviderOptions } from './reasoning'
import { base64ToBytes } from '@/lib/image'
import type {
  EditImageInput,
  GeneratedAsset,
  GenerateInput,
  GenerateWithToolsCall,
  GenerateWithToolsInput,
  GenerateWithToolsOutput,
  GenerationService,
  ProviderService,
} from './types'
import {
  effectiveProviderWireProtocol,
  supportsOpenAIImageEndpoints,
  type ProviderConfig,
  type ProviderWireProtocol,
} from './provider-types'
import { resolveModel } from './models'
import { invokeCancellableProxy, tauriFetch } from './tauri-fetch'
import { apiBaseUrl } from './base-url'
import { createDefaultGenerationAdapterRegistry, type GenerationAdapterRegistry } from './provider-adapter-registry'

/** Placeholder key handed to the SDK; the real key is injected in Rust. */
const DUMMY_KEY = '__managed_by_rust__'

const JSON_ONLY_SUFFIX =
  'Return only one valid JSON value matching the requested shape. Do not include markdown fences, prose, comments, or trailing commas.'

const JSON_REPAIR_SUFFIX =
  'Repair the previous JSON so it fully matches the requested schema and product rules. Return one complete corrected JSON value only. Fill every required non-empty array with meaningful entries. Do not return partial JSON, explanations, markdown fences, comments, or trailing commas.'

const API_RESPONSE_HINT =
  'Check that the provider base URL points to the API endpoint, not the web console.'

/** Only `list` is needed to resolve a `providerId` → config. */
type ConfigSource = Pick<ProviderService, 'list'>

/** Only `render` is needed to turn a `promptRef` → system instruction. */
type PromptSource = Pick<PromptService, 'render'>

interface ProxyResponse {
  readonly status: number
  readonly headers: Record<string, string>
  readonly body: string
}

/** Build the AI SDK model for a config, wired to the per-provider proxy fetch. */
async function buildModel(cfg: ProviderConfig, modelId: string, adapters:GenerationAdapterRegistry) {return adapters.createModel(cfg,modelId)}

function requestReasoningProtocol(
  cfg: ProviderConfig,
  explicit: GenerateInput['reasoningProtocol'],
): ProviderConfig['kind'] | NonNullable<GenerateInput['reasoningProtocol']> {
  if (explicit) return explicit
  // This selects the SDK request shape only; it does not claim that an
  // arbitrary compatible model supports reasoning. Callers still opt in by
  // providing reasoningEffort, and non-Responses relays keep provider default.
  if (
    (cfg.kind === 'openai-compatible' || cfg.kind === 'cc-switch')
    && effectiveProviderWireProtocol(cfg) === 'responses'
  ) return 'openai'
  return cfg.kind
}

/** Map a domain `PromptPart` to an AI SDK v6 user-message content part. */
function toContentPart(part: PromptPart) {
  if (part.type === 'text') return { type: 'text' as const, text: part.text }
  // v6 still accepts the `{type:'image', image}` part (the SDK auto-detects the
  // media type). It is only deprecated in the v7 migration guide; when Cutout
  // moves to AI SDK 7 this becomes `{type:'file', mediaType, data}`.
  return { type: 'image' as const, image: part.image }
}

/** The normalized shape a prepared call resolves to (raw XOR structured). */
type Prepared =
  | {
      readonly model: Awaited<ReturnType<typeof buildModel>>
      readonly prompt: string
      readonly systemContext?: string
      readonly providerOptions: ReasoningProviderOptions
      readonly wireProtocol?: ProviderWireProtocol
    }
  | {
      readonly model: Awaited<ReturnType<typeof buildModel>>
      readonly system: string
      readonly messages: ModelMessage[]
      readonly providerOptions: ReasoningProviderOptions
      readonly wireProtocol?: ProviderWireProtocol
    }

/** Count how many instruction sources are supplied (must be exactly one). */
function instructionSourceCount(input: GenerateInput): number {
  return [input.prompt, input.system, input.promptRef].filter(
    (v) => v !== undefined,
  ).length
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function headerValue(headers: unknown, name: string): string {
  if (!isRecord(headers)) return ''
  const target = name.toLowerCase()
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target && typeof value === 'string') {
      return value
    }
  }
  return ''
}

function htmlLike(text: string): boolean {
  const trimmed = text.trimStart().slice(0, 128).toLowerCase()
  return trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html')
}

function snippet(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 160)
}

function errorBodyMessage(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as unknown
    const error = isRecord(parsed) ? parsed.error : undefined
    const message = isRecord(error) ? error.message : undefined
    return typeof message === 'string' && message.length > 0 ? message : null
  } catch {
    return null
  }
}

function apiErrorText(error: unknown): string | null {
  if (!isRecord(error)) return null

  const lastError = error.lastError
  if (lastError !== undefined) {
    const normalized = apiErrorText(lastError)
    if (normalized) return normalized
  }

  const errors = error.errors
  if (Array.isArray(errors) && errors.length > 0) {
    const normalized = apiErrorText(errors[errors.length - 1])
    if (normalized) return normalized
  }

  const body =
    typeof error.responseBody === 'string' ? error.responseBody : undefined
  if (body !== undefined) {
    const providerMessage = errorBodyMessage(body)
    if (providerMessage) return providerMessage
  }

  const contentType = headerValue(error.responseHeaders, 'content-type')
  const status =
    typeof error.statusCode === 'number' ? error.statusCode : undefined
  const url =
    typeof error.url === 'string' && error.url.length > 0
      ? error.url
      : 'the provider endpoint'

  if (
    body !== undefined &&
    (contentType.toLowerCase().includes('text/html') || htmlLike(body))
  ) {
    return `Provider returned an HTML page instead of an API response for ${url}. ${API_RESPONSE_HINT}`
  }

  if (status !== undefined && body !== undefined && !body.trimStart().startsWith('{')) {
    return `Provider returned HTTP ${status} instead of an API response for ${url}. ${API_RESPONSE_HINT}${body ? ` Body: ${snippet(body)}` : ''}`
  }

  return null
}

const TRANSPORT_ERROR_PATTERNS = [
  /error sending request/i,
  /sending request for url/i,
  /failed to fetch/i,
  /fetch failed/i,
  /network\s?error/i,
  /connection (?:refused|reset|closed)/i,
  /dns error/i,
]
const TRANSPORT_HINT =
  'Check your BYOK provider base URL and network connectivity in AI settings.'

function transportErrorText(message: string): string | null {
  if (!TRANSPORT_ERROR_PATTERNS.some((pattern) => pattern.test(message))) return null
  const urlMatch = message.match(/https?:\/\/[^\s()<>"']+/)
  let target = 'the provider gateway'
  if (urlMatch) {
    try {
      target = new URL(urlMatch[0]).origin
    } catch {
      target = urlMatch[0]
    }
  }
  return `Could not reach ${target}. ${TRANSPORT_HINT}`.slice(0, 500)
}

function errorText(error: unknown): string {
  const apiError = apiErrorText(error)
  if (apiError) return apiError
  const message = error instanceof Error ? error.message : String(error)
  return transportErrorText(message) ?? message
}

function dataUrlParts(value: string): { mediaType: string; base64: string } | null {
  const match = value.match(/^data:([^;,]+);base64,(.*)$/s)
  if (!match) return null
  return { mediaType: match[1] || 'image/png', base64: match[2] }
}

async function imageUrlToAsset(url: string): Promise<GeneratedAsset> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Image download failed: HTTP ${response.status}`)
  }
  const mediaType = response.headers.get('content-type') || 'image/png'
  return {
    mediaType,
    bytes: new Uint8Array(await response.arrayBuffer()),
  }
}

async function imageItemToAsset(item: unknown): Promise<GeneratedAsset | null> {
  if (!isRecord(item)) return null

  const rawBase64 =
    typeof item.b64_json === 'string'
      ? item.b64_json
      : typeof item.b64 === 'string'
        ? item.b64
        : typeof item.base64 === 'string'
          ? item.base64
          : undefined
  if (rawBase64) {
    const dataUrl = dataUrlParts(rawBase64)
    return {
      mediaType: dataUrl?.mediaType ?? 'image/png',
      bytes: base64ToBytes(dataUrl?.base64 ?? rawBase64),
    }
  }

  const url = typeof item.url === 'string' ? item.url : undefined
  if (url) {
    const dataUrl = dataUrlParts(url)
    if (dataUrl) {
      return {
        mediaType: dataUrl.mediaType,
        bytes: base64ToBytes(dataUrl.base64),
      }
    }
    return imageUrlToAsset(url)
  }

  return null
}

async function parseImageGenerationBody(body: string): Promise<Result<GeneratedAsset[]>> {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch (error) {
    return err(`The image endpoint did not return JSON: ${errorText(error)}`)
  }

  if (!isRecord(parsed)) return err('The image endpoint returned an unexpected response.')
  const providerMessage = errorBodyMessage(body)
  if (providerMessage) return err(providerMessage)

  const data = Array.isArray(parsed.data) ? parsed.data : [parsed]
  const assets: GeneratedAsset[] = []
  for (const item of data) {
    const asset = await imageItemToAsset(item)
    if (asset) assets.push(asset)
  }

  if (assets.length > 0) return ok(assets)
  return err(`The image endpoint returned no usable image data. Body: ${snippet(body)}`)
}

function shouldRetryAsTextJson(message: string): boolean {
  const lower = message.toLowerCase()
  if (
    lower.includes('provider returned') ||
    lower.includes('provider base url') ||
    lower.includes('not the web console')
  ) {
    return false
  }
  return (
    lower.includes('json') ||
    lower.includes('schema') ||
    lower.includes('structured') ||
    lower.includes('response_format') ||
    lower.includes('object') ||
    lower.includes('no output generated')
  )
}

function extractJson(text: string): string {
  const trimmed = text.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  const source = (fenced?.[1] ?? trimmed).trim()
  const objectStart = source.indexOf('{')
  const arrayStart = source.indexOf('[')
  const starts = [objectStart, arrayStart].filter((index) => index >= 0)
  if (starts.length === 0) return source

  const start = Math.min(...starts)
  const open = source[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < source.length; i += 1) {
    const char = source[i]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === open) depth += 1
    else if (char === close) {
      depth -= 1
      if (depth === 0) return source.slice(start, i + 1)
    }
  }

  return source.slice(start)
}

interface StructuredParseFailure {
  readonly error: string
  readonly jsonText: string
  readonly category: Extract<
    StructuredFailureCategory,
    'invalid-json' | 'schema-mismatch'
  >
}

type StructuredAttempt =
  | 'native-schema'
  | 'forced-tool'
  | 'text-json'
  | 'repair-json'

type StructuredFailureCategory =
  | 'aborted'
  | 'authentication'
  | 'rate-limited'
  | 'endpoint-misconfigured'
  | 'transport'
  | 'unsupported'
  | 'output-missing'
  | 'invalid-json'
  | 'schema-mismatch'
  | 'provider-rejected'
  | 'unknown'

interface StructuredAttemptFailure {
  readonly attempt: StructuredAttempt
  readonly category: StructuredFailureCategory
}

function structuredFailureCategory(error: unknown): StructuredFailureCategory {
  const message = errorText(error).toLowerCase()
  const status = isRecord(error) && typeof error.statusCode === 'number'
    ? error.statusCode
    : Number(message.match(/\b(?:http\s*)?(\d{3})\b/i)?.[1] ?? Number.NaN)

  if (
    (isRecord(error) && error.name === 'AbortError')
    || message.includes('abort')
  ) return 'aborted'
  if (status === 401 || status === 403 || message.includes('unauthorized')) {
    return 'authentication'
  }
  if (status === 429 || message.includes('rate limit')) return 'rate-limited'
  if (
    TRANSPORT_ERROR_PATTERNS.some((pattern) => pattern.test(message))
    || message.includes(TRANSPORT_HINT.toLowerCase())
  ) return 'transport'
  if (
    message.includes('html page')
    || message.includes('provider base url')
    || message.includes('not the web console')
    || message.includes('non-api response')
  ) return 'endpoint-misconfigured'
  if (
    message.includes('response_format')
    || message.includes('not supported')
    || message.includes('unsupported')
    || message.includes('capability-required')
  ) return 'unsupported'
  if (
    message.includes('no output generated')
    || message.includes('did not submit structured tool output')
    || message.includes('no tool call')
  ) return 'output-missing'
  if (
    message.includes('parseable json')
    || message.includes('invalid json')
    || message.includes('json parse')
  ) return 'invalid-json'
  if (message.includes('schema') || message.includes('structured')) {
    return 'schema-mismatch'
  }
  if (Number.isFinite(status) && status >= 400) return 'provider-rejected'
  return 'unknown'
}

function structuredFailureText(
  failures: readonly StructuredAttemptFailure[],
): string {
  return `Structured output failed: ${failures
    .map(({ attempt, category }) => `${attempt}=${category}`)
    .join('; ')}.`
}

type StructuredParseResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly failure: StructuredParseFailure }

function parseStructuredTextDetailed<T>(
  text: string,
  schema: z.ZodType<T>,
): StructuredParseResult<T> {
  const jsonText = extractJson(text)
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch (error) {
    return {
      ok: false,
      failure: {
        jsonText,
        category: 'invalid-json',
        error: `The model did not return parseable JSON: ${errorText(error)}`,
      },
    }
  }

  const validation = schema.safeParse(parsed)
  if (!validation.success) {
    return {
      ok: false,
      failure: {
        jsonText,
        category: 'schema-mismatch',
        error: `The model returned JSON that did not match the schema: ${validation.error.message}`,
      },
    }
  }
  return { ok: true, data: validation.data }
}

function repairJsonSystem(
  system: string,
  failure: StructuredParseFailure,
): string {
  return [
    system,
    '',
    JSON_ONLY_SUFFIX,
    JSON_REPAIR_SUFFIX,
    '',
    'Validation failure to repair:',
    failure.error,
    '',
    'Previous invalid JSON:',
    failure.jsonText,
  ].join('\n')
}

async function generateStructuredTool<T>(
  prepared: Extract<Prepared, { readonly messages: ModelMessage[] }>,
  input: GenerateInput,
  schema: z.ZodType<T>,
): Promise<T> {
  const toolName = 'submit_structured_output'
  const request = {
    model: prepared.model,
    system: [
      prepared.system,
      '',
      'Call submit_structured_output exactly once with the complete requested object.',
      'Do not answer with prose or omit any required collection items.',
    ].join('\n'),
    messages: prepared.messages,
    abortSignal: input.signal,
    maxOutputTokens: input.maxOutputTokens,
    providerOptions: prepared.providerOptions,
    tools: {
      [toolName]: aiTool({
        description: 'Submit the complete schema-valid object requested by the user.',
        inputSchema: schema,
      }),
    },
    toolChoice: { type: 'tool', toolName },
  } as const
  // The packaged journey proves this same Responses route can complete the
  // buffered conversational tool loop. Prefer that established response
  // parser for a forced function call; compatible streaming gateways vary in
  // which argument-delta/final events they emit. Other protocols retain the
  // streaming path that avoids buffering long provider responses.
  const calls = prepared.wireProtocol === 'responses'
    ? (await aiGenerateText(request)).toolCalls
    : await aiStreamText(request).toolCalls
  const call = calls.find((candidate) => candidate.toolName === toolName)
  if (!call) throw new Error('The model did not submit structured tool output.')
  const parsed = schema.safeParse(call.input)
  if (!parsed.success) {
    throw new Error(`Structured tool output did not match the schema: ${parsed.error.message}`)
  }
  return parsed.data
}

export function createLocalGenerationService(
  providers: ConfigSource,
  prompts?: PromptSource,
  adapters:GenerationAdapterRegistry=createDefaultGenerationAdapterRegistry(),
): GenerationService {
  const structuredToolPreferred = new Set<string>()

  async function resolveConfig(
    id: string,
  ): Promise<ProviderConfig | undefined> {
    const list = await providers.list()
    return list.find((p) => p.id === id)
  }

  /** Resolve provider + instruction into a normalized, callable shape. */
  async function prepare(input: GenerateInput): Promise<Result<Prepared>> {
    if (instructionSourceCount(input) !== 1) {
      return err('provide exactly one of prompt, system, or promptRef')
    }
    const cfg = await resolveConfig(input.providerId)
    if (!cfg) return err('provider not configured')
    const modelId = resolveModel(cfg.kind, cfg.defaultModel, input.model)
    const model = await buildModel(cfg, modelId,adapters)
    const wireProtocol = effectiveProviderWireProtocol(cfg)
    // Thinking strength → per-vendor providerOptions (`{}` when unset/unsafe).
    const providerOptions = reasoningProviderOptions(
      requestReasoningProtocol(cfg, input.reasoningProtocol),
      input.reasoningEffort,
    )

    // Back-compat raw text path — a single prompt string, no multimodal parts.
    if (input.prompt !== undefined) {
      return ok({ model, prompt: input.prompt, ...(input.systemContext?{systemContext:input.systemContext}:{}), providerOptions, wireProtocol })
    }

    // Structured path: resolve the system instruction, then attach user content.
    let system: string
    let scaffold: readonly PromptPart[] = []
    if (input.promptRef !== undefined) {
      if (!prompts) return err('prompt service not available')
      try {
        const rendered = await prompts.render(input.promptRef)
        system = [input.systemContext,rendered.system].filter(Boolean).join('\n\n')
        scaffold = rendered.userScaffold ?? []
      } catch (error) {
        if (input.signal?.aborted) return err('Operation aborted')
        return err(error instanceof Error ? error.message : String(error))
      }
    } else {
      // Exactly-one-of guarantees `system` is set on this branch.
      system = [input.systemContext,input.system as string].filter(Boolean).join('\n\n')
    }

    const parts = [...scaffold, ...(input.input ?? [])]
    if (parts.length === 0) {
      return err('multimodal input required for system/promptRef generation')
    }
    const messages: ModelMessage[] = [
      { role: 'user', content: parts.map(toContentPart) },
    ]
    return ok({ model, system, messages, providerOptions, wireProtocol })
  }

  return {
    async research(input: GenerateInput): Promise<Result<string>> {
      const cfg = await resolveConfig(input.providerId)
      if (!cfg) return err('provider not configured')
      const modelId = resolveModel(cfg.kind, cfg.defaultModel, input.model)
      const wireProtocol = effectiveProviderWireProtocol(cfg)
      const fetch = tauriFetch(cfg.id, cfg.kind, wireProtocol)
      const baseURL = apiBaseUrl(cfg.kind, cfg.baseUrl, wireProtocol)
      const prompt = input.prompt ?? ''
      const stopWhen = stepCountIs(4)
      try {
        if (cfg.kind === 'openai') {
          const { createOpenAI } = await import('@ai-sdk/openai')
          const provider = createOpenAI({ apiKey: DUMMY_KEY, baseURL, fetch })
          const { text } = await aiGenerateText({
            model: provider(modelId),
            ...(input.systemContext?{system:input.systemContext}:{}),
            prompt,
            tools: { web_search: provider.tools.webSearchPreview({}) },
            stopWhen,
            abortSignal: input.signal,
          })
          return ok(text)
        }
        if (cfg.kind === 'anthropic') {
          const { createAnthropic } = await import('@ai-sdk/anthropic')
          const provider = createAnthropic({ apiKey: DUMMY_KEY, baseURL, fetch })
          const { text } = await aiGenerateText({
            model: provider(modelId),
            ...(input.systemContext?{system:input.systemContext}:{}),
            prompt,
            tools: { web_search: provider.tools.webSearch_20250305({}) },
            stopWhen,
            abortSignal: input.signal,
          })
          return ok(text)
        }
        if (cfg.kind === 'google') {
          const { createGoogleGenerativeAI } = await import('@ai-sdk/google')
          const provider = createGoogleGenerativeAI({ apiKey: DUMMY_KEY, baseURL, fetch })
          const { text } = await aiGenerateText({
            model: provider(modelId),
            ...(input.systemContext?{system:input.systemContext}:{}),
            prompt,
            tools: { google_search: provider.tools.googleSearch({}) },
            stopWhen,
            abortSignal: input.signal,
          })
          return ok(text)
        }
        return err('Web search needs an OpenAI, Anthropic, or Google endpoint.')
      } catch (error) {
        return err(error instanceof Error ? error.message : String(error))
      }
    },

    async generateWithTools(
      input: GenerateWithToolsInput,
    ): Promise<Result<GenerateWithToolsOutput>> {
      const cfg = await resolveConfig(input.providerId)
      if (!cfg) return err('provider not configured')
      const modelId = resolveModel(cfg.kind, cfg.defaultModel, input.model)
      const model = await buildModel(cfg, modelId,adapters)
      const providerOptions = reasoningProviderOptions(
        requestReasoningProtocol(cfg, input.reasoningProtocol),
        input.reasoningEffort,
      )
      const tools = Object.fromEntries(
        input.tools.map((generationTool) => [
          generationTool.name,
          aiTool({
            description: generationTool.description,
            inputSchema: generationTool.inputSchema,
            execute: (toolInput: unknown) => generationTool.execute(toolInput),
          }),
        ]),
      )
      try {
        const result = await aiGenerateText({
          model,
          ...(input.systemContext?{system:input.systemContext}:{}),
          prompt: input.prompt,
          tools,
          stopWhen: [
            stepCountIs(input.maxSteps),
            ...(input.terminalToolNames ?? []).map((toolName) => hasToolCall(toolName)),
          ],
          abortSignal: input.signal,
          maxOutputTokens: input.maxOutputTokens,
          providerOptions,
        })
        // `result.toolResults` silently omits any call whose `execute()` threw —
        // walking every step's raw content (which carries `tool-error` parts too)
        // is the only way a thrown validation error reaches the caller instead of
        // vanishing as if the model had never called the tool at all.
        const toolCalls: GenerateWithToolsCall[] = []
        for (const step of result.steps) {
          for (const part of step.content) {
            if (part.type === 'tool-result') {
              toolCalls.push({
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                input: part.input,
                output: part.output,
              })
            } else if (part.type === 'tool-error') {
              toolCalls.push({
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                input: part.input,
                output: undefined,
                error: errorText(part.error),
              })
            }
          }
        }
        return ok({ text: result.text, toolCalls, ...(input.personalizationReceipt?{personalizationReceipt:input.personalizationReceipt}:{}) })
      } catch (error) {
        return err(errorText(error))
      }
    },

    async generateText(input: GenerateInput): Promise<Result<string>> {
      const prepared = await prepare(input)
      if (isErr(prepared)) return prepared
      try {
        const p = prepared.data
        const { text } =
          'messages' in p
            ? await aiGenerateText({
                model: p.model,
                system: p.system,
                messages: p.messages,
                abortSignal: input.signal,
                maxOutputTokens: input.maxOutputTokens,
                providerOptions: p.providerOptions,
              })
            : await aiGenerateText({
                model: p.model,
                ...(p.systemContext?{system:p.systemContext}:{}),
                prompt: p.prompt,
                abortSignal: input.signal,
                maxOutputTokens: input.maxOutputTokens,
                providerOptions: p.providerOptions,
              })
        return ok(text)
      } catch (error) {
        return err(error instanceof Error ? error.message : String(error))
      }
    },

    async *streamText(input: GenerateInput): AsyncIterable<string> {
      const prepared = await prepare(input)
      if (isErr(prepared)) throw new Error(prepared.error)
      const p = prepared.data
      const result =
        'messages' in p
          ? aiStreamText({
              model: p.model,
              system: p.system,
              messages: p.messages,
              abortSignal: input.signal,
              maxOutputTokens: input.maxOutputTokens,
              providerOptions: p.providerOptions,
            })
          : aiStreamText({
              model: p.model,
              ...(p.systemContext?{system:p.systemContext}:{}),
              prompt: p.prompt,
              abortSignal: input.signal,
              maxOutputTokens: input.maxOutputTokens,
              providerOptions: p.providerOptions,
            })
      for await (const delta of result.textStream) {
        yield delta
      }
    },

    async generateObject<T>(
      input: GenerateInput,
      schema: z.ZodType<T>,
    ): Promise<Result<T>> {
      const prepared = await prepare(input)
      if (isErr(prepared)) return prepared
      // Structured output uses the streaming transport because some
      // OpenAI-compatible relays close buffered Responses requests. Vision
      // naming uses the chat/understanding slot, so a multimodal (`messages`)
      // call is the only shape that reaches this path.
      const p = prepared.data
      if (!('messages' in p)) {
        return err('structured output requires system/promptRef input')
      }
      const structuredKey = `${input.providerId}:${p.wireProtocol ?? 'none'}:${input.model ?? 'default'}`
      const failures: StructuredAttemptFailure[] = []
      if (!structuredToolPreferred.has(structuredKey)) {
        try {
          const result = aiStreamText({
            model: p.model,
            system: p.system,
            messages: p.messages,
            abortSignal: input.signal,
            maxOutputTokens: input.maxOutputTokens,
            providerOptions: p.providerOptions,
            output: Output.object({ schema }),
          })
          return ok(await result.output)
        } catch (error) {
          const message = errorText(error)
          failures.push({
            attempt: 'native-schema',
            category: structuredFailureCategory(error),
          })
          if (!shouldRetryAsTextJson(message)) {
            return err(structuredFailureText(failures))
          }
          structuredToolPreferred.add(structuredKey)
        }
      }

      try {
        return ok(await generateStructuredTool(p, input, schema))
      } catch (error) {
        const message = errorText(error)
        failures.push({
          attempt: 'forced-tool',
          category: structuredFailureCategory(error),
        })
        if (!shouldRetryAsTextJson(message)) {
          return err(structuredFailureText(failures))
        }
      }
      let activeTextAttempt: Extract<
        StructuredAttempt,
        'text-json' | 'repair-json'
      > = 'text-json'
      try {
        const fallback = aiStreamText({
          model: p.model,
          system: `${p.system}\n\n${JSON_ONLY_SUFFIX}`,
          messages: p.messages,
          abortSignal: input.signal,
          maxOutputTokens: input.maxOutputTokens,
          providerOptions: p.providerOptions,
        })
        const text = await fallback.text
        const parsed = parseStructuredTextDetailed(text, schema)
        if (parsed.ok) return ok(parsed.data)
        failures.push({
          attempt: 'text-json',
          category: parsed.failure.category,
        })

        activeTextAttempt = 'repair-json'
        const repaired = aiStreamText({
          model: p.model,
          system: repairJsonSystem(p.system, parsed.failure),
          messages: p.messages,
          abortSignal: input.signal,
          maxOutputTokens: input.maxOutputTokens,
          providerOptions: p.providerOptions,
        })
        const repairedParsed = parseStructuredTextDetailed(
          await repaired.text,
          schema,
        )
        if (repairedParsed.ok) return ok(repairedParsed.data)
        failures.push({
          attempt: 'repair-json',
          category: repairedParsed.failure.category,
        })
        return err(structuredFailureText(failures))
      } catch (fallbackError) {
        failures.push({
          attempt: activeTextAttempt,
          category: structuredFailureCategory(fallbackError),
        })
        return err(structuredFailureText(failures))
      }
    },

    async generateImages(
      input: GenerateInput,
    ): Promise<Result<GeneratedAsset[]>> {
      if (input.signal?.aborted) return err('Operation aborted')
      const cfg = await resolveConfig(input.providerId)
      if (input.signal?.aborted) return err('Operation aborted')
      if (!cfg) return err('provider not configured')
      const modelId = resolveModel(cfg.kind, cfg.defaultModel, input.model)

      // OpenAI-shaped image models (gpt-image / dall-e) are served by the IMAGES
      // endpoint, not /chat/completions. Call the proxied endpoint directly so
      // OpenAI-compatible relays that return URL-shaped image data don't fail
      // the AI SDK's stricter `b64_json` response schema.
      const wireProtocol = effectiveProviderWireProtocol(cfg)
      if (
        supportsOpenAIImageEndpoints(cfg.kind) &&
        (wireProtocol === 'responses' || wireProtocol === 'chat-completions')
      ) {
        if (instructionSourceCount(input) !== 1) {
          return err('provide exactly one of prompt, system, or promptRef')
        }
        const chunks: string[] = []
        if (input.prompt !== undefined) {
          chunks.push(input.prompt)
        } else if (input.promptRef !== undefined) {
          if (!prompts) return err('prompt service not available')
          try {
            const rendered = await prompts.render(input.promptRef)
            chunks.push(rendered.system)
            for (const part of rendered.userScaffold ?? []) {
              if (part.type === 'text') chunks.push(part.text)
            }
          } catch (error) {
            return err(error instanceof Error ? error.message : String(error))
          }
        } else if (input.system !== undefined) {
          chunks.push(input.system)
        }
        for (const part of input.input ?? []) {
          if (part.type === 'text') chunks.push(part.text)
        }
        const promptText = chunks.filter((c) => c.trim().length > 0).join('\n\n')
        if (!promptText) return err('no prompt text for image generation')

        try {
          if (input.signal?.aborted) return err('Operation aborted')
          const baseUrl = apiBaseUrl(cfg.kind, cfg.baseUrl, wireProtocol)
          if (!baseUrl) return err('provider has no base URL for image generation')
          const res = await invokeCancellableProxy<ProxyResponse>('ai_proxy_request', {
            providerId: cfg.id,
            kind: cfg.kind,
            wireProtocol,
            url: `${baseUrl}/images/generations`,
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              model: modelId,
              prompt: promptText,
              n: 1,
            }),
          }, input.signal)
          if (input.signal?.aborted) return err('Operation aborted')
          if (res.status < 200 || res.status >= 300) {
            const providerMessage = errorBodyMessage(res.body)
            return err(
              `images/generations failed: HTTP ${res.status}${providerMessage ? ` · ${providerMessage}` : res.body ? ` · ${snippet(res.body)}` : ''}`,
            )
          }
          return parseImageGenerationBody(res.body)
        } catch (error) {
          if (input.signal?.aborted) return err('Operation aborted')
          return err(error instanceof Error ? error.message : String(error))
        }
      }

      // Chat-image models (Gemini etc.): images arrive in `result.files`.
      const prepared = await prepare(input)
      if (isErr(prepared)) return prepared
      try {
        const p = prepared.data
        const result =
          'messages' in p
            ? await aiGenerateText({
                model: p.model,
                system: p.system,
                messages: p.messages,
                abortSignal: input.signal,
              })
            : await aiGenerateText({
                model: p.model,
                prompt: p.prompt,
                abortSignal: input.signal,
              })
        const assets: GeneratedAsset[] = result.files
          .filter((file) => file.mediaType.startsWith('image/'))
          .map((file) => ({ mediaType: file.mediaType, bytes: file.uint8Array }))
        return ok(assets)
      } catch (error) {
        if (input.signal?.aborted) return err('Operation aborted')
        return err(error instanceof Error ? error.message : String(error))
      }
    },

    async editImage(input: EditImageInput): Promise<Result<GeneratedAsset[]>> {
      if (input.signal?.aborted) return err('Operation aborted')
      const cfg = await resolveConfig(input.providerId)
      if (input.signal?.aborted) return err('Operation aborted')
      if (!cfg) return err('provider not configured')
      // The edits endpoint is OpenAI-shaped; other kinds have no `/images/edits`.
      const wireProtocol = effectiveProviderWireProtocol(cfg)
      if (
        !supportsOpenAIImageEndpoints(cfg.kind) ||
        (wireProtocol !== 'responses' && wireProtocol !== 'chat-completions')
      ) {
        return err('image edit requires an OpenAI-compatible provider')
      }
      const baseUrl = apiBaseUrl(cfg.kind, cfg.baseUrl, wireProtocol)
      if (!baseUrl) return err('provider has no base URL for image edit')
      if (input.images.length === 0) {
        return err('at least one reference image is required')
      }
      const modelId = resolveModel(cfg.kind, cfg.defaultModel, input.model)

      // Bytes cross the Tauri IPC as number arrays → Rust `Vec<Vec<u8>>`. The
      // real key is injected in Rust; the base64 reply is decoded to PNG bytes.
      try {
        if (input.signal?.aborted) return err('Operation aborted')
        const invokeEdit = (inputFidelity: 'high' | 'low' | null) =>
          invokeCancellableProxy<{ images: string[] }>('ai_image_edit', {
            providerId: cfg.id,
            kind: cfg.kind,
            wireProtocol,
            baseUrl,
            model: modelId,
            prompt: input.prompt,
            images: input.images.map((bytes) => Array.from(bytes)),
            size: input.size ?? null,
            inputFidelity,
          }, input.signal)
        const requestedFidelity = input.inputFidelity ?? 'high'
        let res: { images: string[] }
        try {
          res = await invokeEdit(requestedFidelity)
        } catch (error) {
          // Some OpenAI-compatible edit endpoints implement the multipart route
          // but reject the optional OpenAI `input_fidelity` field. Retry that
          // exact conformance failure once without the field; auth, rate-limit,
          // server and transport failures retain their normal semantics.
          if (
            requestedFidelity !== 'high' ||
            input.signal?.aborted ||
            !/images\/edits failed: HTTP 400\b/i.test(errorText(error))
          ) throw error
          res = await invokeEdit(null)
        }
        if (input.signal?.aborted) return err('Operation aborted')
        const assets: GeneratedAsset[] = res.images.map((b64) => ({
          mediaType: 'image/png',
          bytes: base64ToBytes(b64),
        }))
        if (assets.length === 0) return err('The model returned no image.')
        return ok(assets)
      } catch (error) {
        if (input.signal?.aborted) return err('Operation aborted')
        return err(error instanceof Error ? error.message : String(error))
      }
    },
  }
}
