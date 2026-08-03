/**
 * Deterministic, in-memory Design Kit v1 compiler.
 *
 * The Design IR intentionally does not claim confidence, token category details,
 * or alias semantics. Callers must provide those facts through the explicit
 * adapter below; this compiler never infers them from token names or values.
 */
import { z } from 'zod'
import {
  designDocumentSchema,
  fingerprint,
  validateDesignDocument,
  type DesignDocument,
} from '@/design-ir'
import { designSystemMarkdownValidationError } from '@/prototype/design-system-validation'

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i)
const cssNameSchema = z.string().regex(
  /^[a-z][a-z0-9-]*$/,
  'Token CSS names must be lowercase kebab-case.',
)

export const designKitTokenCategorySchema = z.enum([
  'color',
  'spacing',
  'radius',
  'typography',
  'shadow',
  'breakpoint',
])

export const designKitTokenStatusSchema = z.enum(['verified', 'draft'])

export const selectedDesignMarkdownInputSchema = z.object({
  candidateSetId: z.string().min(1),
  candidateId: z.string().min(1),
  materialId: z.string().min(1),
  revisionId: z.string().min(1),
  provenanceId: z.string().min(1),
  content: z.string().min(1),
}).strict()

export const designKitDesignMarkdownSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('generated-token-table') }).strict(),
  z.object({
    kind: z.literal('selected-material'),
    candidateSetId: z.string().min(1),
    candidateId: z.string().min(1),
    materialId: z.string().min(1),
    revisionId: z.string().min(1),
    contentSha256: sha256Schema,
    provenanceId: z.string().min(1),
  }).strict(),
])

/**
 * Explicit adapter from the intentionally generic Design IR token to an
 * executable Design Kit token. There is deliberately no `value` field: values
 * always come from the referenced immutable IR revision.
 */
export const designKitTokenInputSchema = z.object({
  tokenId: z.string().min(1),
  status: designKitTokenStatusSchema,
  category: designKitTokenCategorySchema,
  cssName: cssNameSchema,
  aliasOf: z.string().min(1).optional(),
}).strict()

export const designKitInputSchema = z.object({
  document: designDocumentSchema,
  tokens: z.array(designKitTokenInputSchema),
  selectedDesignMarkdown: selectedDesignMarkdownInputSchema.optional(),
}).strict()

export const designKitFileSchema = z.object({
  path: z.enum([
    'tokens.json',
    'tokens.css',
    'tailwind.css',
    'theme.ts',
    'DESIGN.md',
    'manifest.json',
    'design-system.html',
    'demo.html',
  ]),
  content: z.string(),
  sha256: sha256Schema,
  sourceFingerprint: sha256Schema,
  provenance: z.object({
    compiler: z.literal('cutout.design-kit.v1'),
    documentId: z.string().min(1),
    revisionId: z.string().min(1),
    tokenIds: z.array(z.string().min(1)),
    provenanceIds: z.array(z.string().min(1)),
  }).strict(),
}).strict()

export const designKitSchema = z.object({
  version: z.literal('design-kit.v1'),
  source: z.object({
    documentId: z.string().min(1),
    revisionId: z.string().min(1),
    documentFingerprint: sha256Schema,
    adapterFingerprint: sha256Schema,
    designMarkdown: designKitDesignMarkdownSourceSchema.optional(),
  }).strict(),
  files: z.array(designKitFileSchema),
}).strict()

export type DesignKitTokenInput = z.infer<typeof designKitTokenInputSchema>
export type SelectedDesignMarkdownInput = z.infer<typeof selectedDesignMarkdownInputSchema>
export type DesignKitDesignMarkdownSource = z.infer<typeof designKitDesignMarkdownSourceSchema>
export type DesignKitInput = z.infer<typeof designKitInputSchema>
export type DesignKitFile = z.infer<typeof designKitFileSchema>
export type DesignKit = z.infer<typeof designKitSchema>

interface ResolvedToken {
  readonly tokenId: string
  readonly status: DesignKitTokenInput['status']
  readonly category: DesignKitTokenInput['category']
  readonly cssName: string
  readonly value: string
  /** CSS-variable aliasing (this kit's own concept) — distinct from the IR token's semantic tier below. */
  readonly aliasOf?: string
  readonly provenanceId?: string
  /** The Design IR token's own `tier`, carried through only for specimen grouping — never used for CSS aliasing. */
  readonly irTier?: 'primitive' | 'semantic' | 'alias'
  /** The Design IR token's own `aliasOf` (semantic alias target id) — distinct from this kit's CSS `aliasOf` above. */
  readonly irAliasOf?: string
}

