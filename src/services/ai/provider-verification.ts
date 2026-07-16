import{z}from'zod'
const KEY='cutout.provider-verification.v1',record=z.object({status:z.enum(['unverified','verified','failed']),checkedAt:z.string().datetime().optional(),model:z.string().min(1).optional(),detail:z.string().max(500).optional()}).strict();export type ProviderVerification=z.infer<typeof record>
export function loadProviderVerifications(storage?:Pick<Storage,'getItem'>):Readonly<Record<string,ProviderVerification>>{try{const value=JSON.parse((storage??globalThis.localStorage)?.getItem(KEY)??'{}');return z.record(z.string(),record).parse(value)}catch{return{}}}
export function setProviderVerification(providerId:string,value:ProviderVerification,storage?:Pick<Storage,'getItem'|'setItem'>){const host=storage??globalThis.localStorage;if(!host)return;host.setItem(KEY,JSON.stringify({...loadProviderVerifications(host),[providerId]:record.parse(value)}))}
export function providerVerified(providerId:string,storage?:Pick<Storage,'getItem'>){return loadProviderVerifications(storage)[providerId]?.status==='verified'}
/** Auto routing is fail-closed. Legacy providers remain explicitly selectable until re-verified. */
export function providerEligibleForAuto(providerId:string,storage?:Pick<Storage,'getItem'>){return providerVerified(providerId,storage)}
/**
 * Lazy migration for installs that predate verification receipts: settle a
 * provider with no conclusive record by running the probe once (same check as
 * Settings "Verify") and persisting the outcome. Conclusive records are
 * returned as-is — this never re-probes a verified or failed provider.
 */
export async function ensureProviderVerification(providerId:string,probe:()=>Promise<{model:string}>,storage?:Pick<Storage,'getItem'|'setItem'>):Promise<ProviderVerification['status']>{
  const existing=loadProviderVerifications(storage)[providerId]?.status
  if(existing==='verified'||existing==='failed')return existing
  try{const{model}=await probe();setProviderVerification(providerId,{status:'verified',model,checkedAt:new Date().toISOString()},storage);return'verified'}
  catch(error){setProviderVerification(providerId,{status:'failed',checkedAt:new Date().toISOString(),detail:error instanceof Error?error.message:String(error)},storage);return'failed'}
}
