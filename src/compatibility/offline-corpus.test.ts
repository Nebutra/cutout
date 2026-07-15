import { describe, expect, it } from 'vitest'
import { migrateGlobalLibraryCatalog, previewGlobalLibraryDowngrade } from '@/global-library/store'
import { migrateWorkflowPack, previewWorkflowPackDowngrade, workflowPackSchema } from '@/agent-workflow-packs/contracts'
import { migratePaidToolReceipt, previewPaidToolReceiptDowngrade } from '@/control-protocol/paid-tool-contract'
import { importLottie } from '@/motion-ir/lottie'
import { figmaPatchPlanSchema } from '@/integration-sdk/figma-plugin'
import { parseBrandBook } from '@/global-library/brand-book-ingest'
import { createVideoTimeline } from '@/agent-runtime/video-reference'

const at='2026-07-12T00:00:00.000Z',hash='a'.repeat(64)
describe('offline compatibility and limit corpus',()=>{
  it('upgrades and loss-reports old Library, Workflow Pack and receipt documents',()=>{
    const library=migrateGlobalLibraryCatalog({revision:4,items:[],collections:[],updatedAt:at},at)
    expect(library).toMatchObject({protocol:'cutout.global-library.v1',revision:4,projectReferences:[]})
    expect(previewGlobalLibraryDowngrade(library).losses).toEqual([])
    const workflow=migrateWorkflowPack({id:'brand.book',version:'1.0.0',title:'Brand Book',description:'Offline',cutoutRange:'^0.1.0',capabilities:['export.brand-kit'],steps:[{id:'export',operation:'export.brand-kit',dependsOn:[],effect:'managed-export',approval:'explicit'}],evalCard:{datasetId:'brand.book',metrics:[{id:'schema',threshold:1,weight:1}],minimumScore:1},provenance:{producer:'cutout',capturedAt:at,contentSha256:hash}})
    expect(workflow.skillRefs).toEqual([]);expect(previewWorkflowPackDowngrade(workflow).losses).toEqual([])
    const receipt=migratePaidToolReceipt({receiptId:'r',requestId:'q',capability:'generate-image',providerId:'p',model:'m',status:'succeeded',charged:{currency:'USD',amount:1},outputs:['a','b'],startedAt:1,completedAt:2})
    expect(receipt.outputArtifactIds).toEqual(['a','b']);expect(previewPaidToolReceiptDowngrade(receipt).losses).toHaveLength(1)
  })
  it('accepts a complex 1000-step acyclic Brand Book workflow and rejects a cycle',()=>{
    const steps=Array.from({length:1000},(_,index)=>({id:`s.${index}`,operation:'export.brand-kit',dependsOn:index?[`s.${index-1}`]:[],effect:'managed-export' as const,approval:'explicit' as const}))
    const pack={protocol:'cutout.workflow-pack.v1',id:'brand.book.large',version:'1.0.0',title:'Large Brand Book',description:'Offline stress fixture',cutoutRange:'^0.1.0',capabilities:['export.brand-kit'],skillRefs:[],steps,evalCard:{datasetId:'brand.book.large',metrics:[{id:'schema',threshold:1,weight:1}],minimumScore:1},provenance:{producer:'cutout',capturedAt:at,contentSha256:hash}}
    expect(workflowPackSchema.parse(pack).steps).toHaveLength(1000)
    expect(()=>workflowPackSchema.parse({...pack,steps:[{...steps[0],dependsOn:['s.999']},...steps.slice(1)]})).toThrow('cycle')
  })
  it('enforces Brand Book, Lottie, Video and Figma bounds without external hosts',async()=>{
    expect(()=>importLottie({v:'5.12.2',fr:60,ip:0,op:60,w:1024,h:1024,layers:Array.from({length:5001},(_,i)=>({ty:3,ind:i+1,nm:`Layer ${i}`}))},{designDocumentId:'design.fixture',designRevisionId:'revision.fixture',materialRefs:[],componentRefs:[]})).toThrow('5,000')
    const operations=Array.from({length:5001},(_,i)=>({operation:'set-properties' as const,nodeId:`1:${i}`,expectedType:'FRAME' as const,beforeHash:hash,properties:{name:`Node ${i}`}}))
    expect(()=>figmaPatchPlanSchema.parse({protocol:'cutout.figma-plugin-plan.v1',id:'plan.large',fileKeyHash:hash,pageIds:['p1'],operations,createdAt:at,requiresApproval:true})).toThrow()
    await expect(parseBrandBook({bytes:new Uint8Array(),mediaType:'application/pdf',sourcePath:'brand.pdf',parser:{available:true,parse:async()=>({sourceSha256:hash,pages:Array.from({length:5001},(_,i)=>({page:i+1,text:''}))})}})).rejects.toThrow('5,000')
    const receipt={receiptId:'r',requestId:'video',capability:'generate-image' as const,providerId:'p',model:'m',status:'succeeded' as const,charged:{currency:'USD',amount:0},outputArtifactIds:[],startedAt:0,completedAt:1}
    await expect(createVideoTimeline({requestId:'video',bytes:new Uint8Array(),mediaType:'video/mp4',executor:{available:true,extract:async()=>({receipt,durationMs:10_000,frames:Array.from({length:10001},(_,i)=>({id:`f.${i}`,atMs:i,sha256:hash,perceptualHash:'0',width:1,height:1}))})}})).rejects.toThrow('10,000')
  })
})
