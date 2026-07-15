import type { RegistryInstallInput, RegistryInstallPlan, RegistryItem } from '@/registry'
import { componentLibraryProfileSchema, type ComponentLibraryProfile } from './contracts'

export interface ComponentLibraryQuery{readonly text?:string;readonly collection?:string;readonly framework?:string;readonly status?:ComponentLibraryProfile['lifecycle']['status'];readonly installed?:boolean}
export interface RegistryInstallerHost { plan(input:RegistryInstallInput,framework:string):Promise<RegistryInstallPlan> }
export class ComponentLibrary{
  #profiles=new Map<string,ComponentLibraryProfile>()
  upsert(input:unknown){const profile=componentLibraryProfileSchema.parse(input);this.#profiles.set(key(profile.item),profile);return profile}
  get(itemId:string,version:string){return this.#profiles.get(`${itemId}@${version}`)}
  search(query:ComponentLibraryQuery={}){const text=query.text?.trim().toLowerCase();return [...this.#profiles.values()].filter((p)=>(!text||`${p.item.id} ${p.item.metadata.name} ${p.item.metadata.description} ${p.item.metadata.tags.join(' ')}`.toLowerCase().includes(text))&&(!query.collection||p.collections.includes(query.collection))&&(!query.framework||p.frameworkCompatibility.some((f)=>f.framework===query.framework&&f.status!=='incompatible'))&&(!query.status||p.lifecycle.status===query.status)&&(query.installed===undefined||Boolean(p.installedOrigin)===query.installed)).sort((a,b)=>a.item.id.localeCompare(b.item.id)||b.item.version.localeCompare(a.item.version))}
  async planInstall(installer:RegistryInstallerHost|undefined,input:RegistryInstallInput,framework:string):Promise<RegistryInstallPlan>{const profile=this.get(input.item.id,input.item.version);if(!profile)throw new Error('Component profile is missing for the exact Registry item version.');if(profile.lifecycle.status!=='active')throw new Error(`Component is ${profile.lifecycle.status}${profile.lifecycle.replacement?`; use ${profile.lifecycle.replacement.itemId}@${profile.lifecycle.replacement.version}`:''}.`);if(!profile.frameworkCompatibility.some((entry)=>entry.framework===framework&&entry.status==='verified'))throw new Error(`Component is not verified for ${framework}.`);if(!installer)throw new Error('Registry installer capability is required in this host.');return installer.plan(input,framework)}
  replacement(item:RegistryItem){const profile=this.get(item.id,item.version);return profile?.lifecycle.replacement}
}
function key(item:RegistryItem){return `${item.id}@${item.version}`}