interface ResolvedDesignMarkdown {
  readonly content: string
  readonly source: DesignKitDesignMarkdownSource
}

const compatibleKinds: Readonly<Record<ResolvedToken['category'], readonly string[]>> = {
  color: ['color'],
  spacing: ['spacing'],
  radius: ['radius'],
  typography: ['typography'],
  shadow: ['shadow'],
  // Design IR v1 has no breakpoint kind. It must be deliberately marked `other`.
  breakpoint: ['other'],
}

/**
 * Compile a portable kit without writing files or invoking a provider. The
 * function is async solely because Web Crypto is the portable SHA-256 primitive.
 */
export async function compileDesignKit(input: DesignKitInput): Promise<DesignKit> {
  const parsed = designKitInputSchema.parse(input)
  const documentValidation = validateDesignDocument(parsed.document)
  if (!documentValidation.ok) throw new Error(`Invalid DesignDocument: ${documentValidation.error}`)
  const document = documentValidation.data.document
  const tokens = resolveTokens(document, parsed.tokens)
  const documentFingerprint = await fingerprint(document)
  const adapterFingerprint = await fingerprint(tokens.map(adapterFingerprintEntry))
  const resolvedDesignMarkdown = await resolveDesignMarkdown(
    document,
    parsed.selectedDesignMarkdown,
    tokens,
    { documentFingerprint, adapterFingerprint },
  )
  const source = {
    documentId: document.meta.id,
    revisionId: document.revision.id,
    documentFingerprint,
    adapterFingerprint,
    designMarkdown: resolvedDesignMarkdown.source,
  } as const

  const tokenIds = tokens.map((token) => token.tokenId)
  const provenanceIds = uniqueSorted([
    ...tokens.flatMap((token) => token.provenanceId ? [token.provenanceId] : []),
    ...(resolvedDesignMarkdown.source.kind === 'selected-material'
      ? [resolvedDesignMarkdown.source.provenanceId]
      : []),
  ])
  const provenance = {
    compiler: 'cutout.design-kit.v1' as const,
    documentId: document.meta.id,
    revisionId: document.revision.id,
    tokenIds,
    provenanceIds,
  }

  const sourceFiles: ReadonlyArray<readonly [Exclude<DesignKitFile['path'], 'manifest.json'>, string]> = [
    ['tokens.json', renderTokensJson(tokens)],
    ['tokens.css', renderTokensCss(tokens)],
    ['tailwind.css', renderTailwindCss(tokens)],
    ['theme.ts', renderThemeTs(tokens)],
    ['DESIGN.md', resolvedDesignMarkdown.content],
    ['design-system.html', renderDesignSystemHtml(document, tokens, resolvedDesignMarkdown.content)],
    ['demo.html', renderDemoHtml(document, tokens, source)],
  ]

  const filesWithoutManifest = await Promise.all(sourceFiles.map(async ([path, content]) => ({
    path,
    content,
    sha256: await sha256Text(content),
    sourceFingerprint: documentFingerprint,
    provenance,
  })))
  const manifestContent = renderManifest(source, filesWithoutManifest)
  const manifest: DesignKitFile = {
    path: 'manifest.json',
    content: manifestContent,
    sha256: await sha256Text(manifestContent),
    sourceFingerprint: documentFingerprint,
    provenance,
  }

  return designKitSchema.parse({
    version: 'design-kit.v1',
    source,
    files: [...filesWithoutManifest, manifest].sort((left, right) => compareText(left.path, right.path)),
  })
}

