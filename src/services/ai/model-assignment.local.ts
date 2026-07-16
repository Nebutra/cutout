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
  type ModelAssignment,
  type ModelAssignments,
  type SlotId,
} from './model-assignment-types'
import { capabilityBindingsSchema, mergeLegacyRouteBindings, migrateLegacyAssignments, projectLegacyAssignments, type CapabilityBindings, type ModelTaskKind } from './model-capabilities'

const STORE_FILE = 'settings.json'
const KEY = 'ai.modelAssignments'
const BINDINGS_KEY = 'ai.capabilityBindings'
const LEGACY_ROUTE_KEY = 'cutout.model-routing.v1'

const store = new LazyStore(STORE_FILE)
interface BindingsStore{get<T>(key:string):Promise<T|undefined>;set(key:string,value:unknown):Promise<unknown>;save():Promise<unknown>}
export function createCapabilityBindingsRepository(host:BindingsStore,readLegacyRoutes:()=>unknown=()=>{try{return JSON.parse(globalThis.localStorage?.getItem(LEGACY_ROUTE_KEY)??'null')}catch{return undefined}}){
  const load=async():Promise<CapabilityBindings>=>{const current=capabilityBindingsSchema.safeParse(await host.get(BINDINGS_KEY));if(current.success)return current.data;const legacyRaw=await host.get(KEY),legacy=(await import('./model-assignment-types')).modelAssignmentsSchema.safeParse(legacyRaw),migrated=mergeLegacyRouteBindings(migrateLegacyAssignments(legacy.success?legacy.data:{}),readLegacyRoutes());if(legacy.success||Object.keys(migrated.bindings).length){await host.set(BINDINGS_KEY,migrated);await host.save()}return migrated}
  const write=async(value:CapabilityBindings)=>{const parsed=capabilityBindingsSchema.parse(value);await host.set(BINDINGS_KEY,parsed);await host.save();return parsed}
  return{load,write,async set(task:ModelTaskKind,assignment:ModelAssignment){const current=await load();return write({...current,bindings:{...current.bindings,[task]:assignment}})},async clear(task:ModelTaskKind){const current=await load(),bindings={...current.bindings};delete bindings[task];return write({...current,bindings})},async legacy(){return projectLegacyAssignments(await load())}}
}
const bindingsRepository=createCapabilityBindingsRepository(store)

export const loadCapabilityBindings=()=>bindingsRepository.load()
export const setCapabilityBinding=(task:ModelTaskKind,assignment:ModelAssignment)=>bindingsRepository.set(task,assignment)
export const clearCapabilityBinding=(task:ModelTaskKind)=>bindingsRepository.clear(task)

/** Load the assignment table. Missing/invalid/unavailable → `{}`. */
export async function loadAssignments(): Promise<ModelAssignments> {
  try {
    return await bindingsRepository.legacy()
  } catch {
    return {}
  }
}

/** Assign a model to a slot; persists and returns the updated table. */
export async function setAssignment(
  slot: SlotId,
  assignment: ModelAssignment,
): Promise<ModelAssignments> {
  if(slot==='chat'){await bindingsRepository.set('text',assignment);await bindingsRepository.set('vision',assignment)}else{await bindingsRepository.set('image-generation',assignment);await bindingsRepository.set('image-edit',assignment)}
  return bindingsRepository.legacy()
}

/** Clear a slot; persists and returns the updated table. */
export async function clearAssignment(slot: SlotId): Promise<ModelAssignments> {
  if(slot==='chat'){await bindingsRepository.clear('text');await bindingsRepository.clear('vision')}else{await bindingsRepository.clear('image-generation');await bindingsRepository.clear('image-edit')}
  return bindingsRepository.legacy()
}
