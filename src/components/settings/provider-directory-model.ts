import { createBuiltinProviderRegistry, type ProviderDefinition } from '@/services/ai/provider-registry'

export function providerDirectoryItems(query:string,category:ProviderDefinition['category']|'all'){
  const registry=createBuiltinProviderRegistry(),needle=query.trim().toLowerCase()
  return registry.catalog().filter(item=>(category==='all'||item.category===category)&&(!needle||`${item.label} ${item.id}`.toLowerCase().includes(needle))).map(definition=>({definition,adapterAvailable:registry.adaptersFor(definition.id).length>0,authorizationRequired:!definition.authMethods.includes('none')}))
}