async function resolveDesignMarkdown(
  document: DesignDocument,
  selected: SelectedDesignMarkdownInput | undefined,
  tokens: readonly ResolvedToken[],
  source: { readonly documentFingerprint: string; readonly adapterFingerprint: string },
): Promise<ResolvedDesignMarkdown> {
  if (!selected) {
    return {
      content: renderDesignMarkdown(document, tokens, source),
      source: { kind: 'generated-token-table' },
    }
  }

  const candidateSet = document.candidateSets?.find((entry) => entry.id === selected.candidateSetId)
  if (!candidateSet || candidateSet.kind !== 'design-system') {
    throw new Error(`Selected DESIGN.md candidate set "${selected.candidateSetId}" does not exist.`)
  }
  if (
    candidateSet.selection?.candidateId !== selected.candidateId
    || candidateSet.selection.provenanceId !== selected.provenanceId
  ) {
    throw new Error(`Selected DESIGN.md candidate "${selected.candidateId}" is not the promoted selection.`)
  }
  const candidate = candidateSet.candidates.find((entry) => entry.id === selected.candidateId)
  if (!candidate || candidate.status !== 'ready') {
    throw new Error(`Selected DESIGN.md candidate "${selected.candidateId}" is not ready.`)
  }
  if (!candidate.outputs.some((output) => output.materialId === selected.materialId)) {
    throw new Error(`Selected DESIGN.md material "${selected.materialId}" is not an output of candidate "${selected.candidateId}".`)
  }

  const material = document.materials.find((entry) => entry.id === selected.materialId)
  if (!material) {
    throw new Error(`Selected DESIGN.md material "${selected.materialId}" does not exist in the DesignDocument.`)
  }
  if (material.kind !== 'design-markdown') {
    throw new Error(`Selected DESIGN.md material "${selected.materialId}" is not a design-markdown material.`)
  }
  if (material.currentRevisionId !== selected.revisionId) {
    throw new Error(`Selected DESIGN.md revision "${selected.revisionId}" is not current for material "${selected.materialId}".`)
  }
  const revision = material.revisions.find((entry) => entry.id === selected.revisionId)
  if (!revision) {
    throw new Error(`Selected DESIGN.md revision "${selected.revisionId}" does not exist on material "${selected.materialId}".`)
  }
  if (!revision.content.sha256) {
    throw new Error(`Selected DESIGN.md revision "${selected.revisionId}" is missing a content digest.`)
  }
  const contentSha256 = await sha256Text(selected.content)
  if (contentSha256.toLowerCase() !== revision.content.sha256.toLowerCase()) {
    throw new Error(`Selected DESIGN.md content does not match revision "${selected.revisionId}".`)
  }
  if (!document.provenance.some((entry) => entry.id === selected.provenanceId)) {
    throw new Error(`Selected DESIGN.md provenance "${selected.provenanceId}" does not exist in the DesignDocument.`)
  }
  const validationError = designSystemMarkdownValidationError(selected.content)
  if (validationError) {
    throw new Error(`Selected DESIGN.md is invalid: ${validationError}`)
  }

  return {
    content: selected.content,
    source: {
      kind: 'selected-material',
      candidateSetId: selected.candidateSetId,
      candidateId: selected.candidateId,
      materialId: selected.materialId,
      revisionId: selected.revisionId,
      contentSha256,
      provenanceId: selected.provenanceId,
    },
  }
}

function resolveTokens(
  document: DesignDocument,
  adapters: readonly DesignKitTokenInput[],
): readonly ResolvedToken[] {
  const documentTokens = new Map(document.tokens.map((token) => [token.id, token]))
  const adapterById = new Map<string, DesignKitTokenInput>()
  const names = new Set<string>()
  for (const adapter of adapters) {
    if (adapterById.has(adapter.tokenId)) throw new Error(`Design Kit adapter declares token "${adapter.tokenId}" more than once.`)
    if (names.has(`${adapter.category}:${adapter.cssName}`)) {
      throw new Error(`Design Kit adapter declares duplicate ${adapter.category} CSS name "${adapter.cssName}".`)
    }
    const token = documentTokens.get(adapter.tokenId)
    if (!token) throw new Error(`Design Kit adapter token "${adapter.tokenId}" does not exist in the DesignDocument.`)
    if (!compatibleKinds[adapter.category].includes(token.kind)) {
      throw new Error(`Design Kit category "${adapter.category}" is incompatible with IR token "${adapter.tokenId}" of kind "${token.kind}".`)
    }
    if (!isSafeCssValue(token.value)) {
      throw new Error(`Design Kit token "${adapter.tokenId}" has an unsafe CSS value.`)
    }
    adapterById.set(adapter.tokenId, adapter)
    names.add(`${adapter.category}:${adapter.cssName}`)
  }

  for (const adapter of adapters) {
    if (!adapter.aliasOf) continue
    const target = adapterById.get(adapter.aliasOf)
    if (!target) {
      if (!documentTokens.has(adapter.aliasOf)) {
        throw new Error(`Design Kit alias "${adapter.tokenId}" references unknown token "${adapter.aliasOf}".`)
      }
      throw new Error(`Design Kit alias "${adapter.tokenId}" references token "${adapter.aliasOf}" which is not included in this kit.`)
    }
    if (target.category !== adapter.category) {
      throw new Error(`Design Kit alias "${adapter.tokenId}" must target the same token category.`)
    }
  }
  assertAcyclicAliases(adapterById)

  return [...adapters]
    .map((adapter): ResolvedToken => {
      const token = documentTokens.get(adapter.tokenId)
      if (!token) throw new Error(`Missing DesignDocument token "${adapter.tokenId}".`)
      return {
        ...adapter,
        value: token.value,
        provenanceId: token.provenanceId,
        ...(token.tier ? { irTier: token.tier } : {}),
        ...(token.aliasOf ? { irAliasOf: token.aliasOf } : {}),
      }
    })
    .sort(compareTokens)
}

