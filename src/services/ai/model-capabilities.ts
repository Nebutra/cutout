import { z } from 'zod'
import { modelAssignmentSchema, type ModelAssignment, type ModelAssignments } from './model-assignment-types'

export const modelCapabilitySchema=z.enum(['text','vision','reasoning','tools','web-search','image-generation','image-edit','asr','tts','video-generation','video-edit'])
export type ModelCapability=z.infer<typeof modelCapabilitySchema>
export const modelCatalogSourceSchema=z.enum(['provider','remote-catalog','verified-catalog','user-declared','legacy-migration'])
export const modelCapabilityEvidenceSchema=z.object({capability:modelCapabilitySchema,sourceId:z.string().min(1),kind:z.enum(['declared','observed','verified']),capturedAt:z.string().datetime().optional(),reference:z.string().url().optional()}).strict()
export const modelDescriptorSchema=z.object({providerId:z.string().min(1),model:z.string().min(1),capabilities:z.array(modelCapabilitySchema).default([]),source:modelCatalogSourceSchema,evidence:z.array(modelCapabilityEvidenceSchema).default([]),verifiedAt:z.string().datetime().optional(),metadata:z.object({contextWindow:z.number().int().positive().optional(),inputMediaTypes:z.array(z.string().min(1)).default([]),outputMediaTypes:z.array(z.string().min(1)).default([])}).strict().optional()}).strict()
export type ModelDescriptor=z.infer<typeof modelDescriptorSchema>

export const modelTaskKindSchema=z.enum(['text','vision','research','image-generation','image-edit','asr','tts','video-generation','video-edit','webdev','image-to-webdev'])
export type ModelTaskKind=z.infer<typeof modelTaskKindSchema>
export interface ModelTaskProfile{readonly kind:ModelTaskKind;readonly required:readonly ModelCapability[];readonly preferred:readonly ModelCapability[];readonly composite:boolean}
const profiles:Record<ModelTaskKind,ModelTaskProfile>={text:{kind:'text',required:['text'],preferred:['reasoning'],composite:false},vision:{kind:'vision',required:['text','vision'],preferred:['reasoning'],composite:false},research:{kind:'research',required:['text','web-search'],preferred:['reasoning','tools'],composite:false},'image-generation':{kind:'image-generation',required:['image-generation'],preferred:[],composite:false},'image-edit':{kind:'image-edit',required:['image-edit'],preferred:['vision'],composite:false},asr:{kind:'asr',required:['asr'],preferred:[],composite:false},tts:{kind:'tts',required:['tts'],preferred:[],composite:false},'video-generation':{kind:'video-generation',required:['video-generation'],preferred:[],composite:false},'video-edit':{kind:'video-edit',required:['video-edit'],preferred:['vision'],composite:false},webdev:{kind:'webdev',required:['text','tools'],preferred:['reasoning','vision'],composite:true},'image-to-webdev':{kind:'image-to-webdev',required:['text','vision','tools'],preferred:['reasoning'],composite:true}}
export function modelTaskProfile(kind:ModelTaskKind):ModelTaskProfile{return profiles[modelTaskKindSchema.parse(kind)]}
export function descriptorSupports(descriptor:ModelDescriptor,profile:ModelTaskProfile){const capabilities=new Set(descriptor.capabilities);return profile.required.every(capability=>capabilities.has(capability))}

export const capabilityBindingsSchema=z.object({version:z.literal('model-assignments.v2'),bindings:z.partialRecord(modelCapabilitySchema,modelAssignmentSchema).default({}),legacy:z.object({chat:modelAssignmentSchema.optional(),image:modelAssignmentSchema.optional()}).strict().optional()}).strict()
export type CapabilityBindings=z.infer<typeof capabilityBindingsSchema>
export function migrateLegacyAssignments(input:ModelAssignments):CapabilityBindings{const bindings:Partial<Record<ModelCapability,ModelAssignment>>={};if(input.chat)bindings.text=input.chat;if(input.image)bindings['image-generation']=input.image;return capabilityBindingsSchema.parse({version:'model-assignments.v2',bindings,legacy:{...(input.chat?{chat:input.chat}:{}),...(input.image?{image:input.image}:{})}})}
