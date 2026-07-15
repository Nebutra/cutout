/**
 * Starter Compiler v1 turns verified design facts into a deterministic export
 * plan. It never executes candidate code, accesses the filesystem, or fetches
 * assets. A host can later apply the plan through StarterExportAdapter.
 */
import { z } from 'zod'
import {
  componentManifestSchema,
  validateComponentManifest as validatePersistedComponentManifest,
  type ComponentManifest,
} from '@/components-compiler'
import { designKitSchema, type DesignKit } from '@/design-kit'
import { fingerprint, validateDesignDocument, type ContentReference, type DesignDocument } from '@/design-ir'
import type { PrototypePage, PrototypeRegion } from '@/prototype/prototype-plan'

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i)
const safeRelativePathSchema = z.string()
  .min(1)
  .max(240)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, 'Expected a safe relative path.')
  .refine((path) => !path.split('/').some((segment) => segment === '.' || segment === '..' || segment.length === 0), 'Expected a safe relative path.')
  .refine((path) => !path.startsWith('/'), 'Expected a safe relative path.')

export const starterFrameworkSchema = z.enum(['next-app-router', 'vite-react', 'nuxt', 'tanstack-start'])
export const starterMergePolicySchema = z.literal('fail')

export const starterAssetBindingSchema = z.object({
  candidateId: z.string().min(1).max(160),
  materialId: z.string().min(1).max(160),
  revisionId: z.string().min(1).max(160),
  /** Relative to `public/`; a compiler host controls actual copying. */
  outputPath: safeRelativePathSchema,
}).strict()

export const starterCompilerInputSchema = z.object({
  framework: starterFrameworkSchema,
  document: z.unknown(),
  kit: designKitSchema,
  /** Canonical public manifest emitted by components-compiler. */
  candidates: componentManifestSchema,
  assetBindings: z.array(starterAssetBindingSchema).max(10_000).default([]),
  /** v1 deliberately refuses all collision merging. */
  mergePolicy: starterMergePolicySchema,
  /** Existing target paths are declarative collision checks, never read from disk. */
  existingPaths: z.array(safeRelativePathSchema).max(10_000).default([]),
}).strict()

export const starterFileSchema = z.object({
  path: safeRelativePathSchema,
  content: z.string(),
  sha256: sha256Schema,
}).strict()

export const starterAssetSchema = z.object({
  outputPath: safeRelativePathSchema,
  candidateId: z.string().min(1),
  materialId: z.string().min(1),
  revisionId: z.string().min(1),
  contentId: z.string().min(1),
  sourceUri: z.string().min(1),
  sha256: sha256Schema.optional(),
  mediaType: z.string().min(1).optional(),
}).strict()

export const starterPlanSchema = z.object({
  version: z.literal('starter-plan.v1'),
  framework: starterFrameworkSchema,
  mergePolicy: starterMergePolicySchema,
  source: z.object({
    documentId: z.string().min(1),
    revisionId: z.string().min(1),
    documentFingerprint: sha256Schema,
    designKitFingerprint: sha256Schema,
    candidateManifestFingerprint: sha256Schema,
  }).strict(),
  files: z.array(starterFileSchema),
  assets: z.array(starterAssetSchema),
}).strict()

export { componentManifestSchema as componentCandidateManifestSchema } from '@/components-compiler'
export type { ComponentManifest as ComponentCandidateManifest } from '@/components-compiler'
export type StarterAssetBinding = z.infer<typeof starterAssetBindingSchema>
export interface StarterCompilerInput {
  readonly framework: z.infer<typeof starterFrameworkSchema>
  readonly document: DesignDocument
  readonly kit: DesignKit
  readonly candidates: ComponentManifest
  readonly assetBindings?: readonly StarterAssetBinding[]
  readonly mergePolicy: z.infer<typeof starterMergePolicySchema>
  readonly existingPaths?: readonly string[]
}
export type StarterFile = z.infer<typeof starterFileSchema>
export type StarterAsset = z.infer<typeof starterAssetSchema>
export type StarterPlan = z.infer<typeof starterPlanSchema>

/**
 * Future host boundary. The compiler produces no filesystem side effects;
 * Node, Tauri, CLI, or MCP hosts may implement this adapter independently.
 */
export interface StarterExportAdapter<TTarget = unknown, TResult = unknown> {
  export(plan: StarterPlan, target: TTarget): Promise<TResult>
}

