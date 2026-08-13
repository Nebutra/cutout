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
import {
  supportsNativeDashScopeImageTransport,
  supportsXaiImageModel,
} from './image-route-assessment'
import {
  structuredGenerationFailureText,
  type StructuredGenerationAttempt,
  type StructuredGenerationAttemptFailure,
  type StructuredGenerationFailureCategory,
} from './generation-error'

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

interface NativeImageResult {
  readonly images: readonly {
    readonly mediaType: string
    readonly data: string
  }[]
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

const XAI_MAX_REFERENCE_IMAGES = 3
const XAI_MAX_REFERENCE_BYTES = 20 * 1024 * 1024
const XAI_MAX_TOTAL_REFERENCE_BYTES = 48 * 1024 * 1024

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

function imageBytesMediaType(bytes: Uint8Array): string | undefined {
  if (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
  ) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    bytes.length >= 12
    && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
  ) return 'image/webp'
  return undefined
}

function xaiImageReference(bytes: Uint8Array): { readonly type: 'image_url'; readonly url: string } {
  const mediaType = imageBytesMediaType(bytes)
  if (!mediaType) throw new Error('xAI reference images must be PNG, JPEG, or WebP.')
  return {
    type: 'image_url',
    url: `data:${mediaType};base64,${bytesToBase64(bytes)}`,
  }
}

function xaiEditSizeOptions(
  size: string | undefined,
  multipleReferences: boolean,
): { readonly resolution?: '1k' | '2k'; readonly aspect_ratio?: string } {
  if (!size) return {}
  const match = size.match(/^(\d+)x(\d+)$/)
  if (!match) throw new Error('xAI image size must use WIDTHxHEIGHT pixels.')
  const width = Number(match[1])
  const height = Number(match[2])
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error('xAI image size must use positive pixel dimensions.')
  }
  const resolution = Math.max(width, height) > 1024 ? '2k' as const : '1k' as const
  if (!multipleReferences) return { resolution }
  const divisor = greatestCommonDivisor(width, height)
  const aspectRatio = `${width / divisor}:${height / divisor}`
  const supported = new Set([
    '1:1', '3:4', '4:3', '9:16', '16:9', '2:3', '3:2',
    '9:19.5', '19.5:9', '9:20', '20:9', '1:2', '2:1',
  ])
  if (!supported.has(aspectRatio)) {
    throw new Error(`xAI does not support the requested ${aspectRatio} output ratio.`)
  }
  return { resolution, aspect_ratio: aspectRatio }
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = left
  let b = right
  while (b !== 0) [a, b] = [b, a % b]
  return a
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

async function imageItemToAsset(
  item: unknown,
  options: {
    readonly allowRemoteUrl?: boolean
    readonly defaultMediaType?: string
  } = {},
): Promise<GeneratedAsset | null> {
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
    const bytes = base64ToBytes(dataUrl?.base64 ?? rawBase64)
    return {
      mediaType: dataUrl?.mediaType
        ?? (typeof item.mime_type === 'string' ? item.mime_type : undefined)
        ?? imageBytesMediaType(bytes)
        ?? options.defaultMediaType
        ?? 'image/png',
      bytes,
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
    return options.allowRemoteUrl === false ? null : imageUrlToAsset(url)
  }

  return null
}

async function parseImageGenerationBody(
  body: string,
  options?: Parameters<typeof imageItemToAsset>[1],
): Promise<Result<GeneratedAsset[]>> {
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
    const asset = await imageItemToAsset(item, options)
    if (asset) assets.push(asset)
  }

  if (assets.length > 0) return ok(assets)
  return err(`The image endpoint returned no usable image data. Body: ${snippet(body)}`)
}

function shouldRetryStructuredFallback(
  category: StructuredGenerationFailureCategory,
): boolean {
  switch (category) {
    case 'unsupported':
    case 'output-missing':
    case 'invalid-json':
    case 'schema-mismatch':
      return true
    case 'unknown':
    case 'aborted':
    case 'authentication':
    case 'policy':
    case 'rate-limited':
    case 'endpoint-misconfigured':
    case 'transport':
    case 'provider-rejected':
      return false
    default: {
      const exhaustive: never = category
      return exhaustive
    }
  }
}

