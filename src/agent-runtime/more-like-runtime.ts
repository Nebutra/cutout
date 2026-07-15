import type { PaidToolReceipt } from '@/control-protocol/paid-tool-contract'
import { computeLibraryContentHash, type GlobalLibraryItem, type GlobalLibraryStore, type IndexedDbLibraryBlobStore } from '@/global-library'

export interface MoreLikeRequest { readonly requestId:string; readonly instruction:string; readonly parent:Pick<GlobalLibraryItem,'id'|'version'|'contentSha256'> }
export interface MoreLikeGeneratedArtifact { readonly path:string; readonly mediaType:string; readonly bytes:Uint8Array }
export interface MoreLikeExecutor { execute(request:MoreLikeRequest):Promise<{readonly receipt:PaidToolReceipt;readonly artifacts:readonly MoreLikeGeneratedArtifact[]}> }

export async function executeMoreLike(input:{readonly request:MoreLikeRequest;readonly parent:GlobalLibraryItem;readonly executor:MoreLikeExecutor;readonly blobs:IndexedDbLibraryBlobStore;readonly library:GlobalLibraryStore;readonly now?:string}){
  if(input.request.parent.id!==input.parent.id||input.request.parent.version!==input.parent.version||input.request.parent.contentSha256!==input.parent.contentSha256)throw new Error('More-like-this parent lock is stale.')
  const generated=await input.executor.execute(input.request)
  if(generated.receipt.status!=='succeeded'||generated.receipt.requestId!==input.request.requestId)throw new Error('More-like-this executor did not return a matching successful receipt.')
  if(!generated.artifacts.length)throw new Error('More-like-this executor returned no artifacts.')
  const artifacts=[]
  for(const artifact of generated.artifacts){const stored=await input.blobs.put(artifact.bytes,artifact.mediaType);artifacts.push({path:artifact.path,sha256:stored.sha256,mediaType:stored.mediaType,size:stored.size})}
  const manifestSha256=await sha(JSON.stringify({parent:input.request.parent,instruction:input.request.instruction,receiptId:generated.receipt.receiptId,artifacts:artifacts.map(({path,sha256})=>({path,sha256}))})),content={manifestPath:'manifest.json',manifestSha256,artifacts},contentSha256=await computeLibraryContentHash(content),at=input.now??new Date().toISOString()
  const next:GlobalLibraryItem={...input.parent,id:`${input.parent.id}.variant.${contentSha256.slice(0,8)}`,version:'1.0.0',name:`${input.parent.name} variant`,description:`Generated from approved parent ${input.parent.id}@${input.parent.version}.`,contentSha256,content,origin:{kind:'forked',itemId:input.parent.id,version:input.parent.version,contentSha256:input.parent.contentSha256},qualityReceipts:[...input.parent.qualityReceipts,{id:`quality.provenance.${contentSha256.slice(0,8)}`,gate:'provenance',status:'passed',checkedAt:at,tool:'cutout.more-like-runtime',evidence:artifacts.map((artifact)=>({id:`artifact.${artifact.sha256.slice(0,12)}`,sha256:artifact.sha256,path:artifact.path}))}],lineage:{root:input.parent.lineage.root,parent:{itemId:input.parent.id,version:input.parent.version,contentSha256:input.parent.contentSha256},depth:input.parent.lineage.depth+1},createdAt:at,updatedAt:at}
  await input.library.forkItem(input.parent.id,input.parent.version,next,{status:'succeeded',approvalId:generated.receipt.receiptId,contentSha256})
  return next
}
async function sha(value:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return[...new Uint8Array(bytes)].map((byte)=>byte.toString(16).padStart(2,'0')).join('')}
