export function hasNativeDesktopHost(): boolean {
  const internals = (globalThis as typeof globalThis & {
    __TAURI_INTERNALS__?: { invoke?: unknown }
  }).__TAURI_INTERNALS__
  return typeof internals?.invoke === 'function'
}
