import { brandKitSchema, type BrandKit } from '@/brand-kit'
import { RegistryItemSchema, type RegistryInstallReceipt, type RegistryItem } from '@/registry'
import { starterPlanSchema, type StarterPlan } from '@/starter-compiler'
import { targetExecutionReceiptSchema, type TargetExecutionReceipt } from './contracts'
import type { DeliveryExecutor } from './runtime'

type DeliveryArtifact=TargetExecutionReceipt['artifacts'][number]
type QualityEvidence=TargetExecutionReceipt['quality'][number]

export interface LocalExportResult {
  readonly artifacts: readonly DeliveryArtifact[]
}

export interface LocalDeliveryHosts {
  exportBrandKit(kit: BrandKit, approvalId: string): Promise<LocalExportResult>
  exportStarter(plan: StarterPlan, approvalId: string): Promise<LocalExportResult>
  installRegistry(item: RegistryItem, approvalId: string): Promise<RegistryInstallReceipt>
}

export interface LocalDeliveryInputs {
  readonly brandKits?: Readonly<Record<string, BrandKit>>
  readonly starters?: Readonly<Record<string, StarterPlan>>
  readonly registryItems?: Readonly<Record<string, RegistryItem>>
}

export function createLocalDeliveryExecutors(input: LocalDeliveryInputs, hosts: LocalDeliveryHosts, now: () => string = () => new Date().toISOString()): readonly DeliveryExecutor[] {
  return [brandExecutor(input, hosts, now), starterExecutor(input, hosts, now), registryExecutor(input, hosts, now)]
}

function brandExecutor(input: LocalDeliveryInputs, hosts: LocalDeliveryHosts, now: () => string): DeliveryExecutor {
  return {
    kind: 'brand-kit',
    async preview(target) {
      requireManaged(target.destination.kind)
      const kit = brandKitSchema.parse(select(input.brandKits, metadataRef(target.metadata), 'Brand Kit'))
      return { targetId: target.id, kind: 'brand-kit', destination: target.destination, effects: ['managed-export'], estimatedCostUsd: 0, currency: 'USD', files: kit.files.map(({ path, sha256 }) => ({ path, sha256 })), warnings: [] }
    },
    async execute(target, context) {
      requireManaged(target.destination.kind)
      const startedAt = now(), kit = brandKitSchema.parse(select(input.brandKits, metadataRef(target.metadata), 'Brand Kit'))
      const result = await hosts.exportBrandKit(kit, context.approvalId)
      verifyArtifacts(kit.files, result.artifacts)
      const manifest = kit.files.find((file) => file.path === 'brand.manifest.json')!
      return targetExecutionReceiptSchema.parse({ targetId: target.id, kind: 'brand-kit', status: 'succeeded', destination: target.destination, startedAt, completedAt: now(), artifacts: result.artifacts, quality: provenanceQuality(manifest.sha256), kitManifests: [{ kind: 'brand-kit', id: kit.source.brandId, sha256: manifest.sha256 }] })
    },
  }
}

function starterExecutor(input: LocalDeliveryInputs, hosts: LocalDeliveryHosts, now: () => string): DeliveryExecutor {
  return {
    kind: 'starter',
    async preview(target) {
      requireManaged(target.destination.kind)
      const plan = starterPlanSchema.parse(select(input.starters, metadataRef(target.metadata), 'Starter'))
      return { targetId: target.id, kind: 'starter', destination: target.destination, effects: ['managed-export'], estimatedCostUsd: 0, currency: 'USD', files: plan.files.map(({ path, sha256 }) => ({ path, sha256 })), warnings: ['This export validates the deterministic Starter plan; it does not claim a package build or publish.'] }
    },
    async execute(target, context) {
      requireManaged(target.destination.kind)
      const startedAt = now(), plan = starterPlanSchema.parse(select(input.starters, metadataRef(target.metadata), 'Starter'))
      const result = await hosts.exportStarter(plan, context.approvalId)
      verifyArtifacts(plan.files, result.artifacts)
      return targetExecutionReceiptSchema.parse({ targetId: target.id, kind: 'starter', status: 'succeeded', destination: target.destination, startedAt, completedAt: now(), artifacts: result.artifacts, quality: provenanceQuality(plan.source.documentFingerprint), kitManifests: [] })
    },
  }
}

