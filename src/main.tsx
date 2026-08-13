import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import './index.css'
import App from './App.tsx'
import { detectInitialLocale } from '@/i18n/detect'
import { activateLocale } from '@/i18n'

function assertPackagedE2eProbeSurface() {
  const surface = document.getElementById('root')
  const bounds = surface?.getBoundingClientRect()
  if (
    !surface
    || !bounds
    || bounds.width < 100
    || bounds.height < 100
  ) {
    throw new Error('packaged-e2e-window-probe-surface-unavailable')
  }
}

let packagedE2eRenderError: unknown

/**
 * Gate first paint on async locale detection (spec §4.1 / R1): detect + activate
 * BEFORE `createRoot().render()` so the UI never flashes the source locale on a
 * cold start. `detectInitialLocale` is guarded and never throws.
 */
async function bootstrap() {
  await activateLocale(await detectInitialLocale())

  const rootElement = document.getElementById('root')!
  const root = createRoot(rootElement, import.meta.env.VITE_CUTOUT_PACKAGED_E2E === '1'
    ? {
        onUncaughtError(error) {
          packagedE2eRenderError = error
          const diagnostic = document.createElement('pre')
          diagnostic.dataset.packagedE2eRenderError = 'true'
          diagnostic.style.cssText = 'margin:24px;padding:24px;color:#991b1b;background:#fff;font:16px/1.5 monospace;white-space:pre-wrap'
          diagnostic.textContent = error instanceof Error
            ? error.message.slice(0, 1_000)
            : String(error).slice(0, 1_000)
          rootElement.replaceChildren(diagnostic)
        },
      }
    : undefined)
  const app = (
    <StrictMode>
      <App />
    </StrictMode>
  )
  if (import.meta.env.VITE_CUTOUT_PACKAGED_E2E === '1') {
    // A background WKWebView may throttle the scheduler before its first timer.
    // Commit the isolated harness synchronously so liveness never depends on a
    // foreground paint or on a timer that requires the first commit to resume.
    flushSync(() => root.render(app))
  } else {
    root.render(app)
  }

  if (import.meta.env.VITE_CUTOUT_PACKAGED_E2E === '1') {
    const { invoke } = await import('@tauri-apps/api/core')
    const mode = await invoke<{ windowProbe: boolean }>('packaged_e2e_mode')
    if (mode.windowProbe) {
      await invoke('packaged_e2e_checkpoint', {
        phases: [{ id: 'window-probe-react-scheduled', status: 'passed', elapsedMs: 0 }],
      })
      try {
        await invoke('packaged_e2e_tick')
        assertPackagedE2eProbeSurface()
      } catch {
        await invoke('packaged_e2e_checkpoint', {
          phases: [{ id: 'window-probe-surface-failed', status: 'failed', elapsedMs: 0 }],
        })
        return
      }
      await invoke('packaged_e2e_checkpoint', {
        phases: [{ id: 'window-probe-surface-ready', status: 'passed', elapsedMs: 0 }],
      })
      if (packagedE2eRenderError) {
        await invoke('packaged_e2e_capture_window', { id: 'design-systems' })
        await invoke('packaged_e2e_checkpoint', {
          phases: [{ id: 'window-probe-react-failed', status: 'failed', elapsedMs: 0 }],
        })
        return
      }
      await invoke('packaged_e2e_capture_window', { id: 'design-systems' })
      await invoke('packaged_e2e_checkpoint', {
        phases: [{ id: 'window-probe-ready', status: 'passed', elapsedMs: 0 }],
      })
      return
    }
    const { runPackagedE2e } = await import('@/packaged-e2e/runner')
    await runPackagedE2e()
    return
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  const internals = (window as Window & {
    __TAURI_INTERNALS__?: {
      invoke?: unknown
      metadata?: { currentWindow?: { label?: unknown } }
    }
  }).__TAURI_INTERNALS__
  const currentWindowLabel = internals?.metadata?.currentWindow?.label
  if (typeof internals?.invoke === 'function' && typeof currentWindowLabel === 'string') {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().show()
  }
}

void bootstrap()
