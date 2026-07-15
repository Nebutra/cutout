import { describe, expect, it } from 'vitest'
import type { ComponentCompilerOutput } from '@/components-compiler'
import type { StarterPlan } from '@/starter-compiler'
import { RegistryItemSchema } from './contracts'
import { componentCompilerToRegistry, globalLibraryComponentToRegistry, starterPlanToRegistry } from './projections'
import type { GlobalLibraryItem, LibraryBlobRecord } from '@/global-library'
import { createNodeRegistryService } from './node-service'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const capturedAt = '2026-07-12T00:00:00.000Z'
const license = { kind: 'spdx' as const, identifier: 'Apache-2.0' }
async function digest(content: string) { const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content)); return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2,'0')).join('') }

describe('compiler registry projections', () => {
  it('binds one Global Library Component item to verified source blobs',async()=>{const content='export const Button=()=>null\n',bytes=new TextEncoder().encode(content),sha=await digest(content);const item={protocol:'cutout.global-library.v1',id:'cutout.button',version:'1.0.0',kind:'component-library-item',name:'Button',description:'Verified button source.',contentSha256:'b'.repeat(64),content:{manifestPath:'src/Button.tsx',manifestSha256:sha,artifacts:[{path:'src/Button.tsx',sha256:sha,mediaType:'text/plain',size:bytes.byteLength}]},origin:{kind:'bundled',producer:'cutout'},license, tags:['button'],collections:[],favorite:false,pinned:false,dependencies:[],compatibility:[{target:'vite-react',versionRange:'>=1',role:'framework',status:'verified',evidenceIds:[]}],qualityReceipts:[],lineage:{root:{itemId:'cutout.button',version:'1.0.0',contentSha256:'b'.repeat(64)},depth:0},createdAt:capturedAt,updatedAt:capturedAt} as GlobalLibraryItem;const blob={sha256:sha,mediaType:'text/plain',size:bytes.byteLength,bytes,createdAt:capturedAt,lastAccessedAt:capturedAt} satisfies LibraryBlobRecord;const projection=await globalLibraryComponentToRegistry(item,async()=>blob);expect(projection.item).toMatchObject({id:'cutout.button',kind:'component',frameworks:[{id:'vite-react',role:'target'}]});expect(Array.from(projection.files[0]?.bytes??[])).toEqual(Array.from(bytes));await expect(globalLibraryComponentToRegistry(item,async()=>null)).rejects.toThrow('source blob is missing')})
  it('projects component contracts deterministically without claiming source implementation', async () => {
    const manifest = `${JSON.stringify({ version: 'components.manifest.v1', candidates: [{ id: 'component.button', tokenRefs: ['token.color.primary'] }] })}\n`
    const adapter = '{}\n'; const fingerprint = 'a'.repeat(64); const declaration = 'b'.repeat(64)
    const output: ComponentCompilerOutput = { version: 'components.compiler.v1', source: { documentId: 'design.one', revisionId: 'revision.one', documentFingerprint: fingerprint, declarationFingerprint: declaration }, files: [{ path: 'components.manifest.json', content: manifest, sha256: await digest(manifest), sourceFingerprint: fingerprint }, { path: 'shadcn.adapter-plan.json', content: adapter, sha256: await digest(adapter), sourceFingerprint: fingerprint }] }
    const first = componentCompilerToRegistry(output, { capturedAt, license }); const second = componentCompilerToRegistry(output, { capturedAt, license })
    expect(first.item).toEqual(second.item); expect(RegistryItemSchema.safeParse(first.item).success).toBe(true)
    expect(first.item).toMatchObject({ kind: 'component', metadata: { description: expect.stringContaining('does not claim generated component source') }, designIrRefs: ['design.one','revision.one','component.button'], tokenRefs: ['token.color.primary'], frameworks: [{ id: 'next-app-router', role: 'target' }, { id: 'vite-react', role: 'target' }] })
    expect(first.files.map((file) => file.bytes.byteLength)).toEqual(first.item.files.map((file) => file.size))
  })

  it('projects a complete starter with framework, dependencies, quality and preview evidence', async () => {
    const packageJson = `${JSON.stringify({ dependencies: { react: '^19.0.0' }, devDependencies: { vite: '^8.0.0' } })}\n`; const source = 'export const App = () => null\n'
    const plan: StarterPlan = { version: 'starter-plan.v1', framework: 'vite-react', mergePolicy: 'fail', source: { documentId: 'design.one', revisionId: 'revision.one', documentFingerprint: 'a'.repeat(64), designKitFingerprint: 'b'.repeat(64), candidateManifestFingerprint: 'c'.repeat(64) }, files: [{ path: 'package.json', content: packageJson, sha256: await digest(packageJson) }, { path: 'src/App.tsx', content: source, sha256: await digest(source) }], assets: [{ outputPath: 'public/hero.png', candidateId: 'component.hero', materialId: 'material.hero', revisionId: 'material.r1', contentId: 'content.hero', sourceUri: 'sha256:hero', sha256: 'd'.repeat(64), mediaType: 'image/png' }] }
    const projection = starterPlanToRegistry(plan, { capturedAt, license, componentDependency: { id: 'cutout.component-contract.cccccccccccc', version: '0.0.0-cccccccccccc' }, qualityReceipts: [{ gate: 'typecheck', status: 'passed', checkedAt: capturedAt, tool: 'tsc', evidence: [] }] })
    expect(projection.item).toMatchObject({ kind: 'starter', frameworks: [{ id: 'vite-react', role: 'target' }], previewAssets: [{ path: 'public/hero.png', mediaType: 'image/png' }] })
    expect(projection.item.dependencies).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'react', version: '^19.0.0' }), expect.objectContaining({ id: 'vite', version: '^8.0.0' }), expect.objectContaining({ id: 'cutout.component-contract.cccccccccccc', kind: 'component' })]))
    expect(projection.item.qualityReceipts).toEqual(expect.arrayContaining([expect.objectContaining({ gate: 'typecheck', status: 'passed' })]))
    expect(RegistryItemSchema.safeParse(projection.item).success).toBe(true)
  })

  it('publishes a projection into the same list/search/get/install path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cutout-registry-projection-'))
    try {
      const content = 'export const App = () => null\n'; const plan: StarterPlan = { version: 'starter-plan.v1', framework: 'vite-react', mergePolicy: 'fail', source: { documentId: 'design.one', revisionId: 'revision.one', documentFingerprint: 'a'.repeat(64), designKitFingerprint: 'b'.repeat(64), candidateManifestFingerprint: 'c'.repeat(64) }, files: [{ path: 'src/App.tsx', content, sha256: await digest(content) }], assets: [] }
      const projection = starterPlanToRegistry(plan, { capturedAt, license }); const service = createNodeRegistryService(root)
      await service.publishBundled(projection)
      expect(await service.list({ framework: 'vite-react' })).toEqual([expect.objectContaining({ id: projection.item.id, kind: 'starter' })])
      expect(await service.list({ query: 'deterministically compiled' })).toHaveLength(1)
      expect(await service.get(projection.item.id)).toMatchObject({ schemaVersion: 'cutout.registry-item.v1' })
      const installPlan = await service.planInstall(projection.item.id, 'vite-react'); expect(installPlan.files).toEqual([expect.objectContaining({ status: 'create' })])
      const receipt = await service.applyInstall(projection.item.id, 'vite-react', 'approved-projection'); expect(receipt.status).toBe('succeeded')
      expect(await readFile(join(root, 'src/App.tsx'), 'utf8')).toBe(content)
    } finally { await rm(root, { recursive: true, force: true }) }
  })
})
