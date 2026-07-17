export interface ConsumedComposerDraft {
  readonly submitted: string | null
  readonly nextValue: string
}

/**
 * Captures one user turn without keeping the committed message in the editor.
 * The canonical project brief is updated by the caller after this snapshot.
 */
export function consumeComposerDraft(value: string): ConsumedComposerDraft {
  const submitted = value.trim()
  return submitted
    ? { submitted, nextValue: '' }
    : { submitted: null, nextValue: value }
}
