import { LOCAL_DATA_CONTRACT, type CrashMarkerStore, type DiagnosticBundle, type DiagnosticEvent, type RecoveryBackend, type RecoveryQuota, type RecoveryRepairReport, type RecoverySnapshot } from './contracts'

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const secretKey = /(?:authorization|token|secret|password|api[-_]?key|prompt|content|path|message)/i
const secretValue = /(?:\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b|Bearer\s+[A-Za-z0-9._~+/-]+|(?:\/Users|[A-Za-z]:\\)[^\s"']+)/gi

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  return `{${Object.entries(value as Record<string, unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer)
  return [...new Uint8Array(digest)].map((value)=>value.toString(16).padStart(2,'0')).join('')
}

export async function createRecoverySnapshot(input:{projectId:string;revision:number;value:unknown;createdAt:string}):Promise<RecoverySnapshot>{
  const bytes=encoder.encode(stableJson(input.value)),hash=await sha256(bytes)
  return{id:`snapshot:${input.projectId}:${input.revision}:${hash.slice(0,12)}`,...input,sha256:hash,bytes}
}

export async function verifyRecoverySnapshot(snapshot:RecoverySnapshot){return snapshot.sha256===await sha256(snapshot.bytes)}

export class LocalRecoveryService {
  private readonly backend:RecoveryBackend
  private readonly retention:number
  constructor(backend:RecoveryBackend,retention=5){this.backend=backend;this.retention=retention}
  async preflight(requiredBytes:number):Promise<RecoveryQuota>{const availableBytes=await this.backend.availableBytes();return{availableBytes,requiredBytes,ok:requiredBytes<=availableBytes}}
  async checkpoint(snapshot:RecoverySnapshot){const quota=await this.preflight(snapshot.bytes.byteLength);if(!quota.ok)throw new Error(`Insufficient local storage: requires ${quota.requiredBytes} bytes, ${quota.availableBytes} available.`);if(!await verifyRecoverySnapshot(snapshot))throw new Error('Snapshot hash verification failed.');await this.backend.putSnapshot(snapshot);const all=[...(await this.backend.listSnapshots(snapshot.projectId))].sort((a,b)=>b.revision-a.revision||b.createdAt.localeCompare(a.createdAt));for(const stale of all.slice(this.retention))await this.backend.removeSnapshot(stale.id)}
  async restore(projectId:string,snapshotId?:string){const all=await this.backend.listSnapshots(projectId),selected=snapshotId?all.find((item)=>item.id===snapshotId):[...all].sort((a,b)=>b.revision-a.revision)[0];if(!selected)throw new Error('No recovery snapshot is available.');if(!await verifyRecoverySnapshot(selected))throw new Error('Recovery snapshot is corrupt.');if(await this.backend.projectionExists(projectId))throw new Error('Restore collision: a local projection already exists.');await this.backend.rebuildProjection(projectId,selected.bytes);return JSON.parse(decoder.decode(selected.bytes)) as unknown}
  async repair(projectId:string):Promise<RecoveryRepairReport>{const removedCorruptSnapshots:string[]=[];for(const snapshot of await this.backend.listSnapshots(projectId))if(!await verifyRecoverySnapshot(snapshot)){removedCorruptSnapshots.push(snapshot.id);await this.backend.removeSnapshot(snapshot.id)}const live=new Set((await this.backend.listSnapshots(projectId)).map((item)=>item.id)),removedOrphanBlobs:string[]=[];for(const blob of await this.backend.listBlobs())if(blob.referencedBy.every((id)=>!live.has(id))){removedOrphanBlobs.push(blob.id);await this.backend.removeBlob(blob.id)}const latest=[...(await this.backend.listSnapshots(projectId))].sort((a,b)=>b.revision-a.revision)[0];let rebuiltProjection=false;if(latest&&!await this.backend.projectionExists(projectId)){await this.backend.rebuildProjection(projectId,latest.bytes);rebuiltProjection=true}return{removedCorruptSnapshots,removedOrphanBlobs,rebuiltProjection}}
  async migrate(projectId:string,migrate:(value:unknown)=>unknown){const latest=[...(await this.backend.listSnapshots(projectId))].sort((a,b)=>b.revision-a.revision)[0];if(!latest||!await verifyRecoverySnapshot(latest))throw new Error('A verified source snapshot is required for migration.');const value=migrate(JSON.parse(decoder.decode(latest.bytes)));const next=await createRecoverySnapshot({projectId,revision:latest.revision+1,value,createdAt:new Date().toISOString()});await this.checkpoint(next);return next}
}

export function startCrashSession(store:CrashMarkerStore,input:{sessionId:string;now:string}){const previous=store.read(),crashed=Boolean(previous&&!previous.cleanExit),marker={sessionId:input.sessionId,startedAt:input.now,cleanExit:false,crashCount:(previous?.crashCount??0)+(crashed?1:0)};store.write(marker);return{crashed,safeMode:marker.crashCount>=2,marker}}
export function markCleanExit(store:CrashMarkerStore){const current=store.read();if(current)store.write({...current,cleanExit:true})}
export function resetUiState(store:Pick<Storage,'removeItem'>,keys:readonly string[]){for(const key of keys)store.removeItem(key)}
export function createLocalStorageCrashMarkerStore(storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>,key='cutout.crash-marker'):CrashMarkerStore{return{read(){try{const value=storage.getItem(key);return value?JSON.parse(value) as import('./contracts').CrashMarker:undefined}catch{return undefined}},write(marker){storage.setItem(key,JSON.stringify(marker))},clear(){storage.removeItem(key)}}}

export function redactDiagnosticValue(value:unknown):unknown{
  if(typeof value==='string')return value.replace(secretValue,'<redacted>')
  if(Array.isArray(value))return value.map(redactDiagnosticValue)
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value as Record<string,unknown>).filter(([key])=>!secretKey.test(key)).map(([key,item])=>[key,redactDiagnosticValue(item)]))
  return value
}
export function createDiagnosticBundle(input:{generatedAt:string;version:string;safeMode:boolean;events:readonly DiagnosticEvent[]}):DiagnosticBundle{return{protocol:'cutout.diagnostics.v1',generatedAt:input.generatedAt,app:{version:input.version,safeMode:input.safeMode},storage:LOCAL_DATA_CONTRACT,events:[...input.events].sort((a,b)=>a.at.localeCompare(b.at)||a.correlationId.localeCompare(b.correlationId)).map((event)=>({...event,...(event.details===undefined?{}:{details:redactDiagnosticValue(event.details)})}))}}
export function diagnosticBundleBytes(bundle:DiagnosticBundle){return encoder.encode(`${stableJson(bundle)}\n`)}

export function correlateTrace(input:{correlationId:string;ui?:unknown;tauri?:unknown;host?:unknown}):readonly DiagnosticEvent[]{return(['ui','tauri','host'] as const).flatMap((scope)=>input[scope]===undefined?[]:[{at:'1970-01-01T00:00:00.000Z',level:'info' as const,scope,code:'trace',correlationId:input.correlationId,details:redactDiagnosticValue(input[scope])}])}
export function doctorProviderConnection(input:{configured:boolean;model?:string;visionRequired?:boolean;visionCapable?:boolean;lastError?:string}){const issues:string[]=[];if(!input.configured)issues.push('Provider is not configured.');if(!input.model)issues.push('No model is assigned.');if(input.visionRequired&&!input.visionCapable)issues.push('The assigned model does not provide required vision capability.');if(input.lastError)issues.push(String(redactDiagnosticValue(input.lastError)));return{ok:issues.length===0,issues}}