function registryExecutor(input: LocalDeliveryInputs, hosts: LocalDeliveryHosts, now: () => string): DeliveryExecutor {
  return {
    kind: 'registry',
    async preview(target) {
      requireManaged(target.destination.kind)
      const item = RegistryItemSchema.parse(select(input.registryItems, metadataRef(target.metadata), 'Registry item'))
      return { targetId: target.id, kind: 'registry', destination: target.destination, effects: ['managed-export'], estimatedCostUsd: 0, currency: 'USD', files: item.files.map(({ path, sha256 }) => ({ path, sha256 })), warnings: ['Install remains approval-gated and aborts on three-way conflicts.'] }
    },
    async execute(target, context) {
      requireManaged(target.destination.kind)
      const startedAt = now(), item = RegistryItemSchema.parse(select(input.registryItems, metadataRef(target.metadata), 'Registry item'))
      const receipt = await hosts.installRegistry(item, context.approvalId)
      if (receipt.itemId !== item.id || receipt.itemVersion !== item.version || receipt.approvalId !== context.approvalId) throw new Error('Registry host returned a receipt for another approved install.')
      const byPath = new Map(item.files.map((file) => [file.path, file]))
      const artifacts = receipt.fileHashes.map(({ path, baseHash }) => {
        const file = byPath.get(path)
        if (!file || file.sha256 !== baseHash) throw new Error(`Registry install receipt hash mismatch: ${path}.`)
        return { path, sha256: baseHash, mediaType: file.mediaType }
      })
      const contentSha256 = await hashJson(item.files.map(({ path, sha256 }) => ({ path, sha256 })).sort((a,b) => a.path.localeCompare(b.path)))
      return targetExecutionReceiptSchema.parse({ targetId: target.id, kind: 'registry', status: 'succeeded', destination: target.destination, startedAt, completedAt: now(), artifacts, quality: item.qualityReceipts.map(toQuality).filter(Boolean), kitManifests: [], registry: { itemId: item.id, version: item.version, contentSha256 } })
    },
  }
}

function metadataRef(metadata: Record<string, unknown>): string { const value=metadata.ref; if(typeof value!=='string'||!value.trim())throw new Error('Local delivery target metadata.ref is required.'); return value }
function select<T>(values:Readonly<Record<string,T>>|undefined,ref:string,label:string):T{const value=values?.[ref];if(!value)throw new Error(`${label} is unavailable: ${ref}.`);return value}
function requireManaged(kind:string){if(kind!=='managed-export')throw new Error('Local delivery executors only support managed exports.')}
function verifyArtifacts(expected:readonly {path:string;sha256:string}[],actual:readonly DeliveryArtifact[]){const received=new Map(actual.map((file)=>[file.path,file.sha256]));if(received.size!==expected.length||expected.some((file)=>received.get(file.path)!==file.sha256))throw new Error('Local export receipt does not match the previewed artifact set.')}
function provenanceQuality(hash:string):QualityEvidence[]{return [{gate:'provenance',status:'passed',evidenceIds:[`sha256:${hash}`],summary:'Content-addressed local compiler provenance verified.'}]}
function toQuality(receipt:RegistryItem['qualityReceipts'][number]):QualityEvidence|null{const gate=receipt.gate==='unit-test'?'unit-test':receipt.gate==='integration-test'?'integration-test':receipt.gate==='typecheck'?'typecheck':receipt.gate==='build'?'build':receipt.gate==='accessibility'?'accessibility':receipt.gate==='visual-regression'?'visual-regression':receipt.gate==='provenance'?'provenance':receipt.gate==='license'?'license':null;return gate?{gate,status:receipt.status,evidenceIds:receipt.evidence.map((e)=>`sha256:${e.sha256}`),...(receipt.summary?{summary:receipt.summary}:{})}:null}
async function hashJson(value:unknown){const bytes=new TextEncoder().encode(JSON.stringify(value));const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map((v)=>v.toString(16).padStart(2,'0')).join('')}
