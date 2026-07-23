const DB = 'cutout-global-library'
const VERSION = 2
const STORE = 'content-blobs'
const CATALOG = 'catalog'
const SAFE_MEDIA = /^(?:image\/(?:png|jpeg|webp|gif|bmp)|video\/(?:mp4|webm)|application\/(?:json|pdf)|text\/(?:plain|css|markdown))$/i

export interface LibraryBlobRecord { readonly sha256:string; readonly mediaType:string; readonly size:number; readonly bytes:Uint8Array; readonly createdAt:string; readonly lastAccessedAt:string }
export interface LibraryBlobQuota { readonly maximumBytes:number; readonly usedBytes:number; readonly availableBytes:number }

export class IndexedDbLibraryBlobStore {
  readonly factory:IDBFactory;readonly maximumBytes:number;readonly now:()=>string
  constructor(factory:IDBFactory,maximumBytes=512*1024*1024,now=()=>new Date().toISOString()){this.factory=factory;this.maximumBytes=maximumBytes;this.now=now}
  async put(bytes:Uint8Array, mediaType:string):Promise<LibraryBlobRecord> {
    assertSafeMediaType(mediaType); const sha256=await digest(bytes); const db=await open(this.factory)
    try { const existing=await req(db.transaction(STORE,'readonly').objectStore(STORE).get(sha256)) as LibraryBlobRecord|undefined; if(existing)return existing
      const quota=await this.quota(db); if(bytes.byteLength>quota.availableBytes)throw new Error(`Global Library blob quota exceeded by ${bytes.byteLength-quota.availableBytes} bytes.`)
      const at=this.now(),record={sha256,mediaType,size:bytes.byteLength,bytes:new Uint8Array(bytes),createdAt:at,lastAccessedAt:at}; const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);if(store.keyPath)store.add(record);else store.add(record,sha256);try{await done(tx);return record}catch(error){const concurrent=await this.get(sha256);if(concurrent)return concurrent;throw error}
    } finally { db.close() }
  }
  async get(sha256:string):Promise<LibraryBlobRecord|null> { const db=await open(this.factory);try{const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE),record=await req(store.get(sha256)) as LibraryBlobRecord|undefined;if(!record)return null;const next={...record,lastAccessedAt:this.now()};if(store.keyPath)store.put(next);else store.put(next,sha256);await done(tx);return next}finally{db.close()} }
  async quota(db?:IDBDatabase):Promise<LibraryBlobQuota>{const owned=!db,handle=db??await open(this.factory);try{const records=await req(handle.transaction(STORE,'readonly').objectStore(STORE).getAll()) as LibraryBlobRecord[];const usedBytes=records.reduce((sum,item)=>sum+item.size,0);return{maximumBytes:this.maximumBytes,usedBytes,availableBytes:Math.max(0,this.maximumBytes-usedBytes)}}finally{if(owned)handle.close()} }
  async collectGarbage(referencedSha256:ReadonlySet<string>):Promise<{deleted:number;freedBytes:number}>{const db=await open(this.factory);try{const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE),records=await req(store.getAll()) as LibraryBlobRecord[];let deleted=0,freedBytes=0;for(const record of records)if(!referencedSha256.has(record.sha256)){store.delete(record.sha256);deleted++;freedBytes+=record.size}await done(tx);return{deleted,freedBytes}}finally{db.close()} }
}

export async function validateMediaBlob(record:LibraryBlobRecord):Promise<void>{assertSafeMediaType(record.mediaType);if(record.size!==record.bytes.byteLength)throw new Error('Library blob size does not match its bytes.');if(await digest(record.bytes)!==record.sha256)throw new Error('Library blob hash verification failed.');if(record.mediaType.startsWith('image/')&&typeof createImageBitmap==='function'){const bitmap=await createImageBitmap(new Blob([record.bytes as BlobPart],{type:record.mediaType}));try{if(bitmap.width<1||bitmap.height<1)throw new Error('Image has invalid dimensions.')}finally{bitmap.close()}}}
export function assertSafeMediaType(mediaType:string){if(!SAFE_MEDIA.test(mediaType))throw new Error(`Unsupported Global Library media type: ${mediaType}`)}
async function digest(bytes:Uint8Array){const value=await crypto.subtle.digest('SHA-256',bytes as BufferSource);return [...new Uint8Array(value)].map((byte)=>byte.toString(16).padStart(2,'0')).join('')}
function open(factory:IDBFactory){return new Promise<IDBDatabase>((resolve,reject)=>{const value=factory.open(DB,VERSION);value.onupgradeneeded=()=>{if(!value.result.objectStoreNames.contains(CATALOG))value.result.createObjectStore(CATALOG);if(!value.result.objectStoreNames.contains(STORE))value.result.createObjectStore(STORE)};value.onsuccess=()=>resolve(value.result);value.onerror=()=>reject(value.error)})}
function req<T>(value:IDBRequest<T>){return new Promise<T>((resolve,reject)=>{value.onsuccess=()=>resolve(value.result);value.onerror=()=>reject(value.error)})}
function done(tx:IDBTransaction){return new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error??new Error('Blob transaction failed.'));tx.onabort=()=>reject(tx.error??new Error('Blob transaction aborted.'))})}
