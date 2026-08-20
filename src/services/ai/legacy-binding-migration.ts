/**
 * One-time migration off the pre-three-layer `ProviderConfig.defaultModel`.
 *
 * Before the split, a connection carried a model and the runtime fell back to
 * it. Removing that fallback would silently un-route anyone who had configured
 * a provider but never opened the manual bindings — their calls resolved
 * through `defaultModel` alone. So on first launch after the upgrade, an empty
 * binding table is seeded from the first enabled connection that still carries
 * a legacy model.
 *
 * Only `text` is seeded. A legacy `defaultModel` proves nothing about image
 * capability, and guessing an image route from it is exactly the conflation
 * this refactor removes; image routing is left to automatic setup, which has
 * capability evidence.
 */
import { LazyStore } from '@tauri-apps/plugin-store'
import { hasNativeDesktopHost } from '@/platform/runtime'
import type { CapabilityBindings } from './model-capabilities'
import type { ProviderConfig } from './provider-types'
import { loadCapabilityBindings, setCapabilityBinding } from './model-assignment.local'

const STORE_FILE = 'settings.json'
export const LEGACY_BINDING_MIGRATION_KEY = 'ai.legacyBindingMigration.v1'

/**
 * The `text` assignment a legacy install implies, or `undefined` when there is
 * nothing to migrate (bindings already exist, or no connection carries a
 * legacy model).
 */
export function seedBindingsFromLegacyProviders(
  providers: readonly ProviderConfig[],
  bindings: CapabilityBindings['bindings'] | undefined,
): { readonly providerId: string; readonly model: string } | undefined {
  if (bindings && Object.keys(bindings).length > 0) return undefined
  const legacy = providers.find(
    (provider) => provider.enabled && provider.defaultModel?.trim(),
  )
  if (!legacy) return undefined
  return { providerId: legacy.id, model: legacy.defaultModel!.trim() }
}

interface MigrationStore {
  get<T>(key: string): Promise<T | undefined>
  set(key: string, value: unknown): Promise<unknown>
  save(): Promise<unknown>
}

/**
 * Run the migration at most once per install. Idempotent: the guard key is
 * written whether or not anything was seeded, so a user who later clears their
 * bindings on purpose does not get them resurrected.
 */
export async function migrateLegacyBindings(
  providers: readonly ProviderConfig[],
  host: MigrationStore = new LazyStore(STORE_FILE),
): Promise<boolean> {
  if (await host.get<boolean>(LEGACY_BINDING_MIGRATION_KEY)) return false
  const current = await loadCapabilityBindings()
  const seed = seedBindingsFromLegacyProviders(providers, current.bindings)
  if (seed) await setCapabilityBinding('text', seed)
  await host.set(LEGACY_BINDING_MIGRATION_KEY, true)
  await host.save()
  return seed !== undefined
}

/** Desktop-only: the browser build has no `providers.json` to migrate from. */
export async function migrateLegacyBindingsIfDesktop(
  providers: readonly ProviderConfig[],
): Promise<boolean> {
  return hasNativeDesktopHost() ? migrateLegacyBindings(providers) : false
}