function assertAcyclicAliases(adapters: ReadonlyMap<string, DesignKitTokenInput>): void {
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (tokenId: string): void => {
    if (visited.has(tokenId)) return
    if (visiting.has(tokenId)) throw new Error(`Design Kit semantic alias cycle detected at token "${tokenId}".`)
    visiting.add(tokenId)
    const alias = adapters.get(tokenId)?.aliasOf
    if (alias) visit(alias)
    visiting.delete(tokenId)
    visited.add(tokenId)
  }
  for (const tokenId of adapters.keys()) visit(tokenId)
}

function renderTokensJson(tokens: readonly ResolvedToken[]): string {
  const categories: Record<string, Record<string, unknown>> = {}
  for (const token of tokens) {
    const category = categories[token.category] ??= {}
    category[token.cssName] = {
      '$type': token.category,
      '$value': token.aliasOf ? `{${jsonTokenPath(findToken(tokens, token.aliasOf))}}` : token.value,
      '$status': token.status,
      '$extensions': {
        'cutout.tokenId': token.tokenId,
        ...(token.provenanceId ? { 'cutout.provenanceId': token.provenanceId } : {}),
      },
    }
  }
  return `${JSON.stringify(sortJson(categories), null, 2)}\n`
}

function renderTokensCss(tokens: readonly ResolvedToken[]): string {
  const lines = tokens.map((token) => `  ${cssVariable(token)}: ${token.aliasOf ? `var(${cssVariable(findToken(tokens, token.aliasOf))})` : token.value};`)
  return `:root {\n${lines.join('\n')}\n}\n`
}

function renderTailwindCss(tokens: readonly ResolvedToken[]): string {
  const lines = tokens.map((token) => `  ${tailwindVariable(token)}: var(${cssVariable(token)});`)
  return `@import "tailwindcss";\n\n@theme inline {\n${lines.join('\n')}\n}\n`
}

function renderThemeTs(tokens: readonly ResolvedToken[]): string {
  const categories: Record<string, Record<string, string>> = {}
  for (const token of tokens) {
    const category = categories[token.category] ??= {}
    category[token.cssName] = `var(${cssVariable(token)})`
  }
  return [
    '/** Generated by cutout.design-kit.v1. Do not edit by hand. */',
    `export const theme = ${JSON.stringify(sortJson(categories), null, 2)} as const`,
    '',
    'export type Theme = typeof theme',
    '',
  ].join('\n')
}

function renderDesignMarkdown(
  document: DesignDocument,
  tokens: readonly ResolvedToken[],
  source: { readonly documentFingerprint: string; readonly adapterFingerprint: string },
): string {
  const rows = tokens.map((token) => {
    const path = `${token.category}.${token.cssName}`
    const value = token.aliasOf
      ? `alias of \`${jsonTokenPath(findToken(tokens, token.aliasOf))}\``
      : `\`${escapeMarkdown(token.value)}\``
    return `| \`${path}\` | ${token.status} | ${value} |`
  })
  return [
    `# ${escapeMarkdown(document.meta.title)} Design Kit`,
    '',
    `Source: \`${document.meta.id}\` revision \`${document.revision.id}\`.`,
    `Document fingerprint: \`${source.documentFingerprint}\`.`,
    `Adapter fingerprint: \`${source.adapterFingerprint}\`.`,
    '',
    '## Tokens',
    '',
    '| Token | Status | Value |',
    '| --- | --- | --- |',
    ...rows,
    '',
  ].join('\n')
}

/**
 * A self-contained specimen sheet: a visual palette/type/spacing spec on the
 * left, the other five compiled files browsable (and copyable) on the right.
 * No fetch, no build step — every source's text is inlined at compile time,
 * the same way the reference bundle that inspired this baked its explorer data.
 */
