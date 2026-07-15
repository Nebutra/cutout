import type { BrandBookPage, BrandBookParser } from './brand-book-ingest'

export interface AuthorizedBrandBookHost {
  readonly available:boolean
  renderPdf(bytes:Uint8Array):Promise<readonly {readonly page:number;readonly image:Uint8Array}[]>
  inspectImage(input:{readonly bytes:Uint8Array;readonly mediaType:string;readonly page:number}):Promise<{readonly text:string}>
}
export function createAuthorizedBrandBookParser(host:AuthorizedBrandBookHost,limits={maximumBytes:64*1024*1024,maximumPages:300}):BrandBookParser{return{available:host.available,async parse({bytes,mediaType}){
  if(!host.available)throw new Error('Authorized Brand Book render/OCR/vision host is unavailable.')
  if(bytes.byteLength<1||bytes.byteLength>limits.maximumBytes)throw new Error('Brand Book exceeds the authorized size limit.')
  const sourceSha256=await sha(bytes),pages=mediaType==='application/pdf'?await host.renderPdf(bytes):[{page:1,image:bytes}]
  if(!pages.length||pages.length>limits.maximumPages)throw new Error('Brand Book page count is outside the authorized limit.')
  const seen=new Set<number>(),result:BrandBookPage[]=[]
  for(const page of pages){if(!Number.isInteger(page.page)||page.page<1||seen.has(page.page))throw new Error('Brand Book host returned invalid page numbering.');seen.add(page.page);if(!page.image.byteLength)throw new Error('Brand Book host returned an empty rendered page.');const inspected=await host.inspectImage({bytes:page.image,mediaType:mediaType==='application/pdf'?'image/png':mediaType,page:page.page});result.push({page:page.page,text:inspected.text,imageSha256:await sha(page.image)})}
  return{sourceSha256,pages:result.sort((a,b)=>a.page-b.page)}
}}}
async function sha(bytes:Uint8Array){const digest=await crypto.subtle.digest('SHA-256',bytes as BufferSource);return[...new Uint8Array(digest)].map((value)=>value.toString(16).padStart(2,'0')).join('')}
