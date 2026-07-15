/**
 * Deterministic, in-memory Brand/VI Kit v1 compiler.
 *
 * This is deliberately a compiler for explicit, reviewable claims. It does
 * not inspect pixels, infer a logo, discover a font license, or invent a
 * photography direction. Every published statement must point at immutable
 * Design IR content and at a provenance event that cites that content's source.
 */
import { z } from 'zod'
import {
  designDocumentSchema,
  fingerprint,
  validateDesignDocument,
  type ContentReference,
  type DesignDocument,
  type SourceLicense,
} from '@/design-ir'

const idSchema = z.string().min(1).max(160)
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i)
const cssNameSchema = z.string().regex(/^[a-z][a-z0-9-]*$/, 'CSS names must be lowercase kebab-case.')
const hexColorSchema = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'Colors must be explicit hexadecimal values.')

/** A content-addressed, licensed fact from the canonical DesignDocument. */
export const brandEvidenceReferenceSchema = z.object({
  sourceId: idSchema,
  contentId: idSchema,
  provenanceId: idSchema,
}).strict()

export const brandLogoVariantSchema = z.object({
  id: idSchema,
  label: z.string().min(1).max(200),
  kind: z.enum(['primary', 'mark', 'wordmark', 'monochrome']),
  evidence: brandEvidenceReferenceSchema,
}).strict()

export const brandLogoSchema = z.object({
  variants: z.array(brandLogoVariantSchema).min(1),
}).strict()

export const brandClearspaceSchema = z.object({
  rule: z.string().min(1).max(2_000),
  evidence: brandEvidenceReferenceSchema,
}).strict()

export const brandMinimumSizeSchema = z.object({
  logoId: idSchema,
  width: z.number().positive(),
  height: z.number().positive().optional(),
  unit: z.enum(['px', 'pt', 'mm']),
  evidence: brandEvidenceReferenceSchema,
}).strict()

export const brandColorSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(200),
  cssName: cssNameSchema,
  value: hexColorSchema,
  evidence: brandEvidenceReferenceSchema,
}).strict()

export const brandTypefaceSchema = z.object({
  id: idSchema,
  role: z.enum(['display', 'body', 'mono', 'accent']),
  family: z.string().min(1).max(300),
  evidence: brandEvidenceReferenceSchema,
}).strict()

export const brandGuidanceSchema = z.object({
  guidance: z.string().min(1).max(10_000),
  evidence: brandEvidenceReferenceSchema,
}).strict()

export const brandAssetRecipeSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(200),
  kind: z.enum(['social-image', 'presentation', 'web-banner', 'app-icon', 'favicon', 'other']),
  instructions: z.string().min(1).max(10_000),
  evidence: brandEvidenceReferenceSchema,
}).strict()

/**
 * Explicit Brand/VI facts only. There are no confidence values, guessed
 * colors, generated logos, inferred styles, or free-form external assets.
 */
export const brandKitDefinitionSchema = z.object({
  brandId: idSchema,
  logo: brandLogoSchema,
  clearspace: brandClearspaceSchema,
  minSize: z.array(brandMinimumSizeSchema).min(1),
  colors: z.array(brandColorSchema).min(1),
  type: z.array(brandTypefaceSchema).min(1),
  icon: brandGuidanceSchema,
  photo: brandGuidanceSchema,
  voice: brandGuidanceSchema,
  assetRecipes: z.array(brandAssetRecipeSchema).min(1),
}).strict()

export const brandKitInputSchema = z.object({
  document: designDocumentSchema,
  brand: brandKitDefinitionSchema,
}).strict()

export const brandKitProvenanceSchema = z.object({
  compiler: z.literal('cutout.brand-kit.v1'),
  documentId: idSchema,
  revisionId: idSchema,
  brandId: idSchema,
  sourceIds: z.array(idSchema),
  contentIds: z.array(idSchema),
  contentSha256: z.array(sha256Schema),
  provenanceIds: z.array(idSchema),
}).strict()

export const brandKitFileSchema = z.object({
  path: z.enum(['BRAND.md', 'brand.tokens.json', 'brand.css', 'brand.manifest.json']),
  content: z.string(),
  sha256: sha256Schema,
  sourceFingerprint: sha256Schema,
  provenance: brandKitProvenanceSchema,
}).strict()

