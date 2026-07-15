import type { ModelAssignment, SlotId } from '@/services/ai/model-assignment-types'
import type { PersonalizationReceiptFlags } from '@/services/ai/types'

export type ModelCapability = 'text'|'reasoning'|'vision'|'tools'|'image-generation'|'image-edit'
export type ModelRegion = 'global'|'cn'|'cn-mainland'
export interface ModelDescriptor {
  readonly providerId:string
  readonly model:string
  readonly slot:SlotId
  readonly capabilities:readonly ModelCapability[]
  readonly quality:number
  readonly cost:number
  readonly speed:number
  readonly region:ModelRegion
  readonly available?:boolean
}
export interface RoutePreferences {
  readonly priority?:'balanced'|'quality'|'cost'|'speed'
  readonly dataRegion?:{readonly mode:'cn-mainland-required';readonly source:'privacy'|'organization'}
}
export interface ModelRouteReceipt {
  readonly protocol:'cutout.model-route-receipt.v1'
  readonly requiredCapabilities:readonly ModelCapability[]
  readonly preferredCapabilities:readonly ModelCapability[]
  readonly selected?:ModelAssignment
  readonly fallback:boolean
  readonly candidates:readonly {readonly providerId:string;readonly model:string;readonly eligible:boolean;readonly reason?:string;readonly score?:number}[]
  readonly personalization?:PersonalizationReceiptFlags
}

export function routeByCapabilities(input:{readonly slot:SlotId;readonly descriptors:readonly ModelDescriptor[];readonly requiredCapabilities:readonly ModelCapability[];readonly preferredCapabilities?:readonly ModelCapability[];readonly preferences?:RoutePreferences;readonly preferredAssignment?:ModelAssignment}):{readonly assignment?:ModelAssignment;readonly receipt?:ModelRouteReceipt}{
  const preferred=input.preferredCapabilities??[],preferences=input.preferences??{},records:ModelRouteReceipt['candidates'][number][]=[],eligible:{descriptor:ModelDescriptor;score:number}[]=[]
  for(const descriptor of input.descriptors){let reason:string|undefined
    if(descriptor.slot!==input.slot)reason='slot-mismatch'
    else if(descriptor.available===false)reason='unavailable'
    else if(preferences.dataRegion?.mode==='cn-mainland-required'&&descriptor.region!=='cn-mainland')reason=`region-mismatch:${preferences.dataRegion.source}`
    else{const missing=input.requiredCapabilities.filter(capability=>!descriptor.capabilities.includes(capability));if(missing.length)reason=`missing:${missing.join(',')}`}
    if(reason){records.push({providerId:descriptor.providerId,model:descriptor.model,eligible:false,reason});continue}
    const score=routeScore(descriptor,preferred,preferences)
    eligible.push({descriptor,score});records.push({providerId:descriptor.providerId,model:descriptor.model,eligible:true,score})
  }
  eligible.sort((a,b)=>b.score-a.score||a.descriptor.providerId.localeCompare(b.descriptor.providerId)||a.descriptor.model.localeCompare(b.descriptor.model))
  const chosen=eligible[0]?.descriptor;if(!chosen)return{receipt:{protocol:'cutout.model-route-receipt.v1',requiredCapabilities:[...input.requiredCapabilities],preferredCapabilities:[...preferred],fallback:false,candidates:records}}
  const assignment={providerId:chosen.providerId,model:chosen.model},fallback=Boolean(input.preferredAssignment&&(input.preferredAssignment.providerId!==assignment.providerId||input.preferredAssignment.model!==assignment.model))
  return{assignment,receipt:{protocol:'cutout.model-route-receipt.v1',requiredCapabilities:[...input.requiredCapabilities],preferredCapabilities:[...preferred],selected:assignment,fallback,candidates:records}}
}
function routeScore(model:ModelDescriptor,preferred:readonly ModelCapability[],preferences:RoutePreferences){const priority=preferences.priority??'balanced',weights=priority==='quality'?[.7,.15,.15]:priority==='cost'?[.2,.65,.15]:priority==='speed'?[.2,.15,.65]:[.45,.3,.25],capabilityBonus=preferred.filter(capability=>model.capabilities.includes(capability)).length*.05;return Number((model.quality*weights[0]+(1-model.cost)*weights[1]+model.speed*weights[2]+capabilityBonus).toFixed(6))}
