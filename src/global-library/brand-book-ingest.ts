import { z } from 'zod'

export const brandBookEvidenceSchema=z.object({id:z.string().min(1),page:z.number().int().positive().optional(),sourcePath:z.string().min(1),sha256:z.string().regex(/^[a-f0-9]{64}$/),excerpt:z.string().max(500).optional()}).strict()
export const brandCandidateSchema=z.object({id:z.string().min(1),kind:z.enum(['logo','color','font','photo','guideline','prohibited-use']),value:z.string().min(1),confidence:z.number().min(0).max(1),evidenceIds:z.array(z.string().min(1)).min(1),status:z.enum(['candidate','confirmed','rejected'])}).strict()
export type BrandBookEvidence=z.infer<typeof brandBookEvidenceSchema>
export type BrandCandidate=z.infer<typeof brandCandidateSchema>
export interface BrandBookPage {readonly page:number;readonly text:string;readonly imageSha256?:string}
export interface BrandBookParser {readonly available:boolean;parse(input:{readonly bytes:Uint8Array;readonly mediaType:string}):Promise<{readonly sourceSha256:string;readonly pages:readonly BrandBookPage[]}>}

export async function parseBrandBook(input:{readonly bytes:Uint8Array;readonly mediaType:string;readonly sourcePath:string;readonly parser:BrandBookParser}){
  if(!input.parser.available)throw new Error('Brand Book parsing requires an authorized PDF/image parser host.')
  if(!/^(?:application\/pdf|image\/(?:png|jpeg|webp))$/i.test(input.mediaType))throw new Error('Unsupported Brand Book media type.')
  const parsed=await input.parser.parse({bytes:input.bytes,mediaType:input.mediaType}),evidence:BrandBookEvidence[]=[],candidates:BrandCandidate[]=[]
  if(parsed.pages.length>5_000)throw new Error('Brand Book exceeds the 5,000-page ingestion limit.')
  for(const page of parsed.pages){const item=brandBookEvidenceSchema.parse({id:`evidence.brand-book.page.${page.page}`,page:page.page,sourcePath:input.sourcePath,sha256:page.imageSha256??parsed.sourceSha256,excerpt:page.text.slice(0,500)});evidence.push(item);candidates.push(...extractBrandCandidates({text:page.text,evidence:item}))}
  return{sourceSha256:parsed.sourceSha256,evidence,candidates}
}

export function extractBrandCandidates(input:{readonly text:string;readonly evidence:BrandBookEvidence}):readonly BrandCandidate[]{
  const evidence=brandBookEvidenceSchema.parse(input.evidence),text=input.text,candidates:BrandCandidate[]=[]
  const add=(kind:BrandCandidate['kind'],value:string,confidence:number)=>{if(!candidates.some((item)=>item.kind===kind&&item.value.toLowerCase()===value.toLowerCase()))candidates.push(brandCandidateSchema.parse({id:`candidate.${kind}.${candidates.length+1}`,kind,value,confidence,evidenceIds:[evidence.id],status:'candidate'}))}
  for(const match of text.matchAll(/#[0-9a-f]{6}\b/gi))add('color',match[0].toUpperCase(),0.92)
  for(const match of text.matchAll(/(?:font|typeface|typography)\s*[:：-]\s*([\w .-]{2,60})/gi))add('font',match[1]!.trim(),0.82)
  for(const line of text.split(/\r?\n/)){const value=line.trim();if(!value)continue;if(/(?:do not|never|prohibited|禁止|禁用)/i.test(value))add('prohibited-use',value,0.78);else if(/(?:guideline|principle|tone|voice|规范|原则)/i.test(value))add('guideline',value,0.72);else if(/(?:logo|标志|标识)/i.test(value))add('logo',value,0.62);else if(/(?:photography|摄影|照片风格)/i.test(value))add('photo',value,0.66)}
  return candidates
}

export function confirmBrandCandidates(candidates:readonly BrandCandidate[],confirmedIds:ReadonlySet<string>):readonly BrandCandidate[]{return candidates.map((candidate)=>brandCandidateSchema.parse({...candidate,status:confirmedIds.has(candidate.id)?'confirmed':'rejected'}))}
export function brandCandidateConflicts(candidates:readonly BrandCandidate[]){const confirmed=candidates.filter(({status})=>status==='confirmed'),groups=new Map<string,Set<string>>();for(const item of confirmed){const values=groups.get(item.kind)??new Set<string>();values.add(item.value.toLowerCase());groups.set(item.kind,values)}return[...groups].filter(([kind,values])=>['logo','font'].includes(kind)&&values.size>1).map(([kind,values])=>({kind,values:[...values]}))}