function structuredHttpStatus(error: unknown, depth = 0): number | null {
  if (depth > 4 || !isRecord(error)) return null
  if (typeof error.statusCode === 'number') return error.statusCode
  const lastStatus = structuredHttpStatus(error.lastError, depth + 1)
  if (lastStatus !== null) return lastStatus
  if (!Array.isArray(error.errors)) return null
  for (let index = error.errors.length - 1; index >= 0; index -= 1) {
    const status = structuredHttpStatus(error.errors[index], depth + 1)
    if (status !== null) return status
  }
  return null
}

function structuredErrorMessages(error: unknown, depth = 0): readonly string[] {
  if (depth > 4) return []
  const messages: string[] = []
  if (error instanceof Error) messages.push(error.message)
  else if (!isRecord(error)) messages.push(String(error))
  if (!isRecord(error)) return messages
  messages.push(...structuredErrorMessages(error.lastError, depth + 1))
  if (Array.isArray(error.errors)) {
    for (const nested of error.errors) {
      messages.push(...structuredErrorMessages(nested, depth + 1))
    }
  }
  return messages
}

function structuredErrorHasName(error: unknown, name: string, depth = 0): boolean {
  if (depth > 4 || !isRecord(error)) return false
  if (error.name === name) return true
  if (structuredErrorHasName(error.lastError, name, depth + 1)) return true
  return Array.isArray(error.errors)
    && error.errors.some((nested) => structuredErrorHasName(nested, name, depth + 1))
}

function structuredResponseIsNonApi(error: unknown, depth = 0): boolean {
  if (depth > 4 || !isRecord(error)) return false
  const body = typeof error.responseBody === 'string' ? error.responseBody : undefined
  const contentType = headerValue(error.responseHeaders, 'content-type')
  if (body !== undefined && (contentType.toLowerCase().includes('text/html') || htmlLike(body))) {
    return true
  }
  if (structuredResponseIsNonApi(error.lastError, depth + 1)) return true
  return Array.isArray(error.errors)
    && error.errors.some((nested) => structuredResponseIsNonApi(nested, depth + 1))
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
    StructuredGenerationFailureCategory,
    'invalid-json' | 'schema-mismatch'
  >
}

