import { LazyStore } from '@tauri-apps/plugin-store'
import { defaultPersonalizationSettings, migratePersonalizationSettings, personalizationSettingsSchema, type PersonalizationSettings } from './schema'

const STORE_FILE='settings.json',STORE_KEY='personalization.settings'
export interface PersonalizationStore{get<T>(key:string):Promise<T|undefined>;set(key:string,value:unknown):Promise<void>;delete(key:string):Promise<boolean|void>;save?():Promise<void>}
export interface PersonalizationService{load():Promise<PersonalizationSettings>;save(value:PersonalizationSettings):Promise<PersonalizationSettings>;reset():Promise<PersonalizationSettings>}

export function createPersonalizationService(store:PersonalizationStore=defaultStore()):PersonalizationService{return{
  async load(){try{const raw=await store.get<unknown>(STORE_KEY),value=migratePersonalizationSettings(raw);if(raw!==undefined&&JSON.stringify(raw)!==JSON.stringify(value)){await store.set(STORE_KEY,value);await store.save?.()}return value}catch{return defaultPersonalizationSettings}},
  async save(input){const value=personalizationSettingsSchema.parse(input);await store.set(STORE_KEY,value);await store.save?.();return value},
  async reset(){await store.delete(STORE_KEY);await store.save?.();return defaultPersonalizationSettings},
}}
function defaultStore():PersonalizationStore{return(globalThis as typeof globalThis&{__CUTOUT_PERSONALIZATION_STORE__?:PersonalizationStore}).__CUTOUT_PERSONALIZATION_STORE__??new LazyStore(STORE_FILE)}
