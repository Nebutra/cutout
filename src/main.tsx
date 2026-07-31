import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { detectInitialLocale } from '@/i18n/detect'
import { activateLocale } from '@/i18n'

/**
 * Gate first paint on async locale detection (spec §4.1 / R1): detect + activate
 * BEFORE `createRoot().render()` so the UI never flashes the source locale on a
 * cold start. `detectInitialLocale` is guarded and never throws.
 */
async function bootstrap() {
  await activateLocale(await detectInitialLocale())

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )

  if (import.meta.env.VITE_CUTOUT_PACKAGED_E2E === '1') {
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
