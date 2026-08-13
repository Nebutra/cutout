/**
 * Capability-binding persistence via the managed non-secret JSON store.
 *
 * Only `ai.capabilityBindings` is authoritative. Invalid or absent data starts
 * with an empty current binding set; no alternate store or browser state is
 * interpreted.
 */
import { LazyStore } from '@tauri-apps/plugin-store'
import { hasNativeDesktopHost } from '@/platform/runtime'
import {
  type ModelAssignment,
  type ModelAssignments,
  type SlotId,
} from './model-assignment-types'
import {
  capabilityBindingsSchema,
  projectPrimaryAssignments,
  type CapabilityBindings,
  type ModelTaskKind,
} from './model-capabilities'

const STORE_FILE = 'settings.json'
const BINDINGS_KEY = 'ai.capabilityBindings'
const emptyBindings = (): CapabilityBindings => capabilityBindingsSchema.parse({
  version: 'model-assignments.v2',
  bindings: {},
  descriptors: [],
})

const store = new LazyStore(STORE_FILE)

interface BindingsStore {
  get<T>(key: string): Promise<T | undefined>
  set(key: string, value: unknown): Promise<unknown>
  save(): Promise<unknown>
}

export function createCapabilityBindingsRepository(host: BindingsStore) {
  const load = async (): Promise<CapabilityBindings> => {
    const current = capabilityBindingsSchema.safeParse(
      await host.get(BINDINGS_KEY),
    )
    return current.success ? current.data : emptyBindings()
  }

  const write = async (value: CapabilityBindings) => {
    const parsed = capabilityBindingsSchema.parse(value)
    await host.set(BINDINGS_KEY, parsed)
    await host.save()
    return parsed
  }

  return {
    load,
    write,
    async set(task: ModelTaskKind, assignment: ModelAssignment) {
      const current = await load()
      return write({
        ...current,
        bindings: { ...current.bindings, [task]: assignment },
      })
    },
    async clear(task: ModelTaskKind) {
      const current = await load()
      const bindings = { ...current.bindings }
      delete bindings[task]
      return write({ ...current, bindings })
    },
    async primary() {
      return projectPrimaryAssignments(await load())
    },
  }
}

const bindingsRepository = createCapabilityBindingsRepository(store)

export const loadCapabilityBindings = () => bindingsRepository.load()
export const loadRuntimeCapabilityBindings = (
  browserProjection?: CapabilityBindings,
) => hasNativeDesktopHost()
  ? bindingsRepository.load()
  : Promise.resolve(browserProjection ?? emptyBindings())
export const setCapabilityBinding = (
  task: ModelTaskKind,
  assignment: ModelAssignment,
) => bindingsRepository.set(task, assignment)
export const clearCapabilityBinding = (task: ModelTaskKind) =>
  bindingsRepository.clear(task)
export const setCapabilityDescriptors = async (
  descriptors: CapabilityBindings['descriptors'],
) =>
  bindingsRepository.write({
    ...(await bindingsRepository.load()),
    descriptors,
  })

/** Load the primary assignment projection. Missing/invalid/unavailable → `{}`. */
export async function loadAssignments(): Promise<ModelAssignments> {
  try {
    return await bindingsRepository.primary()
  } catch {
    return {}
  }
}

/** Assign a model to the tasks represented by a primary UI slot. */
export async function setAssignment(
  slot: SlotId,
  assignment: ModelAssignment,
): Promise<ModelAssignments> {
  const current = await bindingsRepository.load()
  const bindings = { ...current.bindings }
  if (slot === 'chat') {
    bindings.text = assignment
    bindings.vision = assignment
  } else {
    bindings['image-generation'] = assignment
    bindings['image-edit'] = assignment
  }
  return projectPrimaryAssignments(
    await bindingsRepository.write({ ...current, bindings }),
  )
}

/** Clear only the tasks represented by a primary UI slot. */
export async function clearAssignment(slot: SlotId): Promise<ModelAssignments> {
  const current = await bindingsRepository.load()
  const bindings = { ...current.bindings }
  if (slot === 'chat') {
    delete bindings.text
    delete bindings.vision
  } else {
    delete bindings['image-generation']
    delete bindings['image-edit']
  }
  return projectPrimaryAssignments(
    await bindingsRepository.write({ ...current, bindings }),
  )
}
