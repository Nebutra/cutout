import { z } from 'zod'

export const PERSONALIZATION_VERSION=1 as const
export const personalitySchema=z.enum(['auto','friendly','concise','professional','direct','custom'])
const credentialShape=/(?:sk-[a-z0-9_-]{16,}|api[_ -]?key\s*[:=]|bearer\s+[a-z0-9._-]{16,}|-----BEGIN [A-Z ]+PRIVATE KEY-----)/i
function containsUnsafeControl(value:string){return[...value].some(character=>{const code=character.charCodeAt(0);return code===127||code<9||(code>10&&code<13)||(code>13&&code<32)})}
export const customInstructionsSchema=z.string().max(4000).refine(value=>!containsUnsafeControl(value),'Custom instructions contain unsafe control characters.').refine(value=>!credentialShape.test(value),'Custom instructions must not contain credentials or private keys.')
export const personalizationSettingsSchema=z.object({version:z.literal(PERSONALIZATION_VERSION),personality:personalitySchema,customInstructions:customInstructionsSchema,memoryEnabled:z.boolean(),toolAssistedMemory:z.boolean()}).strict().superRefine((value,ctx)=>{if(value.personality==='custom'&&!value.customInstructions.trim())ctx.addIssue({code:'custom',path:['customInstructions'],message:'Custom personality requires instructions.'});if(!value.memoryEnabled&&value.toolAssistedMemory)ctx.addIssue({code:'custom',path:['toolAssistedMemory'],message:'Tool-assisted memory requires memory.'})})
export type PersonalizationSettings=z.infer<typeof personalizationSettingsSchema>
export const defaultPersonalizationSettings:PersonalizationSettings={version:PERSONALIZATION_VERSION,personality:'auto',customInstructions:'',memoryEnabled:false,toolAssistedMemory:false}

export function migratePersonalizationSettings(input:unknown):PersonalizationSettings{
  const current=personalizationSettingsSchema.safeParse(input);if(current.success)return current.data
  if(!input||typeof input!=='object')return defaultPersonalizationSettings
  const legacy=input as Record<string,unknown>,candidate={version:PERSONALIZATION_VERSION,personality:legacy.personality??legacy.tone??'auto',customInstructions:legacy.customInstructions??legacy.instructions??'',memoryEnabled:legacy.memoryEnabled??legacy.memory??false,toolAssistedMemory:legacy.toolAssistedMemory??false}
  const migrated=personalizationSettingsSchema.safeParse(candidate);return migrated.success?migrated.data:defaultPersonalizationSettings
}

export interface PersonalizationControlStatus{readonly protocol:'cutout.personalization-status.v1';readonly personality:PersonalizationSettings['personality'];readonly hasCustomInstructions:boolean;readonly memoryEnabled:boolean;readonly toolAssistedMemory:boolean}
export function personalizationControlStatus(value:PersonalizationSettings):PersonalizationControlStatus{return{protocol:'cutout.personalization-status.v1',personality:value.personality,hasCustomInstructions:Boolean(value.customInstructions.trim()),memoryEnabled:value.memoryEnabled,toolAssistedMemory:value.toolAssistedMemory}}
