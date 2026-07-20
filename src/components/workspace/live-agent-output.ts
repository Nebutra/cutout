export interface LiveTextBatcher {
  readonly append: (delta: string) => void
  readonly flush: () => string
}

/** Accumulates every provider delta while limiting visible React updates to one per frame. */
export function createLiveTextBatcher(
  publish: (text: string) => void,
  schedule: (callback: FrameRequestCallback) => number = requestAnimationFrame,
  cancel: (handle: number) => void = cancelAnimationFrame,
): LiveTextBatcher {
  let text = ''
  let pendingFrame: number | null = null
  const publishPending = () => {
    pendingFrame = null
    publish(text)
  }
  return {
    append(delta) {
      text += delta
      if (pendingFrame === null) pendingFrame = schedule(publishPending)
    },
    flush() {
      if (pendingFrame !== null) {
        cancel(pendingFrame)
        pendingFrame = null
      }
      publish(text)
      return text
    },
  }
}
