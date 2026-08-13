import { tauriBridge, type NativeBridge } from './native'

const MAX_DEADLINE_MS = 10 * 60 * 1_000

export interface MonotonicDeadline {
  /** `true` means elapsed; `false` means the owner canceled the handle. */
  readonly elapsed: Promise<boolean>
  cancel(): void
}

function hasNativeTauriRuntime(): boolean {
  const internals = (globalThis as typeof globalThis & {
    __TAURI_INTERNALS__?: { invoke?: unknown }
  }).__TAURI_INTERNALS__
  return typeof internals?.invoke === 'function'
}

export function createMonotonicDeadline(
  timeoutMs: number,
  bridge: Pick<
    NativeBridge,
    'waitForMonotonicDeadline' | 'cancelMonotonicDeadline'
  > = tauriBridge,
): MonotonicDeadline {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_DEADLINE_MS) {
    throw new Error('Monotonic deadline is outside the reviewed duration bound.')
  }

  let settled = false
  let nativeDeadlineId: string | undefined
  let settle!: (elapsed: boolean) => void
  let browserTimer: ReturnType<typeof globalThis.setTimeout> | undefined
  const elapsed = new Promise<boolean>((resolve) => {
    settle = resolve
  })
  const complete = (value: boolean) => {
    if (settled) return
    settled = true
    if (browserTimer !== undefined) globalThis.clearTimeout(browserTimer)
    settle(value)
  }
  const startBrowserFallback = () => {
    if (settled) return
    browserTimer = globalThis.setTimeout(() => complete(true), timeoutMs)
  }

  if (hasNativeTauriRuntime()) {
    if (bridge.waitForMonotonicDeadline && bridge.cancelMonotonicDeadline) {
      nativeDeadlineId = crypto.randomUUID()
      void bridge.waitForMonotonicDeadline(nativeDeadlineId, timeoutMs).then(
        () => complete(true),
        () => complete(true),
      )
    } else {
      complete(true)
    }
  } else {
    startBrowserFallback()
  }

  return {
    elapsed,
    cancel: () => {
      if (settled) return
      complete(false)
      if (nativeDeadlineId && bridge.cancelMonotonicDeadline) {
        void bridge.cancelMonotonicDeadline(nativeDeadlineId).catch(() => {})
      }
    },
  }
}
