import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const nativeEntry = readFileSync(
  resolve(process.cwd(), 'src-tauri/src/lib.rs'),
  'utf8',
)

describe('packaged E2E macOS window lifecycle', () => {
  it('renders without allowing the dedicated test window to focus', () => {
    const guard = nativeEntry.indexOf('if commands::packaged_e2e::enabled()')
    const migration = nativeEntry.indexOf('// Migrate the retired plaintext store')
    const lifecycle = nativeEntry.slice(guard, migration)

    expect(guard).toBeGreaterThan(0)
    expect(lifecycle).toContain('ActivationPolicy::Accessory')
    expect(lifecycle).toContain('unhideWithoutActivation()')
    expect(lifecycle).toContain('NSActivityOptions::UserInitiatedAllowingIdleSystemSleep')
    expect(lifecycle).toContain('window.set_focusable(false)?')
    expect(lifecycle).toContain('window.show()?')
    expect(lifecycle).toContain('!window.is_visible()? || window.is_focused()?')
    expect(lifecycle).toContain('native_checkpoint("webview-renderable")')
    expect(nativeEntry.slice(migration)).not.toContain('window.show()?')
    expect(nativeEntry.slice(migration)).not.toContain('unhideWithoutActivation()')
  })
})
