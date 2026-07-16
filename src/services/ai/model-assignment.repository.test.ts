import { describe,expect,it } from 'vitest'
import { createCapabilityBindingsRepository } from './model-assignment.local'

function memory(initial:Record<string,unknown>={}){const data=new Map(Object.entries(initial));return{get:async<T>(key:string)=>data.get(key) as T|undefined,set:async(key:string,value:unknown)=>void data.set(key,value),save:async()=>{},data}}

describe('CapabilityBindings repository',()=>{
  it('atomically migrates plugin-store legacy slots and browser dimension routes',async()=>{const store=memory({'ai.modelAssignments':{chat:{providerId:'p',model:'chat'},image:{providerId:'p',model:'image'}}}),repo=createCapabilityBindingsRepository(store,()=>({asr:{providerId:'s',model:'asr'},webdev:{providerId:'c',model:'code'}})),bindings=await repo.load();expect(bindings.bindings).toMatchObject({text:{model:'chat'},asr:{model:'asr'},webdev:{model:'code'},'image-generation':{model:'image'}});expect(bindings.bindings.vision).toBeUndefined();expect(store.data.get('ai.capabilityBindings')).toEqual(bindings)})
  it('uses v2 as authority and exposes legacy runtime projection',async()=>{const store=memory(),repo=createCapabilityBindingsRepository(store);await repo.set('vision',{providerId:'v',model:'vision'});await repo.set('text',{providerId:'t',model:'text'});expect(await repo.legacy()).toEqual({chat:{providerId:'t',model:'text'}});await repo.clear('text');expect(await repo.legacy()).toEqual({chat:{providerId:'v',model:'vision'}})})
})
