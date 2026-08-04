const MAX_DISPLAY_ERROR_LENGTH = 500
const DISPLAY_ERROR_FIELDS = ['message', 'error', 'detail', 'code'] as const
const OBJECT_STRING = /\[object [^\]]+\]/
const CREDENTIAL = /(?:\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b|\bBearer\s+[A-Za-z0-9._~+/-]+\b|(?:api[-_]?key|token|secret|authorization)\s*[:=]\s*[^\s,;]+)/i

export const UNKNOWN_AI_ERROR_MESSAGE = 'The AI operation could not be completed.'

function hasUnsafeControl(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0)
    return code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127
  })
}

function boundedDisplayString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const candidate = value.trim()
  if (
    candidate.length === 0
    || candidate.length > MAX_DISPLAY_ERROR_LENGTH
    || OBJECT_STRING.test(candidate)
    || hasUnsafeControl(candidate)
    || CREDENTIAL.test(candidate)
  ) return undefined
  return candidate
}

export function aiDisplayErrorMessage(error: unknown): string {
  const direct = boundedDisplayString(error)
  if (direct) return direct
  if (!error || typeof error !== 'object') return UNKNOWN_AI_ERROR_MESSAGE

  try {
    for (const field of DISPLAY_ERROR_FIELDS) {
      const descriptor = Object.getOwnPropertyDescriptor(error, field)
      const candidate = boundedDisplayString(descriptor?.value)
      if (candidate) return candidate
    }
  } catch {
    // Proxies and accessor-only objects are not trusted display payloads.
  }
  return UNKNOWN_AI_ERROR_MESSAGE
}
