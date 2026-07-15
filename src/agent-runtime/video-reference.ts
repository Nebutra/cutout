import type { PaidToolReceipt } from '@/control-protocol/paid-tool-contract'

export interface VideoFrameEvidence { readonly id:string; readonly atMs:number; readonly sha256:string; readonly perceptualHash:string; readonly width:number; readonly height:number }
export interface VideoShot { readonly id:string; readonly startMs:number; readonly endMs:number; readonly frameIds:readonly string[]; readonly confidence:number }
export interface VideoTimelineReference { readonly durationMs:number; readonly frames:readonly VideoFrameEvidence[]; readonly shots:readonly VideoShot[]; readonly receiptId:string }
export interface VideoReferenceExecutor { readonly available:boolean; extract(input:{readonly requestId:string;readonly bytes:Uint8Array;readonly mediaType:string;readonly intervalMs:number}):Promise<{readonly receipt:PaidToolReceipt;readonly durationMs:number;readonly frames:readonly VideoFrameEvidence[]}> }

export async function createVideoTimeline(input:{readonly requestId:string;readonly bytes:Uint8Array;readonly mediaType:string;readonly executor:VideoReferenceExecutor;readonly intervalMs?:number;readonly shotThreshold?:number}):Promise<VideoTimelineReference>{
  if(!input.executor.available)throw new Error('Video processing requires an authorized video executor host.')
  if(!/^video\/(?:mp4|webm)$/i.test(input.mediaType))throw new Error('Unsupported video media type.')
  const result=await input.executor.extract({requestId:input.requestId,bytes:input.bytes,mediaType:input.mediaType,intervalMs:input.intervalMs??1000})
  if(result.receipt.requestId!==input.requestId||result.receipt.status!=='succeeded')throw new Error('Video executor receipt is missing or unsuccessful.')
  if(result.frames.length>10_000)throw new Error('Video reference exceeds the 10,000-frame evidence limit.')
  const frames=[...result.frames].sort((a,b)=>a.atMs-b.atMs);if(frames.some((frame,index)=>index>0&&frame.atMs===frames[index-1]!.atMs))throw new Error('Video executor returned duplicate frame timestamps.')
  return{durationMs:result.durationMs,frames,shots:segmentShots(frames,result.durationMs,input.shotThreshold??0.32),receiptId:result.receipt.receiptId}
}
export function segmentShots(frames:readonly VideoFrameEvidence[],durationMs:number,threshold:number):readonly VideoShot[]{if(!frames.length)return[];const starts=[0];for(let index=1;index<frames.length;index++)if(hashDistance(frames[index-1]!.perceptualHash,frames[index]!.perceptualHash)>=threshold)starts.push(index);return starts.map((start,position)=>{const endIndex=(starts[position+1]??frames.length)-1,startFrame=frames[start]!,endFrame=frames[endIndex]!,next=frames[starts[position+1]??frames.length];return{id:`shot.${position+1}`,startMs:startFrame.atMs,endMs:next?.atMs??Math.max(endFrame.atMs,durationMs),frameIds:frames.slice(start,endIndex+1).map(({id})=>id),confidence:position===0?1:Number(hashDistance(frames[start-1]!.perceptualHash,startFrame.perceptualHash).toFixed(3))}})}
function hashDistance(left:string,right:string){const size=Math.max(left.length,right.length);if(!size)return 0;let changed=0;for(let index=0;index<size;index++)if(left[index]!==right[index])changed++;return changed/size}
