export interface LiveTextBatcher {
  readonly append: (delta: string) => void
  readonly flush: () => string
}

export interface CollectedLiveText {
  readonly text: string
  readonly usedBufferedFallback: boolean
}

/** Legacy workspace.v1 may contain a partial stream; it is never replayed. */
export function restoreLiveAgentOutput(_persisted: string | undefined): string {
  return ''
}

/** Collects one conversational stream without turning provider fallback into a second turn. */
export async function collectLiveText(
  stream: AsyncIterable<string>,
  fallback: string,
  batcher: LiveTextBatcher,
  checkpoint: () => void,
  cancelled: () => boolean,
): Promise<CollectedLiveText> {
  let streamed = ''
  try {
    for await (const delta of stream) {
      checkpoint()
      streamed += delta
      batcher.append(delta)
    }
    batcher.flush()
    return { text: streamed.trim() || fallback, usedBufferedFallback: false }
  } catch (error) {
    batcher.flush()
    if (cancelled()) throw error
    return { text: fallback, usedBufferedFallback: true }
  }
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
