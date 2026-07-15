import { flushSync } from 'react-dom'

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => { finished: Promise<void> }
}

/**
 * Run a synchronous state update inside a View Transition so the browser
 * cross-fades between the before/after DOM instead of hard-cutting — used for
 * in-app navigation (e.g. Home section switches) so it reads as "adapting"
 * rather than a page reload. Falls back to a plain synchronous update where
 * View Transitions are unsupported. The fade duration/curve is themed
 * globally in `index.css` (`::view-transition-old/new(root)`) and honours
 * `prefers-reduced-motion` — see `src/i18n/switch.ts` for the sibling use.
 */
export function withViewTransition(update: () => void): void {
  const doc = document as ViewTransitionDocument
  if (typeof doc.startViewTransition !== 'function') {
    update()
    return
  }
  doc.startViewTransition(() => flushSync(update)).finished.catch(() => {})
}
