import { describe, expect, it } from 'vitest'
import { createCapabilityBindingsRepository } from './model-assignment.local'

function memory(initial:Record<string,unknown>={}) {
  const data=new Map(Object.entries(initial))
  return {
    get:async<T>(key:string)=>data.get(key) as T|undefined,
    set:async(key:string,value:unknown)=>void data.set(key,value),
    save:async()=>{},
    data,
  }
}

describe('CapabilityBindings repository',()=>{
  it('returns a clean current default without rewriting invalid state',async()=>{
    const store=memory({unrelated:{chat:{providerId:'p',model:'chat'}}})
    const repo=createCapabilityBindingsRepository(store)
    expect(await repo.load()).toEqual({
      version:'model-assignments.v2',
      bindings:{},
      descriptors:[],
    })
    expect(store.data.has('ai.capabilityBindings')).toBe(false)
  })

  it('uses capability bindings as authority and exposes a derived primary view',async()=>{
    const store=memory()
    const repo=createCapabilityBindingsRepository(store)
    await repo.set('vision',{providerId:'v',model:'vision'})
    await repo.set('text',{providerId:'t',model:'text'})
    expect(await repo.primary()).toEqual({chat:{providerId:'t',model:'text'}})
    await repo.clear('text')
    expect(await repo.primary()).toEqual({chat:{providerId:'v',model:'vision'}})
    expect(store.data.get('ai.capabilityBindings')).toEqual({
      version:'model-assignments.v2',
      bindings:{vision:{providerId:'v',model:'vision'}},
      descriptors:[],
    })
  })
})