export const brandKitSchema = z.object({
  version: z.literal('brand-kit.v1'),
  source: z.object({
    documentId: idSchema,
    revisionId: idSchema,
    brandId: idSchema,
    documentFingerprint: sha256Schema,
    definitionFingerprint: sha256Schema,
  }).strict(),
  files: z.array(brandKitFileSchema),
}).strict()

export type BrandEvidenceReference = z.infer<typeof brandEvidenceReferenceSchema>
export type BrandKitDefinition = z.infer<typeof brandKitDefinitionSchema>
export type BrandKitInput = z.infer<typeof brandKitInputSchema>
export type BrandKitProvenance = z.infer<typeof brandKitProvenanceSchema>
export type BrandKitFile = z.infer<typeof brandKitFileSchema>
export type BrandKit = z.infer<typeof brandKitSchema>

interface ResolvedEvidence {
  readonly reference: BrandEvidenceReference
  readonly sourceTitle: string
  readonly license: SourceLicense
  readonly content: ContentReference
}

interface ResolvedLogo {
  readonly id: string
  readonly label: string
  readonly kind: BrandKitDefinition['logo']['variants'][number]['kind']
  readonly evidence: ResolvedEvidence
}

interface ResolvedColor {
  readonly id: string
  readonly name: string
  readonly cssName: string
  readonly value: string
  readonly evidence: ResolvedEvidence
}

interface ResolvedTypeface {
  readonly id: string
  readonly role: BrandKitDefinition['type'][number]['role']
  readonly family: string
  readonly evidence: ResolvedEvidence
}

interface ResolvedMinimumSize {
  readonly logoId: string
  readonly width: number
  readonly height?: number
  readonly unit: BrandKitDefinition['minSize'][number]['unit']
  readonly evidence: ResolvedEvidence
}

interface ResolvedRecipe {
  readonly id: string
  readonly name: string
  readonly kind: BrandKitDefinition['assetRecipes'][number]['kind']
  readonly instructions: string
  readonly evidence: ResolvedEvidence
}

interface ResolvedBrandDefinition {
  readonly brandName: string
  readonly brandId: string
  readonly logo: readonly ResolvedLogo[]
  readonly clearspace: { readonly rule: string; readonly evidence: ResolvedEvidence }
  readonly minSize: readonly ResolvedMinimumSize[]
  readonly colors: readonly ResolvedColor[]
  readonly type: readonly ResolvedTypeface[]
  readonly icon: { readonly guidance: string; readonly evidence: ResolvedEvidence }
  readonly photo: { readonly guidance: string; readonly evidence: ResolvedEvidence }
  readonly voice: { readonly guidance: string; readonly evidence: ResolvedEvidence }
  readonly assetRecipes: readonly ResolvedRecipe[]
}

/** Compile an auditable Brand/VI Kit without network access, model calls, or filesystem writes. */
export async function compileBrandKit(input: BrandKitInput): Promise<BrandKit> {
  const parsed = brandKitInputSchema.parse(input)
  const documentValidation = validateDesignDocument(parsed.document)
  if (!documentValidation.ok) throw new Error(`Invalid DesignDocument: ${documentValidation.error}`)

  const brand = resolveBrandDefinition(parsed.document, parsed.brand)
  const documentFingerprint = await fingerprint(parsed.document)
  const definitionFingerprint = await fingerprint(normalizeDefinition(parsed.brand))
  const source = {
    documentId: parsed.document.meta.id,
    revisionId: parsed.document.revision.id,
    brandId: brand.brandId,
    documentFingerprint,
    definitionFingerprint,
  } as const
  const provenance = buildProvenance(parsed.document, brand)

  const sourceFiles: ReadonlyArray<readonly [Exclude<BrandKitFile['path'], 'brand.manifest.json'>, string]> = [
    ['BRAND.md', renderBrandMarkdown(brand, source)],
    ['brand.tokens.json', renderBrandTokens(brand)],
    ['brand.css', renderBrandCss(brand)],
  ]
  const filesWithoutManifest = await Promise.all(sourceFiles.map(async ([path, content]) => ({
    path,
    content,
    sha256: await sha256Text(content),
    sourceFingerprint: documentFingerprint,
    provenance,
  })))
  const manifestContent = renderManifest(source, filesWithoutManifest)
  const manifest: BrandKitFile = {
    path: 'brand.manifest.json',
    content: manifestContent,
    sha256: await sha256Text(manifestContent),
    sourceFingerprint: documentFingerprint,
    provenance,
  }

  return brandKitSchema.parse({
    version: 'brand-kit.v1',
    source,
    files: [...filesWithoutManifest, manifest].sort((left, right) => compareText(left.path, right.path)),
  })
}

