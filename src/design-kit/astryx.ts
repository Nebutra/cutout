import { z } from 'zod'
import { designDocumentSchema, fingerprint, type DesignDocument } from '@/design-ir'

const cssVariable = z.string().regex(/^--[a-z][a-z0-9-]*$/)
const safeName = z.string().regex(/^[a-z][a-z0-9-]*$/)

export const astryxBindingInputSchema = z.object({
  document: designDocumentSchema,
  themeName: safeName,
  extends: z.enum(['neutral']).default('neutral'),
  tokens: z.array(z.object({
    astryxVariable: cssVariable,
    lightTokenId: z.string().min(1),
    darkTokenId: z.string().min(1).optional(),
  }).strict()).min(1),
  components: z.array(z.object({
    designComponentId: z.string().min(1),
    astryxComponent: z.string().regex(/^[A-Z][A-Za-z0-9]*$/),
  }).strict()).default([]),
}).strict()

export type AstryxBindingInput = z.infer<typeof astryxBindingInputSchema>

export interface AstryxBindingFile { readonly path: string; readonly content: string }

/**
 * Grounding facts for prose the Agent (not this deterministic compiler)
 * should author — README.md, AGENTS.md, PR descriptions, whatever the user
 * actually asks for. This compiler only derives structured artifacts
 * mechanically from Design IR; it does not decide how to phrase docs.
 */
export interface AstryxAgentBrief {
  readonly themeName: string
  readonly themeConstName: string
  readonly providerName: string
  readonly themePath: string
  readonly usagePath: string
  readonly globalsCssPath: string
  readonly packageSnippetPath: string
  readonly installCommand: string
  readonly buildCommand: string
  readonly mappedVariableCount: number
  readonly unmappedCustomPropertyCount: number
  readonly officialDocs: readonly string[]
}

export interface AstryxBinding {
  readonly version: 'cutout.astryx-binding.v1'
  readonly artifactId: 'ds.binding.astryx'
  readonly source: { readonly documentId: string; readonly revisionId: string; readonly documentFingerprint: string }
  readonly capability: ReturnType<typeof detectAstryxCapability>
  readonly files: readonly AstryxBindingFile[]
  readonly agentBrief: AstryxAgentBrief
}

/**
 * A natural-language prompt built from `agentBrief`, meant to be handed to
 * an Agent capable of authoring docs (this product's own Agent doesn't have
 * a general "write this file" tool yet — see `AstryxMappingPanel` — so this
 * is written to work when pasted into any capable assistant).
 */
export function astryxAgentPrompt(brief: AstryxAgentBrief): string {
  return [
    `Write README.md and AGENTS.md for the Astryx theme "${brief.themeName}".`,
    '',
    'Facts:',
    `- Theme file: ${brief.themePath} (exports \`${brief.themeConstName}\`)`,
    `- Provider component: ${brief.providerName} (${brief.usagePath})`,
    `- Global CSS: ${brief.globalsCssPath}`,
    `- Package snippet: ${brief.packageSnippetPath}`,
    `- Install: ${brief.installCommand}`,
    `- Build: ${brief.buildCommand}`,
    `- Mapped Astryx variables: ${brief.mappedVariableCount}; unmapped custom properties: ${brief.unmappedCustomPropertyCount}`,
    `- Official docs: ${brief.officialDocs.join(', ')}`,
    '',
    'Verify current CLI commands and API shape against the official docs before writing — Astryx evolves.',
  ].join('\n')
}

/** Detects only declared local dependencies; it never installs or probes the network. */
export function detectAstryxCapability(packageJson: unknown) {
  const parsed = z.object({ dependencies: z.record(z.string(), z.string()).optional(), devDependencies: z.record(z.string(), z.string()).optional() }).passthrough().safeParse(packageJson)
  const deps = parsed.success ? { ...parsed.data.dependencies, ...parsed.data.devDependencies } : {}
  const core = deps['@astryxdesign/core']
  const cli = deps['@astryxdesign/cli']
  const neutral = deps['@astryxdesign/theme-neutral']
  return {
    status: core && cli && neutral ? 'available' as const : 'adapter-required' as const,
    packages: { core: core ?? null, cli: cli ?? null, themeNeutral: neutral ?? null },
    missing: [!core && '@astryxdesign/core', !cli && '@astryxdesign/cli', !neutral && '@astryxdesign/theme-neutral'].filter((value): value is string => Boolean(value)),
  }
}