/** Compile an auditable in-memory plan. No arbitrary source code is accepted. */
export async function compileStarter(input: StarterCompilerInput): Promise<StarterPlan> {
  const parsed = starterCompilerInputSchema.parse(input)
  const documentValidation = validateDesignDocument(parsed.document)
  if (!documentValidation.ok) throw new Error(`Invalid DesignDocument: ${documentValidation.error}`)
  const document = documentValidation.data.document
  const documentFingerprint = await fingerprint(document)
  await validateDesignKit(document, parsed.kit, documentFingerprint)
  const manifest = await validatePersistedComponentManifest(document, parsed.candidates)
  const candidates = resolveCandidates(document, manifest)
  const assets = resolveAssets(document, candidates, parsed.assetBindings)

  const fileContent = [
    ...renderKitFiles(parsed.kit),
    ...(parsed.framework === 'nuxt' ? renderNuxtSharedFiles(document, manifest, candidates, assets) : renderSharedFiles(document, manifest, candidates, assets)),
    ...(parsed.framework === 'next-app-router' ? renderNextFiles(document, candidates)
      : parsed.framework === 'vite-react' ? renderViteFiles(document, candidates)
        : parsed.framework === 'nuxt' ? renderNuxtFiles(document, candidates)
          : renderTanStackFiles(document, candidates)),
  ]
  const files = await Promise.all(fileContent.map(async (entry) => ({
    ...entry,
    sha256: await sha256Text(entry.content),
  })))
  assertNoCollisions(files, assets, parsed.existingPaths)

  const plan = {
    version: 'starter-plan.v1' as const,
    framework: parsed.framework,
    mergePolicy: parsed.mergePolicy,
    source: {
      documentId: document.meta.id,
      revisionId: document.revision.id,
      documentFingerprint,
      designKitFingerprint: await fingerprint(parsed.kit),
      candidateManifestFingerprint: await fingerprint(normalizeManifest(manifest)),
    },
    files: files.sort(comparePath),
    assets: [...assets].sort((left, right) => compareText(left.outputPath, right.outputPath)),
  }
  const validated = starterPlanSchema.parse(plan)
  validateStarterPlanStructure(validated)
  return validated
}

/** Offline equivalent to a framework build when consumer packages are absent. */
export function validateStarterPlanStructure(planInput: StarterPlan): void {
  const plan = starterPlanSchema.parse(planInput)
  const files = new Map(plan.files.map((file) => [file.path, file.content]))
  for (const required of ['package.json', 'README.md', 'AGENTS.md', 'components.manifest.json', 'design-kit/tokens.css']) if (!files.has(required)) throw new Error(`Starter is missing required file "${required}".`)
  const pkg = JSON.parse(files.get('package.json')!) as { private?: boolean; scripts?: Record<string, string> }
  if (pkg.private !== true || !pkg.scripts?.dev || !pkg.scripts?.build) throw new Error('Starter package must be private and declare dev/build scripts.')
  if (plan.framework === 'nuxt') {
    for (const required of ['nuxt.config.ts', 'app.vue', 'cutout.registry.json']) if (!files.has(required)) throw new Error(`Nuxt starter is missing "${required}".`)
    if (![...files.keys()].some((path) => path.startsWith('pages/') && path.endsWith('.vue'))) throw new Error('Nuxt starter has no file-based page.')
    if (![...files.keys()].some((path) => path.startsWith('components/generated/') && path.endsWith('.vue'))) throw new Error('Nuxt starter has no native Vue component.')
  }
  if (plan.framework === 'tanstack-start') {
    for (const required of ['src/main.tsx', 'src/router.tsx', 'vite.config.ts', 'index.html', 'cutout.registry.json']) if (!files.has(required)) throw new Error(`TanStack starter is missing "${required}".`)
    const router = files.get('src/router.tsx')!
    if (!router.includes('createRouter({ routeTree })') || !router.includes('createRoute(')) throw new Error('TanStack starter has no explicit route tree.')
  }
  if (plan.files.some((file) => /\b(?:TODO|placeholder)\b/i.test(file.content))) throw new Error('Starter contains placeholder implementation content.')
}

interface ResolvedCandidate {
  readonly id: string
  readonly componentId: string
  readonly exportName: string
  readonly name: string
  readonly description?: string
  readonly tokenIds: readonly string[]
  readonly props: ComponentManifest['candidates'][number]['props']
  readonly variants: ComponentManifest['candidates'][number]['variants']
  readonly slots: ComponentManifest['candidates'][number]['slots']
  readonly sourcePageIds: readonly string[]
}

async function validateDesignKit(document: DesignDocument, kit: DesignKit, documentFingerprint: string): Promise<void> {
  if (kit.source.documentId !== document.meta.id || kit.source.revisionId !== document.revision.id) {
    throw new Error('Design Kit does not belong to this DesignDocument revision.')
  }
  if (kit.source.documentFingerprint !== documentFingerprint) {
    throw new Error('Design Kit document fingerprint does not match this DesignDocument.')
  }
  const paths = new Set<string>()
  for (const file of kit.files) {
    if (paths.has(file.path)) throw new Error(`Design Kit contains duplicate file "${file.path}".`)
    paths.add(file.path)
    if (file.sourceFingerprint !== documentFingerprint) {
      throw new Error(`Design Kit file "${file.path}" does not match this DesignDocument fingerprint.`)
    }
    if (file.provenance.documentId !== document.meta.id || file.provenance.revisionId !== document.revision.id) {
      throw new Error(`Design Kit file "${file.path}" has mismatched provenance.`)
    }
    if (await sha256Text(file.content) !== file.sha256) {
      throw new Error(`Design Kit file "${file.path}" has an invalid content digest.`)
    }
  }
}