function resolveBrandDefinition(document: DesignDocument, definition: BrandKitDefinition): ResolvedBrandDefinition {
  const declaredBrand = document.brands.find((brand) => brand.id === definition.brandId)
  if (!declaredBrand) throw new Error(`Brand Kit references unknown brand "${definition.brandId}".`)
  if (declaredBrand.status !== 'active') throw new Error(`Brand Kit requires active brand "${definition.brandId}".`)

  const logoIds = new Set<string>()
  const logos = definition.logo.variants.map((logo) => {
    assertUnique(logoIds, logo.id, 'logo id')
    return { ...logo, evidence: resolveEvidence(document, logo.evidence, `Logo "${logo.id}"`, true) }
  }).sort(compareById)

  const colorNames = new Set<string>()
  const colorIds = new Set<string>()
  const colors = definition.colors.map((color) => {
    assertUnique(colorIds, color.id, 'color id')
    assertUnique(colorNames, color.cssName, 'color CSS name')
    return { ...color, evidence: resolveEvidence(document, color.evidence, `Color "${color.id}"`) }
  }).sort(compareColors)

  const typeIds = new Set<string>()
  const typeRoles = new Set<string>()
  const type = definition.type.map((face) => {
    assertUnique(typeIds, face.id, 'typeface id')
    assertUnique(typeRoles, face.role, 'typeface role')
    return { ...face, evidence: resolveEvidence(document, face.evidence, `Typeface "${face.id}"`, true) }
  }).sort(compareTypefaces)

  const minSize = definition.minSize.map((entry) => {
    if (!logoIds.has(entry.logoId)) throw new Error(`Minimum size references unknown logo "${entry.logoId}".`)
    return { ...entry, evidence: resolveEvidence(document, entry.evidence, `Minimum size for "${entry.logoId}"`) }
  }).sort(compareMinSizes)
  const sizeKeys = new Set<string>()
  for (const entry of minSize) assertUnique(sizeKeys, `${entry.logoId}:${entry.unit}`, 'minimum size rule')

  const recipeIds = new Set<string>()
  const assetRecipes = definition.assetRecipes.map((recipe) => {
    assertUnique(recipeIds, recipe.id, 'asset recipe id')
    return { ...recipe, evidence: resolveEvidence(document, recipe.evidence, `Asset recipe "${recipe.id}"`) }
  }).sort(compareById)

  return {
    brandName: declaredBrand.name,
    brandId: declaredBrand.id,
    logo: logos,
    clearspace: {
      rule: definition.clearspace.rule,
      evidence: resolveEvidence(document, definition.clearspace.evidence, 'Clearspace rule'),
    },
    minSize,
    colors,
    type,
    icon: { guidance: definition.icon.guidance, evidence: resolveEvidence(document, definition.icon.evidence, 'Icon guidance') },
    photo: { guidance: definition.photo.guidance, evidence: resolveEvidence(document, definition.photo.evidence, 'Photography guidance') },
    voice: { guidance: definition.voice.guidance, evidence: resolveEvidence(document, definition.voice.evidence, 'Voice guidance') },
    assetRecipes,
  }
}

function resolveEvidence(
  document: DesignDocument,
  reference: BrandEvidenceReference,
  label: string,
  requireBrandAsset = false,
): ResolvedEvidence {
  const source = document.sources.find((entry) => entry.id === reference.sourceId)
  if (!source) throw new Error(`${label} references unknown source "${reference.sourceId}".`)
  if (requireBrandAsset && source.role !== 'brand-asset') {
    throw new Error(`${label} must cite a source with role "brand-asset".`)
  }
  if (source.license.kind === 'unknown') {
    throw new Error(`${label} references source "${source.id}" with unknown license.`)
  }
  const content = source.content.find((entry) => entry.id === reference.contentId)
  if (!content) throw new Error(`${label} references content "${reference.contentId}" missing from source "${source.id}".`)
  if (!content.sha256) throw new Error(`${label} references content "${content.id}" without a SHA-256 digest.`)
  const provenance = document.provenance.find((entry) => entry.id === reference.provenanceId)
  if (!provenance) throw new Error(`${label} references unknown provenance "${reference.provenanceId}".`)
  if (!provenance.sourceIds.includes(source.id)) {
    throw new Error(`${label} provenance "${provenance.id}" does not cite source "${source.id}".`)
  }
  return { reference, sourceTitle: source.title, license: source.license, content }
}

