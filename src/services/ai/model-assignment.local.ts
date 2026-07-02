/**
 * Model-assignment persistence (design spec §5a) — via the managed JSON store.
 *
 * Stored under `ai.modelAssignments` in the shared `settings.json`
 * (`@tauri-apps/plugin-store`), the same store i18n uses for the locale choice.
 * Non-secret. Reads are validated so a corrupt/absent blob degrades to `{}`
 * rather than throwing; outside a Tauri runtime (Vitest, plain browser) the
 * guarded calls simply yield `{}`.
 */
import { LazyStore } from '@tauri-apps/plugin-store'
import {
  modelAssignmentsSchema,
  type ModelAssignment,
  type ModelAssignments,
  type SlotId,
} from './model-assignment-types'

const STORE_FILE = 'settings.json'
const KEY = 'ai.modelAssignments'

const store = new LazyStore(STORE_FILE)

/** Load the assignment table. Missing/invalid/unavailable → `{}`. */
export async function loadAssignments(): Promise<ModelAssignments> {
  try {
    const raw = await store.get<unknown>(KEY)
    if (raw == null) return {}
    const parsed = modelAssignmentsSchema.safeParse(raw)
    return parsed.success ? parsed.data : {}
  } catch {
    return {}
  }
}

/** Assign a model to a slot; persists and returns the updated table. */
export async function setAssignment(
  slot: SlotId,
  assignment: ModelAssignment,
): Promise<ModelAssignments> {
  const current = await loadAssignments()
  const next: ModelAssignments = { ...current, [slot]: assignment }
  await store.set(KEY, next)
  await store.save()
  return next
}

/** Clear a slot; persists and returns the updated table. */
export async function clearAssignment(slot: SlotId): Promise<ModelAssignments> {
  const current = await loadAssignments()
  const next: ModelAssignments = { ...current }
  delete next[slot]
  await store.set(KEY, next)
  await store.save()
  return next
}
