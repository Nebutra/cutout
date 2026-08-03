export interface BoundedTextGenerationResult {
  readonly text: string | null
  readonly failure: 'deadline' | 'generation' | null
  readonly detail?: string
}

export async function collectBoundedGeneratedText(input: {
  readonly parentSignal: AbortSignal
  readonly timeoutMs: number
  readonly stream: (signal: AbortSignal) => AsyncIterable<string>
  readonly generate: (
    signal: AbortSignal,
  ) => Promise<{ readonly ok: true; readonly data: string } | { readonly ok: false; readonly error: string }>
  readonly onDelta?: () => void
}): Promise<BoundedTextGenerationResult> {
  const controller = new AbortController()
  let deadlineExpired = false
  const abortFromParent = () => controller.abort(input.parentSignal.reason)
  if (input.parentSignal.aborted) abortFromParent()
  else input.parentSignal.addEventListener('abort', abortFromParent, { once: true })
  const timer = globalThis.setTimeout(() => {
    deadlineExpired = true
    controller.abort(new DOMException('Generation deadline exceeded.', 'TimeoutError'))
  }, input.timeoutMs)

  try {
    let text = ''
    try {
      for await (const delta of input.stream(controller.signal)) {
        input.onDelta?.()
        text += delta
      }
      return { text, failure: null }
    } catch (error) {
      if (input.parentSignal.aborted) {
        throw input.parentSignal.reason ?? error
      }
      if (deadlineExpired) return { text: null, failure: 'deadline' }
      const buffered = await input.generate(controller.signal)
      if (input.parentSignal.aborted) {
        throw input.parentSignal.reason ?? new DOMException('Generation aborted.', 'AbortError')
      }
      if (deadlineExpired) return { text: null, failure: 'deadline' }
      return buffered.ok
        ? { text: buffered.data, failure: null }
        : { text: null, failure: 'generation', detail: buffered.error }
    }
  } finally {
    globalThis.clearTimeout(timer)
    input.parentSignal.removeEventListener('abort', abortFromParent)
  }
}