function buildProvenance(document: DesignDocument, brand: ResolvedBrandDefinition): BrandKitProvenance {
  const evidence = allEvidence(brand)
  return {
    compiler: 'cutout.brand-kit.v1',
    documentId: document.meta.id,
    revisionId: document.revision.id,
    brandId: brand.brandId,
    sourceIds: uniqueSorted(evidence.map((entry) => entry.reference.sourceId)),
    contentIds: uniqueSorted(evidence.map((entry) => entry.reference.contentId)),
    contentSha256: uniqueSorted(evidence.map((entry) => {
      if (!entry.content.sha256) throw new Error(`Evidence content "${entry.content.id}" has no SHA-256 digest.`)
      return entry.content.sha256
    })),
    provenanceIds: uniqueSorted(evidence.map((entry) => entry.reference.provenanceId)),
  }
}

function allEvidence(brand: ResolvedBrandDefinition): readonly ResolvedEvidence[] {
  return [
    ...brand.logo.map((entry) => entry.evidence),
    brand.clearspace.evidence,
    ...brand.minSize.map((entry) => entry.evidence),
    ...brand.colors.map((entry) => entry.evidence),
    ...brand.type.map((entry) => entry.evidence),
    brand.icon.evidence,
    brand.photo.evidence,
    brand.voice.evidence,
    ...brand.assetRecipes.map((entry) => entry.evidence),
  ]
}

function normalizeDefinition(definition: BrandKitDefinition): Record<string, unknown> {
  return {
    ...definition,
    logo: { variants: [...definition.logo.variants].sort(compareById) },
    minSize: [...definition.minSize].sort(compareMinSizes),
    colors: [...definition.colors].sort(compareColors),
    type: [...definition.type].sort(compareTypefaces),
    assetRecipes: [...definition.assetRecipes].sort(compareById),
  }
}

function renderBrandMarkdown(
  brand: ResolvedBrandDefinition,
  source: Pick<BrandKit['source'], 'documentId' | 'revisionId' | 'documentFingerprint' | 'definitionFingerprint'>,
): string {
  const logoRows = brand.logo.map((entry) => `| \`${escapeMarkdown(entry.id)}\` | ${escapeMarkdown(entry.kind)} | ${escapeMarkdown(entry.label)} | ${renderEvidence(entry.evidence)} |`)
  const sizeRows = brand.minSize.map((entry) => `| \`${escapeMarkdown(entry.logoId)}\` | ${formatSize(entry)} | ${renderEvidence(entry.evidence)} |`)
  const colorRows = brand.colors.map((entry) => `| \`${escapeMarkdown(entry.cssName)}\` | ${escapeMarkdown(entry.name)} | \`${entry.value}\` | ${renderEvidence(entry.evidence)} |`)
  const typeRows = brand.type.map((entry) => `| ${escapeMarkdown(entry.role)} | ${escapeMarkdown(entry.family)} | ${renderEvidence(entry.evidence)} |`)
  const recipeRows = brand.assetRecipes.map((entry) => `| \`${escapeMarkdown(entry.id)}\` | ${escapeMarkdown(entry.kind)} | ${escapeMarkdown(entry.name)} | ${escapeMarkdown(entry.instructions)} | ${renderEvidence(entry.evidence)} |`)
  return [
    `# ${escapeMarkdown(brand.brandName)} Brand Kit`,
    '',
    `Source: \`${source.documentId}\` revision \`${source.revisionId}\`.`,
    `Document fingerprint: \`${source.documentFingerprint}\`.`,
    `Definition fingerprint: \`${source.definitionFingerprint}\`.`,
    '',
    '## Logo',
    '',
    '| ID | Kind | Label | Evidence |',
    '| --- | --- | --- | --- |',
    ...logoRows,
    '',
    '## Clearspace',
    '',
    brand.clearspace.rule,
    '',
    `Evidence: ${renderEvidence(brand.clearspace.evidence)}.`,
    '',
    '## Minimum Size',
    '',
    '| Logo | Minimum | Evidence |',
    '| --- | --- | --- |',
    ...sizeRows,
    '',
    '## Color',
    '',
    '| Token | Name | Value | Evidence |',
    '| --- | --- | --- | --- |',
    ...colorRows,
    '',
    '## Typography',
    '',
    '| Role | Family | Evidence |',
    '| --- | --- | --- |',
    ...typeRows,
    '',
    '## Iconography',
    '',
    brand.icon.guidance,
    '',
    `Evidence: ${renderEvidence(brand.icon.evidence)}.`,
    '',
    '## Photography',
    '',
    brand.photo.guidance,
    '',
    `Evidence: ${renderEvidence(brand.photo.evidence)}.`,
    '',
    '## Voice',
    '',
    brand.voice.guidance,
    '',
    `Evidence: ${renderEvidence(brand.voice.evidence)}.`,
    '',
    '## Asset Recipes',
    '',
    '| ID | Kind | Name | Instructions | Evidence |',
    '| --- | --- | --- | --- | --- |',
    ...recipeRows,
    '',
  ].join('\n')
}

