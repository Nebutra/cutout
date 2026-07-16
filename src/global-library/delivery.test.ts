import { describe, expect, it } from 'vitest'
import type { DesignDocument } from '@/design-ir'
import type { TargetExecutionReceipt } from '@/delivery-center'
import { buildDeliveryLibraryItem } from './delivery'
import { globalLibraryItemSchema } from './contracts'

const at = '2026-07-15T00:00:00.000Z'
const document = { version:'design-ir.v1',meta:{id:'project.alpha',title:'Alpha',createdAt:at,updatedAt:at},revision:{id:'revision.2',number:2,createdAt:at,author:{kind:'human',id:'user'}},needs:[],sources:[],brands:[],tokens:[],components:[],materials:[],provenance:[],relations:[] } satisfies DesignDocument
async function digest(content:string){const value=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(content));return[...new Uint8Array(value)].map(byte=>byte.toString(16).padStart(2,'0')).join('')}
function sink(){return{async put(bytes:Uint8Array){const value=await crypto.subtle.digest('SHA-256',bytes as BufferSource);return{sha256:[...new Uint8Array(value)].map(byte=>byte.toString(16).padStart(2,'0')).join(''),size:bytes.byteLength}}}}

describe('delivery Library projection',()=>{
  it('stores an approved Starter bundle with hashes bound to its delivery receipt',async()=>{const content='export default {}\n',sha256=await digest(content);const receipt={targetId:'delivery:starter',kind:'starter',status:'succeeded',destination:{kind:'managed-export',ref:'folder'},startedAt:at,completedAt:at,artifacts:[{path:'package.json',sha256,mediaType:'application/json'}],quality:[{gate:'provenance',status:'passed',evidenceIds:[`sha256:${sha256}`]}],kitManifests:[]} satisfies TargetExecutionReceipt;const built=await buildDeliveryLibraryItem({document,receipt,files:[{path:'package.json',content}],contentSink:sink(),approvalId:'approval.one',createdAt:at});expect(globalLibraryItemSchema.parse(built.item)).toMatchObject({kind:'starter-kit',origin:{runId:'approval.one'},content:{artifacts:[{path:'package.json',sha256}]}});expect(built.approval.contentSha256).toBe(built.item.contentSha256)})
  it('rejects content that differs from the approved receipt',async()=>{const receipt={targetId:'delivery:components',kind:'components',status:'succeeded',destination:{kind:'managed-export',ref:'folder'},startedAt:at,completedAt:at,artifacts:[{path:'components.manifest.json',sha256:'a'.repeat(64),mediaType:'application/json'}],quality:[],kitManifests:[]} satisfies TargetExecutionReceipt;await expect(buildDeliveryLibraryItem({document,receipt,files:[{path:'components.manifest.json',content:'{}'}],contentSink:sink(),approvalId:'approval.one',createdAt:at})).rejects.toThrow('hash mismatch')})
})