function resolveCandidates(document: DesignDocument, manifest: ComponentManifest): readonly ResolvedCandidate[] {
  const componentById = new Map(document.components.map((component) => [component.id, component]))
  const tokenIds = new Set(document.tokens.map((token) => token.id))
  const candidateIds = new Set<string>()
  const exports = new Set<string>()
  const resolved: ResolvedCandidate[] = []

  for (const candidate of manifest.candidates) {
    if (candidateIds.has(candidate.id)) throw new Error(`Component candidate "${candidate.id}" is declared more than once.`)
    candidateIds.add(candidate.id)
    const exportName = toExportName(candidate.name, candidate.id)
    if (exports.has(exportName)) throw new Error(`Component candidates use duplicate export "${exportName}".`)
    exports.add(exportName)
    if (candidate.status !== 'ready') throw new Error(`Component candidate "${candidate.id}" is not ready for starter export.`)
    const component = componentById.get(candidate.id)
    if (!component) throw new Error(`Component candidate "${candidate.id}" references unknown component "${candidate.id}".`)
    if (component.status !== 'ready') throw new Error(`Component "${component.id}" is not ready for starter export.`)
    const declaredTokens = new Set(component.tokenIds)
    const candidateTokenIds = new Set<string>()
    for (const tokenId of candidate.tokenRefs) {
      if (candidateTokenIds.has(tokenId)) throw new Error(`Component candidate "${candidate.id}" references token "${tokenId}" more than once.`)
      candidateTokenIds.add(tokenId)
      if (!tokenIds.has(tokenId)) throw new Error(`Component candidate "${candidate.id}" references unknown token "${tokenId}".`)
      if (!declaredTokens.has(tokenId)) throw new Error(`Component candidate "${candidate.id}" references token "${tokenId}" not declared by component "${component.id}".`)
    }
    resolved.push({
      id: candidate.id,
      componentId: component.id,
      exportName,
      name: component.name,
      ...(component.description ? { description: component.description } : {}),
      tokenIds: [...candidateTokenIds].sort(compareText),
      props: candidate.props,
      variants: candidate.variants,
      slots: candidate.slots,
      sourcePageIds: candidate.sourcePageIds,
    })
  }
  return resolved.sort((left, right) => compareText(left.exportName, right.exportName))
}

function resolveAssets(
  document: DesignDocument,
  candidates: readonly ResolvedCandidate[],
  bindings: readonly z.infer<typeof starterAssetBindingSchema>[],
): readonly StarterAsset[] {
  const revisions = new Map<string, { readonly materialId: string; readonly revisionId: string; readonly content: ContentReference }>()
  for (const material of document.materials) {
    for (const revision of material.revisions) {
      revisions.set(`${material.id}\u0000${revision.id}`, { materialId: material.id, revisionId: revision.id, content: revision.content })
    }
  }
  const outputPaths = new Set<string>()
  const assets: StarterAsset[] = []
  const candidateIds = new Set(candidates.map((candidate) => candidate.id))
  const bindingIds = new Set<string>()
  for (const assetRef of bindings) {
      if (!candidateIds.has(assetRef.candidateId)) throw new Error(`Starter asset binding references unknown ready candidate "${assetRef.candidateId}".`)
      const bindingKey = `${assetRef.candidateId}\u0000${assetRef.materialId}\u0000${assetRef.revisionId}\u0000${assetRef.outputPath}`
      if (bindingIds.has(bindingKey)) throw new Error(`Starter asset binding is declared more than once for "${assetRef.outputPath}".`)
      bindingIds.add(bindingKey)
      const source = revisions.get(`${assetRef.materialId}\u0000${assetRef.revisionId}`)
      if (!source) throw new Error(`Starter asset binding references unknown material revision "${assetRef.materialId}/${assetRef.revisionId}".`)
      const outputPath = `public/${assetRef.outputPath}`
      if (outputPaths.has(outputPath)) throw new Error(`Starter asset output path collides: "${outputPath}".`)
      outputPaths.add(outputPath)
      assets.push({
        outputPath,
        candidateId: assetRef.candidateId,
        materialId: source.materialId,
        revisionId: source.revisionId,
        contentId: source.content.id,
        sourceUri: source.content.uri,
        ...(source.content.sha256 ? { sha256: source.content.sha256 } : {}),
        ...(source.content.mediaType ? { mediaType: source.content.mediaType } : {}),
      })
  }
  return assets
}

function renderKitFiles(kit: DesignKit): readonly Omit<StarterFile, 'sha256'>[] {
  return kit.files.map((file) => ({ path: `design-kit/${file.path}`, content: file.content }))
}

function renderSharedFiles(
  document: DesignDocument,
  manifest: ComponentManifest,
  candidates: readonly ResolvedCandidate[],
  assets: readonly StarterAsset[],
): readonly Omit<StarterFile, 'sha256'>[] {
  return [
    { path: 'components.manifest.json', content: `${JSON.stringify(normalizeManifest(manifest), null, 2)}\n` },
    { path: 'src/theme.ts', content: [
      '/** Generated Design Kit bridge. */',
      "export { theme } from '../design-kit/theme'",
      "export type { Theme } from '../design-kit/theme'",
      '',
    ].join('\n') },
    { path: 'src/env.d.ts', content: "declare module '*.css'\n" },
    ...candidates.map((candidate) => ({
      path: `src/components/${candidate.exportName}.tsx`,
      content: renderComponent(document, candidate, assets),
    })),
    { path: 'src/components/generated.css', content: renderComponentCss(document, candidates) },
  ]
}