function structuredFailureCategory(error: unknown): StructuredGenerationFailureCategory {
  const messages = structuredErrorMessages(error)
  const reviewedStatus = structuredHttpStatus(error)
  const status = reviewedStatus
    ?? messages.reduce<number>((current, message) => current || Number(message.match(
        /\b(?:http(?:\s+status)?(?:\s+code)?|status(?:\s+code)?)\s*(?:[:=]\s*)?(\d{3})\b/i,
      )?.[1] ?? Number.NaN), Number.NaN)

  if (structuredErrorHasName(error, 'AbortError')) return 'aborted'
  if (status === 401) return 'authentication'
  if (status === 403) return 'policy'
  if (status === 429) return 'rate-limited'
  if (status === 408 || (status >= 500 && status <= 599)) return 'transport'
  if (structuredResponseIsNonApi(error)) return 'endpoint-misconfigured'
  if (messages.some((message) => [
    /^request failed: error sending request for url\b/iu,
    /^error sending request for url\b/iu,
    /^failed to fetch\.?$/iu,
    /^fetch failed\.?$/iu,
    /^network error(?:\b|:)/iu,
    /^connection (?:refused|reset|closed)(?:\b|:)/iu,
    /^dns error(?:\b|:)/iu,
  ].some((pattern) => pattern.test(message)))) return 'transport'
  if (messages.some((message) => [
    /^Provider returned (?:an HTML page|a non-API response)/u,
    /^Provider returned HTTP \d{3} instead of an API response/u,
  ].some((pattern) => pattern.test(message)))) return 'endpoint-misconfigured'
  if (messages.some((message) => [
    /^Invalid schema for response_format(?:\b|:)/iu,
    /^Structured tool output did not match the schema(?:\b|:)/iu,
    /^No object generated: response did not match schema(?:\b|:)/iu,
  ].some((pattern) => pattern.test(message)))) return 'schema-mismatch'
  if (messages.some((message) => [
    /^response_format is not supported\.?$/iu,
    /^structured output is not supported\.?$/iu,
  ].some((pattern) => pattern.test(message)))) return 'unsupported'
  if (messages.some((message) => [
    /^No output generated(?:\. Check the stream for errors\.)?$/iu,
    /^The model did not submit structured tool output\.?$/iu,
  ].some((pattern) => pattern.test(message)))) return 'output-missing'
  if (messages.some((message) => /^Invalid JSON response(?:\b|:)/iu.test(message))) {
    return 'invalid-json'
  }
  if (Number.isFinite(status) && status >= 400) return 'provider-rejected'
  return 'unknown'
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

function nativeStructuredProviderOptions(
  prepared: Extract<Prepared, { readonly messages: ModelMessage[] }>,
): ReasoningProviderOptions {
  if (
    prepared.wireProtocol !== 'chat-completions'
    && prepared.wireProtocol !== 'responses'
  ) return prepared.providerOptions

  // OpenAI strict JSON Schema rejects any Zod optional/default property because
  // every declared property must also appear in `required`. Compatible relays
  // differ here, while Cutout already validates the final value with Zod. Keep
  // the provider schema advisory and make the local schema the final authority.
  return {
    ...prepared.providerOptions,
    openai: {
      ...(prepared.providerOptions.openai ?? {}),
      strictJsonSchema: false,
    },
  }
}

export function createLocalGenerationService(
  providers: ConfigSource,
  prompts?: PromptSource,
  adapters:GenerationAdapterRegistry=createDefaultGenerationAdapterRegistry(),
): GenerationService {
  const structuredNativeUnsupported = new Set<string>()

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
      const failures: StructuredGenerationAttemptFailure[] = []
      if (!structuredNativeUnsupported.has(structuredKey)) {
        try {
          const result = aiStreamText({
            model: p.model,
            system: p.system,
            messages: p.messages,
            abortSignal: input.signal,
            maxOutputTokens: input.maxOutputTokens,
            providerOptions: nativeStructuredProviderOptions(p),
            output: Output.object({ schema }),
          })
          return ok(await result.output)
        } catch (error) {
          const category = structuredFailureCategory(error)
          failures.push({
            attempt: 'native-schema',
            category,
          })
          if (!shouldRetryStructuredFallback(category)) {
            return err(structuredGenerationFailureText(failures))
          }
          // Cache only a protocol-level unsupported response. A schema mismatch
          // is specific to that call and must not disable native structure for
          // every later schema on the same provider/model route.
          if (category === 'unsupported') {
            structuredNativeUnsupported.add(structuredKey)
          }
        }
      }

      try {
        return ok(await generateStructuredTool(p, input, schema))
      } catch (error) {
        const category = structuredFailureCategory(error)
        failures.push({
          attempt: 'forced-tool',
          category,
        })
        if (!shouldRetryStructuredFallback(category)) {
          return err(structuredGenerationFailureText(failures))
        }
      }
      let activeTextAttempt: Extract<
        StructuredGenerationAttempt,
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
        return err(structuredGenerationFailureText(failures))
      } catch (fallbackError) {
        failures.push({
          attempt: activeTextAttempt,
          category: structuredFailureCategory(fallbackError),
        })
        return err(structuredGenerationFailureText(failures))
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

      if (cfg.kind === 'xai' && !supportsXaiImageModel(modelId, 'image-generation')) {
        return err('xAI image generation requires an exact documented Imagine API model id.')
      }

      if (supportsNativeDashScopeImageTransport(cfg)) {
        if (instructionSourceCount(input) !== 1) {
          return err('provide exactly one of prompt, system, or promptRef')
        }
        if (input.input?.some((part) => part.type === 'image')) {
          return err('reference-conditioned DashScope output requires an image-edit route')
        }
        const chunks: string[] = []
        if (input.prompt !== undefined) chunks.push(input.prompt)
        if (input.system !== undefined) chunks.push(input.system)
        if (input.promptRef !== undefined) {
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
        }
        for (const part of input.input ?? []) {
          if (part.type === 'text') chunks.push(part.text)
        }
        const prompt = chunks.filter((chunk) => chunk.trim()).join('\n\n')
        if (!prompt) return err('no prompt text for image generation')
        try {
          const result = await invokeCancellableProxy<NativeImageResult>('ai_dashscope_image', {
            providerId: cfg.id,
            model: modelId,
            operation: 'generation',
            prompt,
            images: [],
            size: null,
          }, input.signal)
          const assets = result.images.map((image) => ({
            mediaType: image.mediaType,
            bytes: base64ToBytes(image.data),
          }))
          if (assets.length === 0) return err('The model returned no image.')
          return ok(assets)
        } catch (error) {
          if (input.signal?.aborted) return err('Operation aborted')
          return err(error instanceof Error ? error.message : String(error))
        }
      }

      // OpenAI-shaped image models (gpt-image / dall-e) are served by the IMAGES
      // endpoint, not /chat/completions. Call the proxied endpoint directly so
      // OpenAI-compatible relays that return URL-shaped image data don't fail
      // the AI SDK's stricter `b64_json` response schema.
      const wireProtocol = effectiveProviderWireProtocol(cfg)
      if (
        (supportsOpenAIImageEndpoints(cfg.kind) || cfg.kind === 'xai') &&
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
              ...(cfg.kind === 'xai' ? { response_format: 'b64_json' } : {}),
            }),
          }, input.signal)
          if (input.signal?.aborted) return err('Operation aborted')
          if (res.status < 200 || res.status >= 300) {
            const providerMessage = errorBodyMessage(res.body)
            return err(
              `images/generations failed: HTTP ${res.status}${providerMessage ? ` · ${providerMessage}` : res.body ? ` · ${snippet(res.body)}` : ''}`,
            )
          }
          return parseImageGenerationBody(
            res.body,
            cfg.kind === 'xai'
              ? { allowRemoteUrl: false, defaultMediaType: 'image/jpeg' }
              : undefined,
          )
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
        if (assets.length === 0) return err('The model returned no image.')
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
      if (supportsNativeDashScopeImageTransport(cfg)) {
        if (input.images.length === 0) {
          return err('at least one reference image is required')
        }
        try {
          const result = await invokeCancellableProxy<NativeImageResult>('ai_dashscope_image', {
            providerId: cfg.id,
            model: resolveModel(cfg.kind, cfg.defaultModel, input.model),
            operation: 'edit',
            prompt: input.prompt,
            images: input.images.map((bytes) => Array.from(bytes)),
            size: input.size ?? null,
          }, input.signal)
          const assets = result.images.map((image) => ({
            mediaType: image.mediaType,
            bytes: base64ToBytes(image.data),
          }))
          if (assets.length === 0) return err('The model returned no image.')
          return ok(assets)
        } catch (error) {
          if (input.signal?.aborted) return err('Operation aborted')
          return err(error instanceof Error ? error.message : String(error))
        }
      }
      if (cfg.kind === 'xai' && wireProtocol === 'chat-completions') {
        if (input.images.length === 0) {
          return err('at least one reference image is required')
        }
        if (
          input.images.length > XAI_MAX_REFERENCE_IMAGES
          || input.images.some((image) => image.byteLength > XAI_MAX_REFERENCE_BYTES)
          || input.images.reduce((total, image) => total + image.byteLength, 0)
            > XAI_MAX_TOTAL_REFERENCE_BYTES
        ) {
          return err('xAI image edit accepts up to three bounded reference images.')
        }
        const modelId = resolveModel(cfg.kind, cfg.defaultModel, input.model)
        if (!supportsXaiImageModel(modelId, 'image-edit')) {
          return err('xAI image edit requires an exact documented Imagine API model id.')
        }
        try {
          const baseUrl = apiBaseUrl(cfg.kind, cfg.baseUrl, wireProtocol)
          if (!baseUrl) return err('provider has no base URL for image edit')
          const references = input.images.map(xaiImageReference)
          const size = xaiEditSizeOptions(input.size, references.length > 1)
          const source = references.length === 1
            ? { image: references[0] }
            : { images: references }
          const res = await invokeCancellableProxy<ProxyResponse>('ai_proxy_request', {
            providerId: cfg.id,
            kind: cfg.kind,
            wireProtocol,
            url: `${baseUrl}/images/edits`,
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              model: modelId,
              prompt: input.prompt,
              n: 1,
              response_format: 'b64_json',
              ...source,
              ...size,
            }),
          }, input.signal)
          if (input.signal?.aborted) return err('Operation aborted')
          if (res.status < 200 || res.status >= 300) {
            const providerMessage = errorBodyMessage(res.body)
            return err(
              `images/edits failed: HTTP ${res.status}${providerMessage ? ` · ${providerMessage}` : res.body ? ` · ${snippet(res.body)}` : ''}`,
            )
          }
          return parseImageGenerationBody(res.body, {
            allowRemoteUrl: false,
            defaultMediaType: 'image/jpeg',
          })
        } catch (error) {
          if (input.signal?.aborted) return err('Operation aborted')
          return err(errorText(error))
        }
      }
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
