/**
 * Test-only: a real `GenerationService` wired to a live OpenAI-compatible
 * gateway (MOX) instead of the Tauri Rust proxy — the seam that lets the
 * gated pipeline/integration tests exercise real model + real image
 * generation from Node/jsdom, outside the desktop app.
 *
 * Divergence is kept minimal on purpose: text methods (`generateText`,
 * `streamText`, `generateObject`, `generateWithTools`) are the REAL
 * `createLocalGenerationService` — the only thing swapped is the model
 * adapter, which builds an `@ai-sdk/openai` model over the global `fetch`
 * pointed at the gateway (the app uses the same code path, only its adapter's
 * `fetch` is `tauriFetch`). So all message-building, structured-output
 * fallbacks, and tool wiring are the shipping code, not a reimplementation.
 *
 * Only the two methods the shipping service routes through Tauri `invoke`
 * (`generateImages` → `POST /images/generations`, `editImage` → multipart
 * `POST /images/edits`) are reimplemented here as direct `fetch` calls —
 * byte-identical to what the Rust `ai_proxy_request`/`ai_image_edit` commands
 * send (the Rust side is a transparent forwarder, verified against the wire
 * contract). `research` (hardcoded to `tauriFetch`) is overridden to degrade,
 * matching the pipeline's best-effort grounding when web search is off.
 *
 * NOT imported by application code — only by gated `*.integration.test.ts` /
 * `*.e2e.test.tsx` files that set the opt-in env var.
 */
import { createLocalGenerationService } from './generation-service.local'
import { createLocalPromptService } from './prompt-service.local'
import { GenerationAdapterRegistry } from './provider-adapter-registry'
import { ok, err, type Result } from '@/services/types'
import type { ProviderConfig } from './provider-types'
import type {
  EditImageInput,
  GeneratedAsset,
  GenerateInput,
  GenerationService,
} from './types'

export const GATEWAY_PROVIDER_ID = 'mox-gateway'
export const GATEWAY_CHAT_MODEL = 'gpt-5.5'
export const GATEWAY_IMAGE_MODEL = 'gpt-image-1'

/** Normalize a base URL to include a version path (mirrors the existing integration tests). */
export function apiBase(value: string): string {
  const parsed = new URL(value)
  if (!parsed.pathname || parsed.pathname === '/') parsed.pathname = '/v1'
  return parsed.toString().replace(/\/$/, '')
}

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(b64, 'base64'))
}

/** A single-provider config source — the gateway masquerading as an `openai` provider. */
function gatewayProviders(base: string) {
  const config: ProviderConfig = {
    id: GATEWAY_PROVIDER_ID,
    kind: 'openai',
    label: 'MOX gateway',
    baseUrl: base,
    defaultModel: GATEWAY_CHAT_MODEL,
    enabled: true,
  }
  return { list: async (): Promise<ProviderConfig[]> => [config] }
}

/** Same 'openai' adapter the app uses, but over the global fetch pointed at the gateway. */
function gatewayAdapters(key: string, base: string): GenerationAdapterRegistry {
  return new GenerationAdapterRegistry([
    {
      kind: 'openai',
      policy: () => ({
        auth: 'rust-keychain-proxy',
        headerStrategy: 'provider-default',
        baseURL: base,
      }),
      async createModel(_config, modelId) {
        const { createOpenAI } = await import('@ai-sdk/openai')
        return createOpenAI({ apiKey: key, baseURL: base })(modelId)
      },
    },
  ])
}

function parseImageItems(body: string): Result<GeneratedAsset[]> {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return err(`Image endpoint did not return JSON: ${body.slice(0, 200)}`)
  }
  const record = parsed as { data?: Array<{ b64_json?: string; b64?: string }> ; error?: { message?: string } }
  if (record.error?.message) return err(record.error.message)
  const data = Array.isArray(record.data) ? record.data : []
  const assets: GeneratedAsset[] = []
  for (const item of data) {
    const b64 = item.b64_json ?? item.b64
    if (typeof b64 === 'string' && b64.length > 0) {
      assets.push({ mediaType: 'image/png', bytes: base64ToBytes(b64) })
    }
  }
  return assets.length > 0 ? ok(assets) : err(`Image endpoint returned no usable image data: ${body.slice(0, 200)}`)
}

/** Byte-identical to what Rust `ai_proxy_request` forwards for `POST /images/generations`. */
async function directGenerateImages(
  key: string,
  base: string,
  input: GenerateInput,
): Promise<Result<GeneratedAsset[]>> {
  if (input.signal?.aborted) return err('Operation aborted')
  try {
    const res = await fetch(`${base}/images/generations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: input.model ?? GATEWAY_IMAGE_MODEL,
        prompt: input.prompt ?? '',
        n: 1,
        // `low` quality keeps the gated test fast and cheap — the test proves
        // the pipeline delivers artifacts, not print-quality images.
        quality: 'low',
        size: '1024x1024',
      }),
      signal: input.signal,
    })
    return parseImageItems(await res.text())
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error))
  }
}

/**
 * Byte-identical to what Rust `ai_image_edit` sends for multipart
 * `POST /images/edits`. The multipart body is assembled by hand as a Buffer
 * (not `FormData`) because a jsdom-realm `FormData`/`Blob` does not serialize
 * correctly through Node's fetch — the gateway rejects it with "failed to
 * parse request body". A hand-built body with an explicit boundary is
 * environment-independent.
 */
async function directEditImage(
  key: string,
  base: string,
  input: EditImageInput,
): Promise<Result<GeneratedAsset[]>> {
  if (input.signal?.aborted) return err('Operation aborted')
  try {
    const boundary = '----cutout-gateway-boundary-3f7a1c9e'
    const field = (name: string, value: string): Buffer =>
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
        'utf8',
      )
    const parts: Buffer[] = [
      field('model', input.model ?? GATEWAY_IMAGE_MODEL),
      field('prompt', input.prompt),
      field('input_fidelity', input.inputFidelity ?? 'high'),
      // `low` quality keeps the gated test fast and cheap (see generateImages).
      field('quality', 'low'),
      field('size', input.size ?? '1024x1024'),
    ]
    // Field name is literally `image`, repeated once per reference (NOT `image[]`).
    input.images.forEach((bytes, index) => {
      parts.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="reference-${index}.png"\r\nContent-Type: image/png\r\n\r\n`,
          'utf8',
        ),
        Buffer.from(bytes),
        Buffer.from('\r\n', 'utf8'),
      )
    })
    parts.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'))
    const body = Buffer.concat(parts)
    const res = await fetch(`${base}/images/edits`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      body: new Uint8Array(body),
      signal: input.signal,
    })
    return parseImageItems(await res.text())
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error))
  }
}

/**
 * A `GenerationService` backed by the live gateway. `key`/`base` come from
 * `MOX_API_KEY` / `apiBase(MOX_BASE_URL)`.
 */
export function createGatewayGenerationService(key: string, base: string): GenerationService {
  const real = createLocalGenerationService(
    gatewayProviders(base),
    createLocalPromptService(),
    gatewayAdapters(key, base),
  )
  return {
    ...real,
    generateImages: (input) => directGenerateImages(key, base, input),
    editImage: (input) => directEditImage(key, base, input),
    // Provider-native web search is hardcoded to tauriFetch in the shipping
    // service; the pipeline treats grounding as best-effort, so degrade
    // cleanly rather than touch Tauri.
    research: async () => err('web grounding disabled in the gateway generation service'),
  }
}