function renderNextFiles(document: DesignDocument, candidates: readonly ResolvedCandidate[]): readonly Omit<StarterFile, 'sha256'>[] {
  const pages = document.prototype?.plan.pages ?? []
  return [
    { path: 'package.json', content: renderPackageJson('next-app-router', document.meta.title) },
    { path: 'tsconfig.json', content: `${JSON.stringify({ compilerOptions: { target: 'ES2022', lib: ['dom', 'dom.iterable', 'es2022'], strict: true, noEmit: true, jsx: 'preserve', module: 'esnext', moduleResolution: 'bundler', resolveJsonModule: true, isolatedModules: true }, include: ['**/*.ts', '**/*.tsx', '.next/types/**/*.ts'] }, null, 2)}\n` },
    { path: 'app/globals.css', content: '@import "../design-kit/tailwind.css";\n@import "../design-kit/tokens.css";\n@import "../src/components/generated.css";\n\n:root { color-scheme: light; }\n* { box-sizing: border-box; }\nbody { margin: 0; font-family: var(--cutout-typography-sans, system-ui, sans-serif); }\n' },
    { path: 'app/layout.tsx', content: `import type { ReactNode } from 'react'\nimport './globals.css'\n\nexport default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {\n  return <html lang="en"><body>{children}</body></html>\n}\n` },
    ...pages.map((page) => ({ path: nextPagePath(page.route), content: renderPage(document, page, candidates, nextImportPrefix(page.route)) })),
    { path: 'README.md', content: renderReadme(document, 'Next.js App Router') },
    { path: 'AGENTS.md', content: renderAgents('Next.js App Router') },
  ]
}

function renderViteFiles(document: DesignDocument, candidates: readonly ResolvedCandidate[]): readonly Omit<StarterFile, 'sha256'>[] {
  return [
    { path: 'package.json', content: renderPackageJson('vite-react', document.meta.title) },
    { path: 'tsconfig.json', content: `${JSON.stringify({ compilerOptions: { target: 'ES2022', useDefineForClassFields: true, lib: ['dom', 'dom.iterable', 'es2022'], strict: true, noEmit: true, jsx: 'react-jsx', module: 'esnext', moduleResolution: 'bundler', resolveJsonModule: true, isolatedModules: true }, include: ['src'] }, null, 2)}\n` },
    { path: 'index.html', content: '<!doctype html>\n<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Cutout starter</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n' },
    { path: 'vite.config.ts', content: "import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\n\nexport default defineConfig({ plugins: [react()] })\n" },
    { path: 'src/styles.css', content: '@import "../design-kit/tailwind.css";\n@import "../design-kit/tokens.css";\n@import "./components/generated.css";\n\n:root { color-scheme: light; }\n* { box-sizing: border-box; }\nbody { margin: 0; font-family: var(--cutout-typography-sans, system-ui, sans-serif); }\n' },
    { path: 'src/main.tsx', content: "import { StrictMode } from 'react'\nimport { createRoot } from 'react-dom/client'\nimport './styles.css'\nimport { App } from './App'\n\ncreateRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)\n" },
    { path: 'src/App.tsx', content: renderViteRouter(document, candidates) },
    { path: 'README.md', content: renderReadme(document, 'Vite + React') },
    { path: 'AGENTS.md', content: renderAgents('Vite + React') },
  ]
}

function renderNuxtSharedFiles(document: DesignDocument, manifest: ComponentManifest, candidates: readonly ResolvedCandidate[], assets: readonly StarterAsset[]): readonly Omit<StarterFile, 'sha256'>[] {
  return [
    { path: 'components.manifest.json', content: `${JSON.stringify(normalizeManifest(manifest), null, 2)}\n` },
    ...candidates.map((candidate) => ({ path: `components/generated/${candidate.exportName}.vue`, content: renderVueComponent(candidate, assets) })),
    { path: 'assets/css/generated.css', content: renderComponentCss(document, candidates) },
  ]
}

function renderNuxtFiles(document: DesignDocument, candidates: readonly ResolvedCandidate[]): readonly Omit<StarterFile, 'sha256'>[] {
  const pages = document.prototype?.plan.pages ?? []
  return [
    { path: 'package.json', content: renderPackageJson('nuxt', document.meta.title) },
    { path: 'nuxt.config.ts', content: "export default defineNuxtConfig({ css: ['~/design-kit/tailwind.css', '~/design-kit/tokens.css', '~/assets/css/generated.css'], devtools: { enabled: true }, typescript: { strict: true } })\n" },
    { path: 'tsconfig.json', content: `${JSON.stringify({ extends: './.nuxt/tsconfig.json' }, null, 2)}\n` },
    { path: 'app.vue', content: '<template><NuxtPage /></template>\n' },
    ...pages.map((page) => ({ path: nuxtPagePath(page.route), content: renderNuxtPage(document, page, candidates) })),
    { path: 'README.md', content: renderReadme(document, 'Nuxt') },
    { path: 'AGENTS.md', content: renderAgents('Nuxt') },
    { path: 'cutout.registry.json', content: registryMetadata('nuxt', document, pages.map((page) => page.route), candidates) },
  ]
}