function renderDesignSystemHtml(
  document: DesignDocument,
  tokens: readonly ResolvedToken[],
  designMarkdown: string,
): string {
  const byCategory = groupBy(tokens, (token) => token.category)
  const colorTokens = byCategory.color ?? []
  const swatchHtml = (token: ResolvedToken): string => `
        <div class="swatch">
          <div class="swatch-fill" style="background:${cssAttrValue(token)}"></div>
          <div class="swatch-meta">
            <code>${escapeHtml(jsonTokenPath(token))}</code>
            <span>${escapeHtml(token.value)}</span>
            ${token.irAliasOf ? `<span class="swatch-alias">alias of ${escapeHtml(tokens.find((entry) => entry.tokenId === token.irAliasOf)?.cssName ?? token.irAliasOf)}</span>` : ''}
          </div>
        </div>`
  const hasTiers = colorTokens.some((token) => token.irTier)
  const TIER_LABEL: Record<'primitive' | 'semantic' | 'alias', string> = {
    primitive: 'Primitive',
    semantic: 'Semantic',
    alias: 'Alias',
  }
  // Untiered stays byte-for-byte the original flat markup (no wrapper here —
  // the caller below still supplies the outer .swatch-grid + empty-state
  // fallback exactly as before). Tiered swaps in its own labelled sections,
  // each with its own .swatch-grid, and skips that outer wrapper entirely.
  const flatSwatchesHtml = colorTokens.map(swatchHtml).join('')
  const tierGroups: readonly { tier: 'primitive' | 'semantic' | 'alias' | 'ungrouped'; items: readonly ResolvedToken[] }[] = [
    ...(['primitive', 'semantic', 'alias'] as const).map((tier) => ({ tier, items: colorTokens.filter((token) => token.irTier === tier) })),
    { tier: 'ungrouped' as const, items: colorTokens.filter((token) => !token.irTier) },
  ]
  const tieredSwatchesHtml = tierGroups
    .filter((group) => group.items.length > 0)
    .map((group) => `
      <h3 class="tier-label">${group.tier === 'ungrouped' ? 'Ungrouped' : TIER_LABEL[group.tier]}</h3>
      <div class="swatch-grid">${group.items.map(swatchHtml).join('')}</div>`)
    .join('')
  const typeHtml = (byCategory.typography ?? []).map((token) => `
        <div class="type-row">
          <span class="type-sample" style="font:${cssAttrValue(token)}">${escapeHtml(document.meta.title)}</span>
          <code>${escapeHtml(jsonTokenPath(token))}</code>
        </div>`).join('')
  const spacingHtml = (byCategory.spacing ?? []).map((token) => `
        <div class="ramp-row">
          <div class="ramp-bar" style="width:${cssAttrValue(token)}"></div>
          <code>${escapeHtml(jsonTokenPath(token))} · ${escapeHtml(token.value)}</code>
        </div>`).join('')
  const radiusHtml = (byCategory.radius ?? []).map((token) => `
        <div class="radius-chip" style="border-radius:${cssAttrValue(token)}">
          <code>${escapeHtml(jsonTokenPath(token))}</code>
        </div>`).join('')

  const files: ReadonlyArray<readonly [string, string]> = [
    ['DESIGN.md', designMarkdown],
    ['tokens.json', renderTokensJson(tokens)],
    ['tokens.css', renderTokensCss(tokens)],
    ['tailwind.css', renderTailwindCss(tokens)],
    ['theme.ts', renderThemeTs(tokens)],
  ]
  const tabsHtml = files.map(([name], index) => `<button type="button" class="tab${index === 0 ? ' active' : ''}" data-tab="${index}">${escapeHtml(name)}</button>`).join('')
  const panelsHtml = files.map(([, content], index) => `<pre class="panel${index === 0 ? ' active' : ''}" data-panel="${index}">${escapeHtml(content)}</pre>`).join('')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(document.meta.title)} — Design system</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: #f7f6f2; color: #1b1d22; }
  .topbar { position: sticky; top: 0; z-index: 2; display: flex; min-height: 60px; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 24px; border-bottom: 1px solid #dfdcd3; background: #fff; }
  .topbar p { margin: 0; color: #5b5f6b; font: 11px/1.4 ui-monospace, monospace; letter-spacing: .06em; text-transform: uppercase; }
  .topbar strong { display: block; margin-top: 2px; font-size: 14px; }
  .app { display: grid; grid-template-columns: minmax(0,58fr) minmax(380px,42fr); min-height: calc(100vh - 60px); }
  .specimen, .source { overflow: auto; }
  .specimen { padding: 44px 48px 96px; }
  .source { border-left: 1px solid #dfdcd3; background: #fff; }
  .intro { display: flex; align-items: end; justify-content: space-between; gap: 24px; margin-bottom: 44px; }
  h1 { max-width: 14ch; font: 500 clamp(36px,5vw,68px)/.96 ui-serif, Georgia, serif; letter-spacing: 0; margin: 0; }
  .subtitle { max-width: 52ch; color: #5b5f6b; font-size: 15px; line-height: 1.55; margin: 14px 0 0; }
  h2 { font: 600 11px/1.4 ui-monospace, monospace; text-transform: uppercase; letter-spacing: .08em; color: #5b5f6b; margin: 42px 0 14px; }
  .swatch-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(150px,1fr)); gap: 14px; }
  .swatch { border: 1px solid #dfdcd3; border-radius: 12px; overflow: hidden; background: #fff; transition: transform .15s ease, border-color .15s ease; }
  .swatch:hover { transform: translateY(-2px); border-color: #1b1d22; }
  .swatch-fill { height: 88px; }
  .swatch-meta { padding: 10px; font-size: 11px; display: flex; flex-direction: column; gap: 3px; }
  .swatch-alias { color: #8b8e98; }
  .tier-label { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #8b8e98; margin: 16px 0 8px; }
  .tier-label:first-of-type { margin-top: 0; }
  .type-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 14px 0; border-bottom: 1px solid #dfdcd3; }
  .type-sample { font-size: 20px; }
  .ramp-row { display: flex; align-items: center; gap: 12px; padding: 6px 0; }
  .ramp-bar { height: 10px; background: #3a4ea6; border-radius: 3px; }
  .radius-chip { display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; background: #e7e9f6; margin: 0 8px 8px 0; }
  code { font-family: ui-monospace, monospace; font-size: 11px; color: #5b5f6b; }
  .source-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 20px 24px 12px; border-bottom: 1px solid #dfdcd3; }
  .source-head strong { font-size: 14px; }
  .tabs { display: flex; gap: 16px; overflow-x: auto; padding: 0 24px; border-bottom: 1px solid #dfdcd3; }
  .tab { height: 44px; flex: none; font-size: 12px; padding: 0; border: 0; border-bottom: 2px solid transparent; background: transparent; color: #5b5f6b; cursor: pointer; }
  .tab.active { color: #1b1d22; border-color: #1b1d22; font-weight: 700; }
  .panel { display: none; margin: 0; white-space: pre-wrap; word-break: break-word; font: 12px/1.7 ui-monospace, monospace; color: #31343c; background: #fff; padding: 24px; height: calc(100vh - 176px); overflow: auto; }
  .panel.active { display: block; }
  .copy { font-size: 12px; padding: 7px 10px; border: 1px solid #dfdcd3; border-radius: 7px; background: #fff; cursor: pointer; }
  @media (max-width: 900px) { .app { display: block; } .source { border-left: 0; border-top: 1px solid #dfdcd3; min-height: 620px; } .specimen { padding: 28px 20px 64px; } }
</style>
</head>
<body>
  <header class="topbar"><div><p>Design system explorer</p><strong>${escapeHtml(document.meta.title)}</strong></div><button type="button" class="copy" data-copy>Copy current file</button></header>
  <div class="app">
    <section class="specimen">
      <div class="intro"><div><h1>${escapeHtml(document.meta.title)}</h1><p class="subtitle">Revision ${escapeHtml(document.revision.id)} · generated from the current Design IR.</p></div></div>
      <h2>Color</h2>
      ${hasTiers ? tieredSwatchesHtml : `<div class="swatch-grid">${flatSwatchesHtml || '<p>No color tokens in this kit.</p>'}</div>`}
      <h2>Typography</h2>
      <div>${typeHtml || '<p>No typography tokens in this kit.</p>'}</div>
      <h2>Spacing</h2>
      <div>${spacingHtml || '<p>No spacing tokens in this kit.</p>'}</div>
      <h2>Radius</h2>
      <div>${radiusHtml || '<p>No radius tokens in this kit.</p>'}</div>
      <h2>Demo</h2>
      <iframe class="demo-frame" src="demo.html" style="width:100%;height:480px;border:1px solid #dfdcd3;border-radius:10px;background:#fff" title="demo"></iframe>
      <p><a href="demo.html" target="_blank" rel="noopener">Open full-page demo →</a></p>
    </section>
    <section class="source">
      <div class="source-head"><strong>Implementation source</strong><span>Generated</span></div>
      <div class="tabs">${tabsHtml}</div>
      ${panelsHtml}
    </section>
  </div>
  <script>
    var tabs = document.querySelectorAll('.tab');
    var panels = document.querySelectorAll('.panel');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) { t.classList.remove('active'); });
        panels.forEach(function (p) { p.classList.remove('active'); });
        tab.classList.add('active');
        document.querySelector('.panel[data-panel="' + tab.dataset.tab + '"]').classList.add('active');
      });
    });
    document.querySelector('[data-copy]').addEventListener('click', function () {
      var active = document.querySelector('.panel.active');
      if (active && navigator.clipboard) navigator.clipboard.writeText(active.textContent || '');
    });
  </script>
</body>
</html>
`
}

/**
 * A realistic mockup screen styled only with the compiled CSS custom
 * properties — proof the tokens survive contact with a real layout, not just
 * isolated swatches. Deterministic v1: role assignment is positional (first
 * color token = accent, second = surface, ...), not semantic — a
 * coding-agent pass can compose something more deliberate later without
 * changing this file's contract.
 */
function renderDemoHtml(
  document: DesignDocument,
  tokens: readonly ResolvedToken[],
  _source: { readonly documentFingerprint: string; readonly adapterFingerprint: string },
): string {
  const colors = tokens.filter((token) => token.category === 'color')
  const spacing = tokens.filter((token) => token.category === 'spacing')
  const radii = tokens.filter((token) => token.category === 'radius')
  const shadows = tokens.filter((token) => token.category === 'shadow')
  const typography = tokens.filter((token) => token.category === 'typography')
  const pick = <T>(list: readonly T[], index: number, fallback: T): T => list.length ? list[index % list.length]! : fallback
  const accent = pick(colors, 0, undefined as unknown as ResolvedToken)
  const surface = pick(colors, 1, accent)
  const ink = pick(colors, 2, accent)
  const gap = pick(spacing, 2, undefined as unknown as ResolvedToken)
  const radius = pick(radii, 0, undefined as unknown as ResolvedToken)
  const shadow = pick(shadows, 0, undefined as unknown as ResolvedToken)
  const font = pick(typography, 0, undefined as unknown as ResolvedToken)

  const css = renderTokensCss(tokens)
  const varOr = (token: ResolvedToken | undefined, fallback: string) => token ? `var(${cssVariable(token)})` : fallback

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(document.meta.title)} — Demo</title>
<style>
${css}
  * { box-sizing: border-box; }
  body { margin: 0; font: ${font ? varOr(font, '') : '14px/1.5 ui-sans-serif, system-ui, sans-serif'}; background: ${varOr(surface, '#f7f6f2')}; color: ${varOr(ink, '#1b1d22')}; }
  .shell { display: grid; grid-template-columns: 220px 1fr; min-height: 100vh; }
  .nav { background: ${varOr(surface, '#fff')}; border-right: 1px solid rgba(0,0,0,.08); padding: ${varOr(gap, '16px')}; }
  .nav .brand { font-weight: 700; margin-bottom: ${varOr(gap, '16px')}; }
  .nav a { display: block; padding: 8px 10px; border-radius: ${varOr(radius, '6px')}; color: inherit; text-decoration: none; opacity: .75; font-size: 13px; }
  .nav a.active { background: ${varOr(accent, '#3a4ea6')}; color: #fff; opacity: 1; }
  main { padding: ${varOr(gap, '24px')}; }
  .topbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: ${varOr(gap, '20px')}; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit,minmax(160px,1fr)); gap: ${varOr(gap, '14px')}; margin-bottom: ${varOr(gap, '24px')}; }
  .card { background: #fff; border-radius: ${varOr(radius, '10px')}; padding: 16px; box-shadow: ${shadow ? varOr(shadow, '') : '0 1px 2px rgba(0,0,0,.06)'}; }
  .card .label { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; opacity: .6; }
  .card .value { font-size: 24px; font-weight: 700; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: ${varOr(radius, '10px')}; overflow: hidden; box-shadow: ${shadow ? varOr(shadow, '') : '0 1px 2px rgba(0,0,0,.06)'}; }
  th, td { text-align: left; padding: 10px 14px; font-size: 13px; border-bottom: 1px solid rgba(0,0,0,.06); }
  th { opacity: .6; font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: .05em; }
  .btn { display: inline-block; background: ${varOr(accent, '#3a4ea6')}; color: #fff; border: none; border-radius: ${varOr(radius, '8px')}; padding: 8px 14px; font-size: 13px; cursor: pointer; }
</style>
</head>
<body>
  <div class="shell">
    <nav class="nav">
      <div class="brand">${escapeHtml(document.meta.title)}</div>
      <a class="active" href="#">Overview</a>
      <a href="#">Sources</a>
      <a href="#">Components</a>
      <a href="#">Settings</a>
    </nav>
    <main>
      <div class="topbar">
        <h1 style="font-size:18px;margin:0">Overview</h1>
        <button class="btn" type="button" onclick="alert('This demo is a visual reference — it renders no real actions.')">New run</button>
      </div>
      <div class="cards">
        <div class="card"><div class="label">Tokens</div><div class="value">${tokens.length}</div></div>
        <div class="card"><div class="label">Colors</div><div class="value">${colors.length}</div></div>
        <div class="card"><div class="label">Components</div><div class="value">${document.components.length}</div></div>
        <div class="card"><div class="label">Sources</div><div class="value">${document.sources.length}</div></div>
      </div>
      <table>
        <thead><tr><th>Token</th><th>Category</th><th>Value</th></tr></thead>
        <tbody>
          ${tokens.slice(0, 8).map((token) => `<tr><td>${escapeHtml(token.cssName)}</td><td>${escapeHtml(token.category)}</td><td>${escapeHtml(token.value)}</td></tr>`).join('')}
        </tbody>
      </table>
    </main>
  </div>
</body>
</html>
`
}

function renderManifest(
  source: DesignKit['source'],
  files: readonly Pick<DesignKitFile, 'path' | 'sha256' | 'sourceFingerprint' | 'provenance'>[],
): string {
  return `${JSON.stringify({
    version: 'design-kit.v1',
    source,
    files: [...files]
      .sort((left, right) => compareText(left.path, right.path))
      .map((file) => ({
        path: file.path,
        sha256: file.sha256,
        sourceFingerprint: file.sourceFingerprint,
        provenance: file.provenance,
      })),
  }, null, 2)}\n`
}

function cssVariable(token: Pick<ResolvedToken, 'category' | 'cssName'>): string {
  return `--cutout-${token.category}-${token.cssName}`
}

function tailwindVariable(token: Pick<ResolvedToken, 'category' | 'cssName'>): string {
  const prefix: Record<ResolvedToken['category'], string> = {
    color: 'color', spacing: 'spacing', radius: 'radius', typography: 'font', shadow: 'shadow', breakpoint: 'breakpoint',
  }
  return `--${prefix[token.category]}-${token.cssName}`
}

function jsonTokenPath(token: Pick<ResolvedToken, 'category' | 'cssName'>): string {
  return `${token.category}.${token.cssName}`
}

function findToken(tokens: readonly ResolvedToken[], tokenId: string): ResolvedToken {
  const token = tokens.find((entry) => entry.tokenId === tokenId)
  if (!token) throw new Error(`Missing resolved token "${tokenId}".`)
  return token
}

function compareTokens(left: ResolvedToken, right: ResolvedToken): number {
  return compareText(
    `${left.category}\u0000${left.cssName}\u0000${left.tokenId}`,
    `${right.category}\u0000${right.cssName}\u0000${right.tokenId}`,
  )
}

function adapterFingerprintEntry(token: ResolvedToken): Record<string, string> {
  return {
    tokenId: token.tokenId,
    category: token.category,
    cssName: token.cssName,
    status: token.status,
    ...(token.aliasOf ? { aliasOf: token.aliasOf } : {}),
  }
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareText)
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => compareText(left, right))
      .map(([key, entry]) => [key, sortJson(entry)]))
  }
  return value
}

function escapeMarkdown(value: string): string {
  return value.replaceAll('`', '\\`').replaceAll('|', '\\|').replaceAll('\n', ' ')
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** Safe to place inside a double-quoted HTML style attribute; isSafeCssValue already ruled out CSS injection. */
function cssAttrValue(token: ResolvedToken): string {
  return escapeHtml(token.value)
}

function groupBy<T, K extends string>(items: readonly T[], key: (item: T) => K): Partial<Record<K, T[]>> {
  const result: Partial<Record<K, T[]>> = {}
  for (const item of items) {
    const bucket = key(item)
    ;(result[bucket] ??= []).push(item)
  }
  return result
}

function isSafeCssValue(value: string): boolean {
  return value.length > 0 && !/[;{}\r\n]|\/\*|\*\//.test(value)
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

async function sha256Text(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
