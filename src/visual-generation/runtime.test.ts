import { describe, expect, it, vi } from 'vitest'
import { createStorageVisualExecutionStore, createVisualTaskRuntime, approveFirstVisualCandidate } from './runtime'
import type { VisualGenerationTask } from './contracts'

const task: VisualGenerationTask = { version:'visual-generation-task.v1',taskId:'task:hero',catalogItemId:'prototype:hero',kind:'ui-screen',prompt:{version:'visual-prompt.v1',objective:'Create a page',subject:'Product',composition:'Hero',artDirection:'Quiet',constraints:['No defects'],negativeConstraints:[],output:{size:'1024x1024',mediaType:'image/png',transparent:false},locale:'en'},references:[],variants:{count:1,parallelism:1},consistency:{lockedTraits:[]},routing:{preferredModel:'gpt-image-2',requiredCapabilities:['image-generate','image-edit'],allowCompatibleFallback:false},refinement:{mode:'full-frame',instruction:'Refine'},budget:{ceiling:{currency:'USD',amount:1},approvalPolicy:'auto-within-budget',maxAttemptsPerNode:1},publication:{intendedUse:'raster-master',requiresHumanReview:false,requiresVectorization:false} }
function memoryStorage(){let value:string|null=null;return{getItem:()=>value,setItem:(_key:string,next:string)=>{value=next}}}
async function toolResult(input:{requestId:string;capability:string}){const generated=input.capability==='generate-image';return{receipt:{receiptId:`receipt:${input.requestId}`,requestId:input.requestId,capability:input.capability as 'generate-image'|'edit-image',providerId:'p',model:'gpt-image-2',status:'succeeded' as const,charged:{currency:'USD',amount:.1},outputArtifactIds:[generated?'artifact:sha256:'+ 'a'.repeat(64):'artifact:sha256:'+ 'b'.repeat(64)],startedAt:1,completedAt:2},candidate:{variantId:`candidate:${input.requestId}`,artifactId:generated?'artifact:sha256:'+ 'a'.repeat(64):'artifact:sha256:'+ 'b'.repeat(64),sha256:generated?'a'.repeat(64):'b'.repeat(64),mediaType:'image/png',requestId:input.requestId,model:'gpt-image-2',providerId:'p',attempt:1,provenanceId:`provenance:${input.requestId}`}}}

describe('VisualTaskRuntime',()=>{
  it('runs the canonical plan and reuses its durable promotion after restart',async()=>{
    const storage=memoryStorage(),invoke=vi.fn(toolResult),append=vi.fn()
    const first=createVisualTaskRuntime({tools:{invoke},reviewer:approveFirstVisualCandidate(),store:createStorageVisualExecutionStore(storage),estimates:{generate:{currency:'USD',amount:.1},edit:{currency:'USD',amount:.1}},append})
    const result=await first.execute('run:1',task);expect(result.promotion?.masterArtifactId).toBe('artifact:sha256:'+'b'.repeat(64));expect(invoke).toHaveBeenCalledTimes(2)
    const restarted=createVisualTaskRuntime({tools:{invoke},reviewer:approveFirstVisualCandidate(),store:createStorageVisualExecutionStore(storage),estimates:{generate:{currency:'USD',amount:.1},edit:{currency:'USD',amount:.1}},append})
    await expect(restarted.execute('run:1',task)).resolves.toMatchObject({idempotent:true,promotion:{masterArtifactId:'artifact:sha256:'+'b'.repeat(64)}});expect(invoke).toHaveBeenCalledTimes(2)
  })
  it('does not auto-promote a task that requires human review',async()=>{const runtime=createVisualTaskRuntime({tools:{invoke:toolResult},reviewer:approveFirstVisualCandidate('agent'),store:createStorageVisualExecutionStore(memoryStorage()),estimates:{generate:{currency:'USD',amount:.1},edit:{currency:'USD',amount:.1}},append:vi.fn()});await expect(runtime.execute('run',{...task,publication:{...task.publication,requiresHumanReview:true}})).rejects.toThrow('human review')})
})
