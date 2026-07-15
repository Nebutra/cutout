import type { ComponentCompilerOutput } from '@/components-compiler'
import type { StarterPlan } from '@/starter-compiler'
import { RegistryItemSchema, type RegistryItem, type RegistryLicense } from './contracts'
import type { RegistryInstallInput } from './installer'
import type { GlobalLibraryItem, LibraryBlobRecord } from '@/global-library'

export interface RegistryProjectionOptions {
  readonly capturedAt: string
  readonly license: RegistryLicense
  readonly version?: string
  readonly previewAssets?: RegistryItem['previewAssets']
  readonly qualityReceipts?: RegistryItem['qualityReceipts']
}

export async function globalLibraryComponentToRegistry(item:GlobalLibraryItem,readBlob:(sha256:string)=>Promise<LibraryBlobRecord|null>):Promise<RegistryInstallInput>{
 if(item.kind!=='component-library-item')throw new Error('Only Global Library Component items can project to a component RegistryItem.')
 const files=await Promise.all(item.content.artifacts.map(async artifact=>{const blob=await readBlob(artifact.sha256);if(!blob)throw new Error(`Global Library source blob is missing: ${artifact.path}.`);if(blob.sha256!==artifact.sha256||blob.size!==artifact.size||blob.bytes.byteLength!==artifact.size||blob.mediaType!==artifact.mediaType)throw new Error(`Global Library source blob binding failed: ${artifact.path}.`);return{path:artifact.path,bytes:new Uint8Array(blob.bytes)}}))
 const registry=RegistryItemSchema.parse({schemaVersion:'cutout.registry-item.v1',id:item.id,version:item.version,kind:'component',metadata:{name:item.name,description:item.description,tags:item.tags.slice(0,40)},files:item.content.artifacts.map(artifact=>({path:artifact.path,mediaType:artifact.mediaType,size:artifact.size,sha256:artifact.sha256,role:libraryFileRole(artifact.path)})),designIrRefs:[],tokenRefs:[],dependencies:item.dependencies.map(dependency=>({id:dependency.itemId,version:dependency.version,optional:dependency.optional})),frameworks:item.compatibility.filter(entry=>entry.role==='framework'&&entry.status!=='incompatible').map(entry=>({id:entry.target,version:entry.versionRange,role:'target' as const})),provenance:[{id:`library.${item.id}`,source:item.origin.kind==='imported'?'imported':'local',capturedAt:item.updatedAt,actor:'system',contentSha256:item.contentSha256}],license:libraryLicense(item),qualityReceipts:item.qualityReceipts.map(receipt=>({gate:receipt.gate,status:receipt.status,checkedAt:receipt.checkedAt,tool:receipt.tool,evidence:receipt.evidence.map(({sha256,path})=>({sha256,...(path?{path}:{})})),...(receipt.summary?{summary:receipt.summary}:{})})),previewAssets:[]})
 return{item:registry,files}
}

export function componentCompilerToRegistry(output: ComponentCompilerOutput, options: RegistryProjectionOptions): RegistryInstallInput {
  const suffix = output.source.declarationFingerprint.slice(0, 12)
  const item = RegistryItemSchema.parse({
    schemaVersion: 'cutout.registry-item.v1', id: `cutout.component-contract.${suffix}`, version: options.version ?? `0.0.0-${suffix}`,
    kind: 'component', metadata: { name: 'Cutout component contracts', description: 'Explicit component candidate contracts and shadcn adapter plan. This item does not claim generated component source.', tags: ['component','contract','shadcn'] },
    files: output.files.map((file) => ({ path: `cutout/${file.path}`, mediaType: 'application/json', size: byteLength(file.content), sha256: file.sha256.toLowerCase(), role: 'contract' })),
    designIrRefs: [output.source.documentId, output.source.revisionId, ...manifestCandidates(output).map((candidate) => candidate.id)],
    tokenRefs: [...new Set(manifestCandidates(output).flatMap((candidate) => candidate.tokenRefs))].sort(), dependencies: [],
    frameworks: [{ id: 'next-app-router', role: 'target' }, { id: 'vite-react', role: 'target' }],
    provenance: [{ id: `component-${suffix}`, source: 'generated', capturedAt: options.capturedAt, actor: 'agent', contentSha256: output.source.declarationFingerprint.toLowerCase() }], license: options.license,
    qualityReceipts: [...gates(options.capturedAt, ['schema','provenance','license']), ...(options.qualityReceipts ?? [])], previewAssets: options.previewAssets ?? [],
  })
  return { item, files: output.files.map((file) => ({ path: `cutout/${file.path}`, bytes: new TextEncoder().encode(file.content) })) }
}