function renderTanStackFiles(document: DesignDocument, candidates: readonly ResolvedCandidate[]): readonly Omit<StarterFile, 'sha256'>[] {
  const pages = document.prototype?.plan.pages ?? []
  return [
    { path: 'package.json', content: renderPackageJson('tanstack-start', document.meta.title) },
    { path: 'tsconfig.json', content: `${JSON.stringify({ compilerOptions: { target: 'ES2022', lib: ['dom', 'dom.iterable', 'es2022'], strict: true, noEmit: true, jsx: 'react-jsx', module: 'esnext', moduleResolution: 'bundler', isolatedModules: true }, include: ['src'] }, null, 2)}\n` },
    { path: 'vite.config.ts', content: "import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\n\nexport default defineConfig({ plugins: [react()] })\n" },
    { path: 'index.html', content: '<!doctype html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n' },
    { path: 'src/styles.css', content: '@import "../design-kit/tailwind.css";\n@import "../design-kit/tokens.css";\n@import "./components/generated.css";\n' },
    { path: 'src/main.tsx', content: "import { StrictMode } from 'react'\nimport { createRoot } from 'react-dom/client'\nimport { RouterProvider } from '@tanstack/react-router'\nimport { router } from './router'\nimport './styles.css'\n\ncreateRoot(document.getElementById('root')!).render(<StrictMode><RouterProvider router={router} /></StrictMode>)\n" },
    { path: 'src/router.tsx', content: renderTanStackRouter(pages, candidates) },
    { path: 'README.md', content: renderReadme(document, 'TanStack Start') },
    { path: 'AGENTS.md', content: renderAgents('TanStack Start') },
    { path: 'cutout.registry.json', content: registryMetadata('tanstack-start', document, pages.map((page) => page.route), candidates) },
  ]
}

function renderVueComponent(candidate: ResolvedCandidate, assets: readonly StarterAsset[]) {
  const asset = assets.find((item) => item.candidateId === candidate.id)
  return `<script setup lang="ts">\ninterface Props { eyebrow?: string }\nwithDefaults(defineProps<Props>(), { eyebrow: '' })\n</script>\n\n<template>\n  <section class="cutout-component cutout-${slug(candidate.name)}" data-cutout-component="${candidate.componentId}">\n    <div class="cutout-component__content"><h2>${escapeJsxText(candidate.name)}</h2><p>${escapeJsxText(candidate.description ?? candidate.name)}</p><p v-if="eyebrow">{{ eyebrow }}</p><slot name="actions" /></div>\n${asset ? `    <img class="cutout-component__asset" src="/${asset.outputPath.replace(/^public\//, '')}" alt="" data-material-id="${asset.materialId}" />\n` : ''}  </section>\n</template>\n`
}
function renderNuxtPage(document: DesignDocument, page: PrototypePage, candidates: readonly ResolvedCandidate[]) { const names = candidates.filter((candidate) => candidate.sourcePageIds.includes(page.id)).map((candidate) => candidate.exportName); return `<template>\n  <main class="cutout-page" data-cutout-page="${page.id}">\n    <header class="cutout-page__header"><p class="cutout-page__purpose">${escapeJsxText(page.purpose)}</p><h1>${escapeJsxText(page.name)}</h1><p>${escapeJsxText(document.needs[0]?.statement ?? document.prototype?.plan.product.summary ?? '')}</p></header>\n${names.map((name) => `    <Generated${name} />`).join('\n')}\n  </main>\n</template>\n` }
function renderTanStackRouter(pages: readonly PrototypePage[], candidates: readonly ResolvedCandidate[]) { const imports = candidates.map((candidate) => `import { ${candidate.exportName} } from './components/${candidate.exportName}'`); const routes = pages.map((page, index) => { const components = candidates.filter((candidate) => candidate.sourcePageIds.includes(page.id)).map((candidate) => `<${candidate.exportName} />`).join(''); return `const route${index} = createRoute({ getParentRoute: () => rootRoute, path: ${JSON.stringify(page.route)}, component: () => <main className="cutout-page" data-cutout-page=${JSON.stringify(page.id)}><header className="cutout-page__header"><p>${escapeJsxText(page.purpose)}</p><h1>${escapeJsxText(page.name)}</h1></header>${components}</main> })` }); return [`import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'`, ...imports, '', 'const rootRoute = createRootRoute()', ...routes, `const routeTree = rootRoute.addChildren([${pages.map((_, index) => `route${index}`).join(', ')}])`, 'export const router = createRouter({ routeTree })', "declare module '@tanstack/react-router' { interface Register { router: typeof router } }", ''].join('\n') }
function nuxtPagePath(route: string) { const normalized = route.replace(/^\/+|\/+$/g, ''); if (!normalized) return 'pages/index.vue'; if (!normalized.split('/').every((segment) => /^[A-Za-z0-9_-]+$/.test(segment))) throw new Error(`Prototype route "${route}" cannot be represented as a safe Nuxt path.`); return `pages/${normalized}.vue` }
function registryMetadata(framework: z.infer<typeof starterFrameworkSchema>, document: DesignDocument, routes: readonly string[], candidates: readonly ResolvedCandidate[]) { return `${JSON.stringify({ version: 'cutout.starter-registry.v1', framework, source: { documentId: document.meta.id, revisionId: document.revision.id }, routes, components: candidates.map(({ id, exportName, tokenIds }) => ({ id, exportName, tokenIds })) }, null, 2)}\n` }