function renderBrandTokens(brand: ResolvedBrandDefinition): string {
  const colors: Record<string, unknown> = {}
  for (const color of brand.colors) {
    colors[color.cssName] = {
      '$type': 'color',
      '$value': color.value,
      '$extensions': {
        'cutout.colorId': color.id,
        'cutout.evidence': color.evidence.reference,
      },
    }
  }
  return `${JSON.stringify({ color: colors }, null, 2)}\n`
}

function renderBrandCss(brand: ResolvedBrandDefinition): string {
  return `:root {\n${brand.colors.map((color) => `  --cutout-brand-color-${color.cssName}: ${color.value};`).join('\n')}\n}\n`
}

function renderManifest(
  source: BrandKit['source'],
  files: readonly Pick<BrandKitFile, 'path' | 'sha256' | 'sourceFingerprint' | 'provenance'>[],
): string {
  return `${JSON.stringify({
    version: 'brand-kit.v1',
    source,
    files: [...files].sort((left, right) => compareText(left.path, right.path)).map((file) => ({
      path: file.path,
      sha256: file.sha256,
      sourceFingerprint: file.sourceFingerprint,
      provenance: file.provenance,
    })),
  }, null, 2)}\n`
}

function renderEvidence(evidence: ResolvedEvidence): string {
  return `source \`${escapeMarkdown(evidence.reference.sourceId)}\`, content \`${escapeMarkdown(evidence.reference.contentId)}\`, provenance \`${escapeMarkdown(evidence.reference.provenanceId)}\``
}

function formatSize(entry: Pick<ResolvedMinimumSize, 'width' | 'height' | 'unit'>): string {
  return entry.height === undefined
    ? `${entry.width}${entry.unit}`
    : `${entry.width}${entry.unit} × ${entry.height}${entry.unit}`
}

function assertUnique(values: Set<string>, value: string, label: string): void {
  if (values.has(value)) throw new Error(`Duplicate ${label} "${value}".`)
  values.add(value)
}

function compareById(left: { readonly id: string }, right: { readonly id: string }): number {
  return compareText(left.id, right.id)
}

function compareColors(left: Pick<ResolvedColor, 'cssName' | 'id'>, right: Pick<ResolvedColor, 'cssName' | 'id'>): number {
  return compareText(`${left.cssName}\u0000${left.id}`, `${right.cssName}\u0000${right.id}`)
}

function compareTypefaces(left: Pick<ResolvedTypeface, 'role' | 'id'>, right: Pick<ResolvedTypeface, 'role' | 'id'>): number {
  return compareText(`${left.role}\u0000${left.id}`, `${right.role}\u0000${right.id}`)
}

function compareMinSizes(left: Pick<ResolvedMinimumSize, 'logoId' | 'unit' | 'width' | 'height'>, right: Pick<ResolvedMinimumSize, 'logoId' | 'unit' | 'width' | 'height'>): number {
  return compareText(
    `${left.logoId}\u0000${left.unit}\u0000${left.width}\u0000${left.height ?? ''}`,
    `${right.logoId}\u0000${right.unit}\u0000${right.width}\u0000${right.height ?? ''}`,
  )
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareText)
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function escapeMarkdown(value: string): string {
  return value.replaceAll('`', '\\`').replaceAll('|', '\\|').replaceAll('\n', ' ')
}

async function sha256Text(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