/**
 * Projects Design IR into a full Astryx consumer binding: the theme file
 * itself plus the structured scaffold every Astryx project needs around it
 * (cascade CSS, provider usage, package snippet). Design IR remains
 * authoritative — this never installs packages or runs the CLI
 * (`writesAllowedByThisCompiler: false` in the emitted plan).
 *
 * Deliberately does NOT emit README.md / AGENTS.md prose: those are
 * unstructured, project-specific writing, not a mechanical derivation of
 * Design IR data. `agentBrief` carries the facts a prose author needs;
 * writing the actual doc is the Agent's job.
 */
export async function compileAstryxBinding(input: AstryxBindingInput, consumerPackageJson: unknown = {}): Promise<AstryxBinding> {
  const parsed = astryxBindingInputSchema.parse(input)
  const tokens = new Map(parsed.document.tokens.map((token) => [token.id, token]))
  const components = new Set(parsed.document.components.map((component) => component.id))
  const seenVariables = new Set<string>()
  const mappedTokenIds = new Set<string>()
  const resolved = parsed.tokens.map((mapping) => {
    if (seenVariables.has(mapping.astryxVariable)) throw new Error(`Duplicate Astryx variable mapping: ${mapping.astryxVariable}`)
    seenVariables.add(mapping.astryxVariable)
    const light = requiredToken(tokens, mapping.lightTokenId)
    const dark = mapping.darkTokenId ? requiredToken(tokens, mapping.darkTokenId) : light
    mappedTokenIds.add(light.id)
    mappedTokenIds.add(dark.id)
    return { variable: mapping.astryxVariable, light: light.value, dark: dark.value, sourceTokenIds: [light.id, dark.id] }
  }).sort((a, b) => a.variable.localeCompare(b.variable))
  for (const mapping of parsed.components) {
    if (!components.has(mapping.designComponentId)) throw new Error(`Unknown Design IR component: ${mapping.designComponentId}`)
  }
  // Colors the caller chose not to bind to a semantic Astryx variable still
  // ship — as theme-namespaced custom properties — so nothing from the
  // source document is silently dropped from the deliverable.
  const unmapped = parsed.document.tokens
    .filter((token) => token.kind === 'color' && !mappedTokenIds.has(token.id))
    .map((token) => ({ name: `--${parsed.themeName}-${slugify(token.name)}`, value: token.value }))

  const source = { documentId: parsed.document.meta.id, revisionId: parsed.document.revision.id, documentFingerprint: await fingerprint(parsed.document) }
  const mapping = {
    version: 'cutout.astryx-mapping.v1', source,
    tokens: resolved.map(({ variable, sourceTokenIds }) => ({ astryxVariable: variable, sourceTokenIds })),
    components: [...parsed.components].sort((a, b) => a.designComponentId.localeCompare(b.designComponentId)),
  }
  const themePath = `astryx/${parsed.themeName}.ts`
  const officialDocs = ['https://astryx.atmeta.com/docs/getting-started', 'https://astryx.atmeta.com/docs/theme', 'https://astryx.atmeta.com/docs/cli']
  const plan = {
    version: 'cutout.astryx-cli-plan.v1', mode: 'dry-run',
    prerequisites: ['@astryxdesign/core', '@astryxdesign/theme-neutral', '@astryxdesign/cli'],
    input: themePath, command: ['npx', 'astryx', 'theme', 'build', `./${themePath}`],
    writesAllowedByThisCompiler: false,
    officialDocs,
  }
  return {
    version: 'cutout.astryx-binding.v1', artifactId: 'ds.binding.astryx', source,
    capability: detectAstryxCapability(consumerPackageJson),
    files: [
      { path: themePath, content: renderTheme(parsed.themeName, resolved) },
      { path: 'astryx/globals.css', content: renderGlobalsCss(parsed.themeName, unmapped) },
      { path: 'astryx/usage.tsx', content: renderUsage(parsed.themeName) },
      { path: 'astryx/package-snippet.json', content: renderPackageSnippet(themePath) },
      { path: 'astryx/component-mapping.json', content: `${JSON.stringify(mapping, null, 2)}\n` },
      { path: 'astryx/cli-plan.json', content: `${JSON.stringify(plan, null, 2)}\n` },
    ],
    agentBrief: {
      themeName: parsed.themeName,
      themeConstName: themeConstName(parsed.themeName),
      providerName: providerName(parsed.themeName),
      themePath,
      usagePath: 'astryx/usage.tsx',
      globalsCssPath: 'astryx/globals.css',
      packageSnippetPath: 'astryx/package-snippet.json',
      installCommand: 'npm install @astryxdesign/core @astryxdesign/theme-neutral @astryxdesign/cli',
      buildCommand: `npx astryx theme build ./${themePath}`,
      mappedVariableCount: resolved.length,
      unmappedCustomPropertyCount: unmapped.length,
      officialDocs,
    },
  }
}

