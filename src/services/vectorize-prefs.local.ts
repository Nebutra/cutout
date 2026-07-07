/**
 * Non-secret vectorization preferences.
 *
 * The Vectorizer.AI API Secret is stored separately in the OS keychain by Rust.
 * This store only remembers the API Id and default API mode.
 */
import { LazyStore } from '@tauri-apps/plugin-store'
import { z } from 'zod'

const STORE_FILE = 'settings.json'
const KEY = 'vectorize.prefs'

const store = new LazyStore(STORE_FILE)

const prefsSchema = z.object({
  apiId: z.string().default(''),
  apiMode: z.enum(['production', 'test']).default('test'),
})

export type VectorizePreferences = z.infer<typeof prefsSchema>

export const DEFAULT_VECTORIZE_PREFS: VectorizePreferences = {
  apiId: '',
  apiMode: 'test',
}

export async function loadVectorizePrefs(): Promise<VectorizePreferences> {
  try {
    const raw = await store.get<unknown>(KEY)
    return prefsSchema.parse(raw ?? DEFAULT_VECTORIZE_PREFS)
  } catch {
    return DEFAULT_VECTORIZE_PREFS
  }
}

async function saveVectorizePrefs(
  patch: Partial<VectorizePreferences>,
): Promise<VectorizePreferences> {
  const current = await loadVectorizePrefs()
  const next = prefsSchema.parse({ ...current, ...patch })
  await store.set(KEY, next)
  await store.save()
  return next
}

export function setVectorizerApiId(apiId: string): Promise<VectorizePreferences> {
  return saveVectorizePrefs({ apiId: apiId.trim() })
}

export function setVectorizerApiMode(
  apiMode: VectorizePreferences['apiMode'],
): Promise<VectorizePreferences> {
  return saveVectorizePrefs({ apiMode })
}