function renderComponent(document: DesignDocument, candidate: ResolvedCandidate, assets: readonly StarterAsset[]): string {
  const pages = document.prototype?.plan.pages.filter((page) => candidate.sourcePageIds.includes(page.id)) ?? []
  const regions = pages.flatMap((page) => page.regions)
  const region = regions.find((entry) => regionMatchesCandidate(candidate.name, entry))
  const props = [...candidate.props, ...candidate.variants.map((variant) => ({ name: variant.name, type: 'enum' as const, required: false, values: variant.values }))]
  const api = [...props.map(renderPropType), ...candidate.slots.map((slot) => `${slot.name}${slot.required ? '' : '?'}: ReactNode`)]
  const defaults = props.map(renderPropDefault).filter(Boolean)
  const destructured = [...defaults, ...candidate.slots.map((slot) => slot.name)].join(', ')
  const candidateAssets = assets.filter((asset) => assetForCandidate(document, candidate.id, asset))
  const tag = semanticTag(region?.role ?? candidate.name)
  const slotMarkup = candidate.slots.map((slot) => `      {${slot.name} ? <div data-cutout-slot=${JSON.stringify(slot.name)}>{${slot.name}}</div> : null}`)
  const propMarkup = props.filter((prop) => prop.type === 'string').map((prop) => `      {${prop.name} ? <p data-cutout-prop=${JSON.stringify(prop.name)}>{${prop.name}}</p> : null}`)
  return [
    "import type { ReactNode } from 'react'",
    '',
    `export interface ${candidate.exportName}Props {`,
    ...api.map((line) => `  ${line}`),
    '}',
    '',
    `export function ${candidate.exportName}({ ${destructured} }: ${candidate.exportName}Props) {`,
    `  return <${tag} className=${JSON.stringify(`cutout-component cutout-${slug(candidate.name)}`)} data-cutout-component=${JSON.stringify(candidate.componentId)}${region ? ` data-cutout-region=${JSON.stringify(region.id)}` : ''}>`,
    `    <div className="cutout-component__content">`,
    `      <h2>${escapeJsxText(region?.name ?? candidate.name)}</h2>`,
    `      <p>${escapeJsxText(candidate.description ?? region?.summary ?? candidate.name)}</p>`,
    ...propMarkup,
    ...slotMarkup,
    '    </div>',
    ...candidateAssets.map((asset) => `    <img className="cutout-component__asset" src=${JSON.stringify(`/${asset.outputPath.replace(/^public\//, '')}`)} alt="" data-material-id=${JSON.stringify(asset.materialId)} />`),
    `  </${tag}>`,
    '}',
    '',
  ].join('\n')
}

function renderPage(document: DesignDocument, page: PrototypePage, candidates: readonly ResolvedCandidate[], importPrefix: string, named = false): string {
  const pageCandidates = candidates.filter((candidate) => candidate.sourcePageIds.includes(page.id))
  const imports = pageCandidates.map((candidate) => `import { ${candidate.exportName} } from '${importPrefix}${candidate.exportName}'`)
  const matched = page.regions.flatMap((region) => pageCandidates.filter((candidate) => candidateForRegion(candidate, region, page)))
  const components = [...matched, ...pageCandidates.filter((candidate) => !matched.includes(candidate))].map((candidate) => `      <${candidate.exportName} />`)
  const needs = document.needs.map((need) => need.statement)
  const body = [
    ...imports,
    imports.length > 0 ? '' : undefined,
    `${named ? 'export function App' : 'export default function Page'}() {`,
    `  return <main className="cutout-page" data-cutout-page=${JSON.stringify(page.id)}>`,
    '    <header className="cutout-page__header">',
    `      <p className="cutout-page__purpose">${escapeJsxText(page.purpose)}</p>`,
    `      <h1>${escapeJsxText(page.name)}</h1>`,
    `      <p>${escapeJsxText(needs[0] ?? document.prototype?.plan.product.summary ?? '')}</p>`,
    '    </header>',
    ...components,
    '  </main>',
    '}',
    '',
  ].filter((line): line is string => line !== undefined)
  return body.join('\n')
}

function renderViteRouter(document: DesignDocument, candidates: readonly ResolvedCandidate[]): string {
  const pages = document.prototype?.plan.pages ?? []
  const imports = candidates.map((candidate) => `import { ${candidate.exportName} } from './components/${candidate.exportName}'`)
  const cases = pages.map((page) => {
    const pageCandidates = candidates.filter((candidate) => candidate.sourcePageIds.includes(page.id))
    const children = pageCandidates.map((candidate) => `        <${candidate.exportName} />`)
    return [`    case ${JSON.stringify(page.route)}:`, `      return <main className="cutout-page" data-cutout-page=${JSON.stringify(page.id)}>`, `        <header className="cutout-page__header"><p className="cutout-page__purpose">${escapeJsxText(page.purpose)}</p><h1>${escapeJsxText(page.name)}</h1><p>${escapeJsxText(document.needs[0]?.statement ?? document.prototype?.plan.product.summary ?? '')}</p></header>`, ...children, '      </main>'].join('\n')
  })
  return [...imports, '', 'export function App() {', "  const route = window.location.pathname.replace(/\\/$/, '') || '/'", '  switch (route) {', ...cases, '    default:', '      return <main className="cutout-page"><h1>Page not found</h1></main>', '  }', '}', ''].join('\n')
}

function renderComponentCss(document: DesignDocument, candidates: readonly ResolvedCandidate[]): string {
  const color = document.tokens.find((token) => token.kind === 'color' && candidates.some((candidate) => candidate.tokenIds.includes(token.id)))
  const radius = document.tokens.find((token) => token.kind === 'radius' && candidates.some((candidate) => candidate.tokenIds.includes(token.id)))
  return `.cutout-page { min-height: 100vh; padding: clamp(1.5rem, 4vw, 4rem); background: #fff; color: #111827; }\n.cutout-page__header { max-width: 72rem; margin: 0 auto 2rem; }\n.cutout-page__purpose { color: ${color ? `var(--cutout-token-${slug(color.name)}, ${color.value})` : '#4b5563'}; font-weight: 600; }\n.cutout-component { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2rem; align-items: center; max-width: 72rem; margin: 0 auto 1rem; padding: clamp(1.5rem, 4vw, 3rem); border: 1px solid color-mix(in srgb, currentColor 14%, transparent); border-radius: ${radius ? `var(--cutout-token-${slug(radius.name)}, ${radius.value})` : '0.5rem'}; }\n.cutout-component__content { max-width: 44rem; }\n.cutout-component__asset { display: block; max-width: min(20rem, 35vw); height: auto; }\n@media (max-width: 640px) { .cutout-component { grid-template-columns: 1fr; } .cutout-component__asset { max-width: 100%; } }\n`
}

function renderPackageJson(framework: z.infer<typeof starterFrameworkSchema>, title: string): string {
  const packageJson = framework === 'next-app-router'
    ? { name: packageName(title), private: true, scripts: { dev: 'next dev', build: 'next build', start: 'next start', lint: 'next lint' }, dependencies: { next: '^16.0.0', react: '^19.0.0', 'react-dom': '^19.0.0' }, devDependencies: { typescript: '^5.0.0', '@types/node': '^22.0.0', '@types/react': '^19.0.0', '@types/react-dom': '^19.0.0' } }
    : framework === 'vite-react'
      ? { name: packageName(title), private: true, scripts: { dev: 'vite', build: 'tsc -b && vite build', preview: 'vite preview' }, dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' }, devDependencies: { '@vitejs/plugin-react': '^5.0.0', typescript: '^5.0.0', vite: '^7.0.0', '@types/react': '^19.0.0', '@types/react-dom': '^19.0.0' } }
      : framework === 'nuxt'
        ? { name: packageName(title), private: true, scripts: { dev: 'nuxt dev', build: 'nuxt build', preview: 'nuxt preview', typecheck: 'nuxt typecheck' }, dependencies: { nuxt: '^4.0.0', vue: '^3.5.0', 'vue-router': '^4.5.0' }, devDependencies: { typescript: '^5.0.0', 'vue-tsc': '^3.0.0' } }
        : { name: packageName(title), private: true, scripts: { dev: 'vite', build: 'tsc -b && vite build', preview: 'vite preview' }, dependencies: { '@tanstack/react-router': '^1.0.0', react: '^19.0.0', 'react-dom': '^19.0.0' }, devDependencies: { '@vitejs/plugin-react': '^5.0.0', typescript: '^5.0.0', vite: '^7.0.0', '@types/react': '^19.0.0', '@types/react-dom': '^19.0.0' } }
  return `${JSON.stringify(packageJson, null, 2)}\n`
}

function renderPropType(prop: ComponentManifest['candidates'][number]['props'][number] | { readonly name: string; readonly type: 'enum'; readonly required: false; readonly values: readonly string[] }): string {
  const optional = prop.required ? '' : '?'
  const type = prop.type === 'enum' ? prop.values.map((value) => JSON.stringify(value)).join(' | ') : prop.type
  return `${prop.name}${optional}: ${type}`
}

function renderPropDefault(prop: ComponentManifest['candidates'][number]['props'][number] | { readonly name: string; readonly type: 'enum'; readonly required: false; readonly values: readonly string[] }): string {
  if ('defaultValue' in prop && prop.defaultValue !== undefined) return `${prop.name} = ${JSON.stringify(prop.defaultValue)}`
  return prop.name
}

function semanticTag(role: string): 'section' | 'header' | 'nav' | 'footer' | 'aside' {
  const normalized = role.toLowerCase()
  if (normalized.includes('nav')) return 'nav'
  if (normalized.includes('header') || normalized.includes('hero')) return 'header'
  if (normalized.includes('footer')) return 'footer'
  if (normalized.includes('aside') || normalized.includes('sidebar')) return 'aside'
  return 'section'
}

function candidateForRegion(candidate: ResolvedCandidate, region: PrototypeRegion, page: PrototypePage): boolean {
  return candidate.sourcePageIds.includes(page.id) && regionMatchesCandidate(candidate.name, region)
}

function regionMatchesCandidate(candidateName: string, region: PrototypeRegion): boolean {
  const name = slug(candidateName)
  return name === slug(region.name) || name === slug(region.role)
}

function assetForCandidate(_document: DesignDocument, candidateId: string, asset: StarterAsset): boolean {
  return asset.candidateId === candidateId
}

function nextPagePath(route: string): string {
  const normalized = route.replace(/^\/+|\/+$/g, '')
  if (!normalized) return 'app/page.tsx'
  if (!normalized.split('/').every((segment) => /^[A-Za-z0-9_-]+$/.test(segment))) {
    throw new Error(`Prototype route "${route}" cannot be represented as a safe Next App Router path.`)
  }
  return `app/${normalized}/page.tsx`
}

function nextImportPrefix(route: string): string {
  const depth = route.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean).length
  return `${'../'.repeat(depth + 1)}src/components/`
}

function escapeJsxText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/{/g, '&#123;').replace(/}/g, '&#125;')
}

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item'
}

