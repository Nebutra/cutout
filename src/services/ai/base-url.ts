import type { ProviderKind } from './provider-types'

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '')
}

function isOpenAIShaped(kind: ProviderKind): boolean {
  return kind === 'openai' || OPENAI_COMPATIBLE_KINDS.has(kind)
}

const OPENAI_COMPATIBLE_KINDS = new Set([
  'openai-compatible','dashscope','deepseek','zhipu','moonshot','volcengine',
  'siliconflow','openrouter','together','groq','fireworks','xai','mistral',
  'ollama','vllm','lm-studio',
])

/**
 * OpenAI-compatible SDKs expect `baseURL` to be the API prefix, normally `/v1`.
 * Many gateway consoles are shared with the API host, so users naturally paste
 * the root origin. Treat a pathless OpenAI-shaped URL as `{origin}/v1`.
 */
export function apiBaseUrl(
  kind: ProviderKind,
  baseUrl: string | undefined,
): string | undefined {
  if (!baseUrl) return undefined
  const trimmed = trimTrailingSlashes(baseUrl.trim())
  if (!isOpenAIShaped(kind)) return trimmed

  try {
    const parsed = new URL(trimmed)
    const path = trimTrailingSlashes(parsed.pathname)
    if (path === '') {
      parsed.pathname = '/v1'
      parsed.search = ''
      parsed.hash = ''
      return trimTrailingSlashes(parsed.toString())
    }
  } catch {
    return trimmed
  }

  return trimmed
}