function requiredToken(tokens: ReadonlyMap<string, DesignDocument['tokens'][number]>, id: string) {
  const token = tokens.get(id)
  if (!token) throw new Error(`Unknown Design IR token: ${id}`)
  return token
}

function slugify(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'token'
}

function pascalCase(themeName: string): string {
  return themeName.split('-').filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('')
}

function camelCase(themeName: string): string {
  const pascal = pascalCase(themeName)
  return pascal.charAt(0).toLowerCase() + pascal.slice(1)
}

function providerName(themeName: string): string {
  return `${pascalCase(themeName)}DesignProvider`
}

function themeConstName(themeName: string): string {
  return `${camelCase(themeName)}Theme`
}

function renderTheme(name: string, tokens: readonly { variable: string; light: string; dark: string }[]) {
  const entries = tokens.map(({ variable, light, dark }) => `    ${JSON.stringify(variable)}: [${JSON.stringify(light)}, ${JSON.stringify(dark)}],`).join('\n')
  return `import { defineTheme } from '@astryxdesign/core/theme'\nimport { neutralTheme } from '@astryxdesign/theme-neutral'\n\nexport const ${themeConstName(name)} = defineTheme({\n  name: ${JSON.stringify(name)},\n  extends: neutralTheme,\n  tokens: {\n${entries}\n  },\n})\n`
}

function renderGlobalsCss(themeName: string, unmapped: readonly { name: string; value: string }[]) {
  const customProperties = unmapped.length
    ? `\n  :root {\n${unmapped.map(({ name, value }) => `    ${name}: ${value};`).join('\n')}\n  }\n`
    : ''
  return [
    `@layer reset, astryx-base, ${themeName}-theme, app;`,
    '',
    `@import '@astryxdesign/core/reset.css' layer(reset);`,
    `@import '@astryxdesign/core/astryx.css' layer(astryx-base);`,
    `@import '@astryxdesign/theme-neutral/theme.css' layer(${themeName}-theme);`,
    '',
    '@layer app {' + customProperties,
    '  body {',
    '    margin: 0;',
    '    background: var(--color-background-page);',
    '    color: var(--color-text-primary);',
    '    font-family: var(--font-family-body);',
    '  }',
    '',
    '  :focus-visible {',
    '    outline: 2px solid var(--color-focus);',
    '    outline-offset: 2px;',
    '  }',
    '}',
    '',
  ].join('\n')
}

function renderUsage(themeName: string) {
  return [
    "'use client';",
    '',
    "import type {ReactNode} from 'react';",
    "import {Theme} from '@astryxdesign/core/theme';",
    `import {${themeConstName(themeName)}} from './${themeName}';`,
    "import './globals.css';",
    '',
    `export function ${providerName(themeName)}({children}: {children: ReactNode}) {`,
    '  return (',
    `    <Theme theme={${themeConstName(themeName)}} mode="system">`,
    '      {children}',
    '    </Theme>',
    '  );',
    '}',
    '',
  ].join('\n')
}

function renderPackageSnippet(themePath: string) {
  const snippet = {
    dependencies: { '@astryxdesign/core': 'latest', '@astryxdesign/theme-neutral': 'latest' },
    devDependencies: { '@astryxdesign/cli': 'latest' },
    scripts: {
      astryx: 'node node_modules/@astryxdesign/cli/bin/astryx.mjs',
      'theme:build': `npx astryx theme build ./${themePath}`,
    },
  }
  return `${JSON.stringify(snippet, null, 2)}\n`
}