function renderReadme(document: DesignDocument, framework: string): string {
  return `# ${escapeMarkdown(document.meta.title)}\n\nGenerated by Cutout Starter Compiler v1 for ${framework}.\n\n- Design tokens live in \`design-kit/\`.\n- Component provenance lives in \`components.manifest.json\`.\n- Assets are listed in the Starter Plan and must be copied by a trusted export host.\n- Do not edit generated Design Kit artifacts by hand; update the Design IR and recompile.\n`
}

function renderAgents(framework: string): string {
  return `# Agent Instructions\n\nThis is a ${framework} starter generated from a Cutout Design IR revision.\n\n- Treat \`design-kit/\` and \`components.manifest.json\` as generated, reviewable inputs.\n- Use Design IR / token changes rather than mutating generated token artifacts.\n- Do not fetch, execute, or trust asset URIs directly; a trusted export host resolves plan assets.\n- Preserve component provenance when changing generated component internals.\n`
}

function normalizeManifest(manifest: ComponentManifest): ComponentManifest {
  return {
    version: manifest.version,
    source: manifest.source,
    candidates: normalizeCandidates(manifest.candidates),
  }
}

function normalizeCandidates(candidates: ComponentManifest['candidates']): ComponentManifest['candidates'] {
  return [...candidates]
    .map((candidate) => ({
      ...candidate,
      sourcePageIds: [...candidate.sourcePageIds].sort(compareText),
      tokenRefs: [...candidate.tokenRefs].sort(compareText),
      props: [...candidate.props]
        .map((prop) => prop.type === 'enum' ? { ...prop, values: [...prop.values].sort(compareText) } : prop)
        .sort((left, right) => compareText(left.name, right.name)),
      variants: [...candidate.variants]
        .map((variant) => ({ ...variant, values: [...variant.values].sort(compareText) }))
        .sort((left, right) => compareText(left.name, right.name)),
      slots: [...candidate.slots].sort((left, right) => compareText(left.name, right.name)),
    }))
    .sort((left, right) => compareText(left.id, right.id))
}