export function starterPlanToRegistry(plan: StarterPlan, options: RegistryProjectionOptions & { readonly componentDependency?: { readonly id: string; readonly version: string } }): RegistryInstallInput {
  const suffix = plan.source.candidateManifestFingerprint.slice(0, 12)
  const packageFile = plan.files.find((file) => file.path === 'package.json')
  const npmDependencies = packageFile ? packageDependencies(packageFile.content) : []
  const item = RegistryItemSchema.parse({
    schemaVersion: 'cutout.registry-item.v1', id: `cutout.starter.${plan.framework}.${suffix}`, version: options.version ?? `0.0.0-${suffix}`,
    kind: 'starter', metadata: { name: `${plan.framework} starter`, description: 'Deterministically compiled Cutout starter source from verified Design IR, Design Kit and component contracts.', tags: ['starter', plan.framework] },
    files: plan.files.map((file) => ({ path: file.path, mediaType: mediaType(file.path), size: byteLength(file.content), sha256: file.sha256.toLowerCase(), role: fileRole(file.path) })),
    designIrRefs: [plan.source.documentId, plan.source.revisionId], tokenRefs: [],
    dependencies: [...(options.componentDependency ? [{ ...options.componentDependency, kind: 'component' as const, optional: false }] : []), ...npmDependencies],
    frameworks: [{ id: plan.framework, role: 'target' }],
    provenance: [{ id: `starter-${suffix}`, source: 'generated', capturedAt: options.capturedAt, actor: 'agent', contentSha256: plan.source.documentFingerprint.toLowerCase() }], license: options.license,
    qualityReceipts: [...gates(options.capturedAt, ['schema','provenance','license']), ...(options.qualityReceipts ?? [])],
    previewAssets: options.previewAssets ?? previewFromAssets(plan),
  })
  return { item, files: plan.files.map((file) => ({ path: file.path, bytes: new TextEncoder().encode(file.content) })) }
}

function manifestCandidates(output: ComponentCompilerOutput): readonly { id: string; tokenRefs: readonly string[] }[] { const file = output.files.find((entry) => entry.path === 'components.manifest.json'); if (!file) throw new Error('Component compiler output is missing components.manifest.json.'); const value = JSON.parse(file.content) as { candidates?: unknown }; if (!Array.isArray(value.candidates)) throw new Error('Component manifest candidates are invalid.'); return value.candidates as { id: string; tokenRefs: readonly string[] }[] }
function gates(capturedAt: string, names: readonly ('schema'|'provenance'|'license')[]) { return names.map((gate) => ({ gate, status: 'passed' as const, checkedAt: capturedAt, tool: 'cutout.registry-projection.v1', evidence: [] })) }
function byteLength(value: string) { return new TextEncoder().encode(value).byteLength }
function mediaType(path: string) { if (path.endsWith('.json')) return 'application/json'; if (path.endsWith('.css')) return 'text/css'; if (path.endsWith('.md')) return 'text/markdown'; if (/\.[cm]?[jt]sx?$/.test(path)) return 'text/typescript'; return 'text/plain' }
function fileRole(path: string): 'source'|'contract'|'documentation'|'configuration'|'test' { if (path.endsWith('.md')) return 'documentation'; if (path.endsWith('.json') || path.endsWith('.css')) return 'configuration'; if (path.includes('.test.') || path.includes('.spec.')) return 'test'; return 'source' }
function packageDependencies(content: string) { const parsed = JSON.parse(content) as { dependencies?: Record<string,string>; devDependencies?: Record<string,string> }; return Object.entries({ ...parsed.dependencies, ...parsed.devDependencies }).sort(([a],[b]) => a.localeCompare(b)).map(([id,version]) => ({ id: id.replace(/^@/,'').replaceAll('/','.'), version, optional: false })) }
function previewFromAssets(plan: StarterPlan): RegistryItem['previewAssets'] { return plan.assets.filter((asset) => asset.sha256 && asset.mediaType?.startsWith('image/')).map((asset) => ({ path: asset.outputPath, mediaType: asset.mediaType!, sha256: asset.sha256!, alt: `Preview asset for ${asset.candidateId}` })) }
function libraryFileRole(path:string):'source'|'asset'|'contract'|'documentation'|'configuration'|'test'{if(/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path))return'test';if(path.endsWith('.md'))return'documentation';if(/(?:manifest|schema|contract)/i.test(path))return'contract';if(/\.(?:json|css|ya?ml|toml)$/.test(path))return'configuration';if(/\.(?:png|jpe?g|webp|gif|svg)$/.test(path))return'asset';return'source'}
function libraryLicense(item:GlobalLibraryItem):RegistryLicense{const value=item.license;if(value.kind==='spdx')return value;if(value.kind==='proprietary')return{kind:'proprietary',holder:value.holder,rationale:value.usage};if(value.kind==='public-domain')return{kind:'public-domain',...(value.evidenceRef?{rationale:`Evidence ${value.evidenceRef}`}:{})};return value}
