/**
 * Animated locale switch (spec §4.1) — makes the live language toggle feel calm.
 *
 * The problem: a language change re-labels the whole UI at once, and Latin↔CJK
 * text differs in width AND font metrics, so a plain swap hard-cuts the layout.
 * The fix: perform the DOM swap inside a View Transition, so the browser
 * cross-fades between the two language states instead of jumping.
 *
 * The catalog import is async, so it is loaded BEFORE the transition; only the
 * synchronous swap runs inside the callback. `flushSync` forces Lingui's
 * re-render to commit within that callback — otherwise React would commit after
 * the browser snapshots the "new" state and the fade would capture stale text.
 *
 * Progressive enhancement: feature-detected, and the fade duration honours
 * `prefers-reduced-motion` via CSS (`src/index.css`). Where View Transitions are
 * unsupported it falls back to the same instant swap as before.
 */
import { flushSync } from 'react-dom'
import { i18n } from '@lingui/core'
import { applyLocale, loadLocaleMessages } from './index'
import { persistLocale } from './detect'
import type { Locale } from './config'

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => { finished: Promise<void> }
}

export async function switchLocale(locale: Locale): Promise<void> {
  if (locale === i18n.locale) return

  const messages = await loadLocaleMessages(locale)
  const swap = () => flushSync(() => applyLocale(locale, messages))

  const doc = document as ViewTransitionDocument
  if (typeof doc.startViewTransition === 'function') {
    // `.finished` rejects if the transition is skipped (e.g. rapid re-toggle);
    // the swap still applied, so swallow it.
    await doc.startViewTransition(swap).finished.catch(() => {})
  } else {
    swap()
  }

  await persistLocale(locale)
}
