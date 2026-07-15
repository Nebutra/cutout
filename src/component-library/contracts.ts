import { z } from 'zod'
import { RegistryItemSchema } from '@/registry'

const id=z.string().min(1).max(200), sha=z.string().regex(/^[a-f0-9]{64}$/), path=z.string().min(1).max(512).refine((v)=>!v.startsWith('/')&&!v.includes('\\')&&v.split('/').every((p)=>p&&p!=='.'&&p!=='..'))
export const componentLibraryProfileSchema=z.object({
  protocol:z.literal('cutout.component-library.v1'),item:RegistryItemSchema.refine((value)=>value.kind==='component','Component Library accepts component Registry items only.'),
  stories:z.array(z.object({id,name:z.string().min(1),description:z.string().optional(),exampleIds:z.array(id),stateIds:z.array(id)}).strict()).max(200),
  examples:z.array(z.object({id,title:z.string().min(1),description:z.string().optional(),sourcePath:path,sourceSha256:sha}).strict()).max(500),
  variants:z.array(z.object({name:id,values:z.array(id).min(1),defaultValue:id}).strict()).max(100),
  states:z.array(z.object({id,label:z.string().min(1),variantValues:z.record(z.string(),id),pseudo:z.enum(['none','hover','focus','active','disabled','loading','error','success']),interactive:z.boolean()}).strict()).max(500),
  props:z.array(z.object({name:id,type:z.string().min(1),required:z.boolean(),defaultValue:z.string().optional(),description:z.string().min(1)}).strict()).max(300),
  slots:z.array(z.object({name:id,required:z.boolean(),description:z.string().min(1),accepts:z.array(z.string().min(1))}).strict()).max(100),
  accessibility:z.object({roles:z.array(id),keyboard:z.array(z.object({key:z.string().min(1),action:z.string().min(1)}).strict()),requirements:z.array(z.string().min(1)),evidenceIds:z.array(id)}).strict(),
  tokenBindings:z.array(z.object({property:id,tokenRef:id,required:z.boolean()}).strict()).max(500),
  frameworkCompatibility:z.array(z.object({framework:id,range:z.string().min(1),status:z.enum(['verified','experimental','incompatible']),evidenceIds:z.array(id)}).strict()).min(1),
  installedOrigin:z.object({projectId:id,itemId:id,version:id,installedAt:z.string().datetime(),files:z.array(z.object({path,baseHash:sha}).strict())}).strict().optional(),
  lifecycle:z.object({status:z.enum(['active','deprecated','archived']),deprecatedAt:z.string().datetime().optional(),reason:z.string().optional(),replacement:z.object({itemId:id,version:id}).strict().optional()}).strict(),
  collections:z.array(id),updatedAt:z.string().datetime(),
}).strict().superRefine((value,ctx)=>{const variants=new Map(value.variants.map((v)=>[v.name,new Set(v.values)]));for(const variant of value.variants)if(!variant.values.includes(variant.defaultValue))ctx.addIssue({code:'custom',message:`Variant ${variant.name} default is not declared.`});for(const state of value.states)for(const [name,entry] of Object.entries(state.variantValues))if(!variants.get(name)?.has(entry))ctx.addIssue({code:'custom',message:`State ${state.id} references unknown variant value ${name}=${entry}.`});const examples=new Set(value.examples.map((e)=>e.id)),states=new Set(value.states.map((s)=>s.id));for(const story of value.stories){for(const ref of story.exampleIds)if(!examples.has(ref))ctx.addIssue({code:'custom',message:`Story ${story.id} references unknown example ${ref}.`});for(const ref of story.stateIds)if(!states.has(ref))ctx.addIssue({code:'custom',message:`Story ${story.id} references unknown state ${ref}.`})}if(value.lifecycle.status==='deprecated'&&!value.lifecycle.replacement)ctx.addIssue({code:'custom',message:'Deprecated components require an explicit replacement.'});if(value.installedOrigin&&(value.installedOrigin.itemId!==value.item.id||value.installedOrigin.version!==value.item.version))ctx.addIssue({code:'custom',message:'Installed origin must match the exact Registry item version.'})})
export type ComponentLibraryProfile=z.infer<typeof componentLibraryProfileSchema>