function assertNoCollisions(files: readonly Omit<StarterFile, 'sha256'>[], assets: readonly StarterAsset[], existingPaths: readonly string[]): void {
  const generated = new Set<string>()
  for (const file of files) {
    if (generated.has(file.path)) throw new Error(`Starter file path collides: "${file.path}".`)
    generated.add(file.path)
  }
  for (const asset of assets) {
    if (generated.has(asset.outputPath)) throw new Error(`Starter path collides: "${asset.outputPath}".`)
    generated.add(asset.outputPath)
  }
  for (const existingPath of existingPaths) {
    if (generated.has(existingPath)) throw new Error(`Starter output collides with existing path "${existingPath}"; merge policy is fail.`)
  }
}

async function sha256Text(content: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(content))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function comparePath(left: StarterFile, right: StarterFile): number { return compareText(left.path, right.path) }
function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0 }
function escapeMarkdown(value: string): string { return value.replaceAll('`', '\\`').replaceAll('|', '\\|').replaceAll('\n', ' ') }
function packageName(title: string): string {
  const normalized = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return normalized.length > 0 ? normalized.slice(0, 80) : 'cutout-starter'
}

function toExportName(name: string, id: string): string {
  const words = name.split(/[^A-Za-z0-9]+/).filter(Boolean)
  const stem = words.map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`).join('')
  if (stem.length > 0 && /^[A-Z]/.test(stem)) return stem.slice(0, 80)
  // Component names are display text and may be non-ASCII. Fall back to a
  // deterministic identifier derived from the immutable candidate id.
  let hash = 2_166_136_261
  for (const character of id) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16_777_619)
  }
  return `Component${(hash >>> 0).toString(36)}`
}
