/**
 * Explicit component candidate compiler.
 *
 * This module deliberately does not inspect screenshots, DOM, or generated
 * pages to invent components. A caller must declare each candidate and its
 * public API. The compiler only proves that those declarations agree with the
 * canonical Design IR and produces portable manifests.
 */
import { z } from 'zod'
import {
  designDocumentSchema,
  fingerprint,
  validateDesignDocument,
  type DesignDocument,
  type DesignToken,
} from '@/design-ir'

const idSchema = z.string().min(1).max(160)
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i)
const apiNameSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/, 'Component API names must be ASCII identifiers.')

export const componentCandidateKindSchema = z.enum(['primitive', 'composite', 'layout', 'pattern'])
export const componentCandidateStatusSchema = z.enum(['draft', 'ready', 'deprecated'])

const componentPropSchema = z.discriminatedUnion('type', [
  z.object({ name: apiNameSchema, type: z.literal('string'), required: z.boolean().default(false), defaultValue: z.string().optional() }).strict(),
  z.object({ name: apiNameSchema, type: z.literal('boolean'), required: z.boolean().default(false), defaultValue: z.boolean().optional() }).strict(),
  z.object({ name: apiNameSchema, type: z.literal('number'), required: z.boolean().default(false), defaultValue: z.number().finite().optional() }).strict(),
  z.object({ name: apiNameSchema, type: z.literal('enum'), required: z.boolean().default(false), values: z.array(z.string().min(1)).min(1), defaultValue: z.string().optional() }).strict(),
])

const componentEvidenceSchema = z.object({
  materialId: idSchema, revisionId: idSchema, pageId: idSchema,
  bounds: z.object({ x: z.number().nonnegative(), y: z.number().nonnegative(), width: z.number().positive(), height: z.number().positive() }).strict(),
  selectedBy: z.string().min(1), selectedAt: z.string().datetime(),
}).strict()
const componentConstraintsSchema = z.object({
  horizontal: z.enum(['fixed', 'fill', 'hug']), vertical: z.enum(['fixed', 'fill', 'hug']),
  minWidth: z.number().nonnegative().optional(), maxWidth: z.number().positive().optional(),
  minHeight: z.number().nonnegative().optional(), maxHeight: z.number().positive().optional(),
  aspectRatio: z.number().positive().optional(),
}).strict()

export const componentCandidateSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  kind: componentCandidateKindSchema,
  sourcePageIds: z.array(idSchema).min(1),
  tokenRefs: z.array(idSchema).default([]),
  props: z.array(componentPropSchema).default([]),
  variants: z.array(z.object({ name: apiNameSchema, values: z.array(z.string().min(1)).min(1) }).strict()).default([]),
  slots: z.array(z.object({ name: apiNameSchema, required: z.boolean().default(false) }).strict()).default([]),
  states: z.array(z.object({ name: apiNameSchema, description: z.string().min(1), props: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}) }).strict()).optional(),
  stories: z.array(z.object({ name: apiNameSchema, state: apiNameSchema.optional(), variant: z.record(z.string(), z.string()).default({}), viewport: z.enum(['mobile', 'tablet', 'desktop']).default('desktop') }).strict()).optional(),
  evidence: componentEvidenceSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
  constraints: componentConstraintsSchema.optional(),
  responsive: z.array(z.object({ breakpoint: z.string().min(1), changes: z.object({ horizontal: z.enum(['fixed', 'fill', 'hug']).optional(), vertical: z.enum(['fixed', 'fill', 'hug']).optional(), hidden: z.boolean().optional() }).strict() }).strict()).optional(),
  tokenBindings: z.array(z.object({ property: z.string().min(1), tokenId: idSchema }).strict()).optional(),
  status: componentCandidateStatusSchema,
}).strict()

export const componentCandidateInputSchema = z.object({
  document: designDocumentSchema,
  candidates: z.array(componentCandidateSchema),
}).strict()

const componentManifestCandidateSchema = componentCandidateSchema
export const componentManifestSchema = z.object({
  version: z.literal('components.manifest.v1'),
  source: z.object({
    documentId: idSchema,
    revisionId: idSchema,
    documentFingerprint: sha256Schema,
    declarationFingerprint: sha256Schema,
  }).strict(),
  candidates: z.array(componentManifestCandidateSchema),
}).strict()

export const shadcnAdapterPlanSchema = z.object({
  version: z.literal('shadcn.adapter-plan.v1'),
  source: z.object({
    documentId: idSchema,
    revisionId: idSchema,
    documentFingerprint: sha256Schema,
    declarationFingerprint: sha256Schema,
  }).strict(),
  generation: z.object({
    generatesShadcnSource: z.literal(false),
    forksShadcnSource: z.literal(false),
    implementation: z.literal('manual'),
  }).strict(),
  config: z.object({
    tokenStrategy: z.literal('css-variables'),
    componentStrategy: z.literal('user-owned'),
  }).strict(),
  tokenMappings: z.array(z.object({
    tokenId: idSchema,
    cssVariable: z.string().regex(/^--cutout-token-[a-z0-9-]+$/),
    value: z.string().min(1),
    kind: z.string().min(1),
  }).strict()),
  components: z.array(z.object({
    candidateId: idSchema,
    registryName: z.string().min(1),
    status: componentCandidateStatusSchema,
    implementation: z.literal('manual'),
  }).strict()),
}).strict()

export const componentCompilerFileSchema = z.object({
  path: z.enum(['components.manifest.json', 'shadcn.adapter-plan.json']),
  content: z.string(),
  sha256: sha256Schema,
  sourceFingerprint: sha256Schema,
}).strict()

export const componentCompilerOutputSchema = z.object({
  version: z.literal('components.compiler.v1'),
  source: componentManifestSchema.shape.source,
  files: z.array(componentCompilerFileSchema).length(2),
}).strict()

export type ComponentCandidate = z.infer<typeof componentCandidateSchema>
export type ComponentCandidateInput = z.infer<typeof componentCandidateInputSchema>
export type ComponentManifest = z.infer<typeof componentManifestSchema>
export type ShadcnAdapterPlan = z.infer<typeof shadcnAdapterPlanSchema>
export type ComponentCompilerFile = z.infer<typeof componentCompilerFileSchema>
export type ComponentCompilerOutput = z.infer<typeof componentCompilerOutputSchema>

/** Compile a deterministic, write-free manifest and shadcn mapping plan. */
export async function compileComponentCandidates(input: ComponentCandidateInput): Promise<ComponentCompilerOutput> {
  const parsed = componentCandidateInputSchema.parse(input)
  const documentValidation = validateDesignDocument(parsed.document)
  if (!documentValidation.ok) throw new Error(`Invalid DesignDocument: ${documentValidation.error}`)

  const candidates = normalizeAndValidateCandidates(parsed.document, parsed.candidates)
  const documentFingerprint = await fingerprint(parsed.document)
  const declarationFingerprint = await fingerprint(candidates)
  const source = {
    documentId: parsed.document.meta.id,
    revisionId: parsed.document.revision.id,
    documentFingerprint,
    declarationFingerprint,
  } as const

  const manifest = componentManifestSchema.parse({ version: 'components.manifest.v1', source, candidates })
  const plan = shadcnAdapterPlanSchema.parse({
    version: 'shadcn.adapter-plan.v1',
    source,
    generation: { generatesShadcnSource: false, forksShadcnSource: false, implementation: 'manual' },
    config: { tokenStrategy: 'css-variables', componentStrategy: 'user-owned' },
    tokenMappings: resolveTokenMappings(parsed.document, candidates),
    components: candidates.map((candidate) => ({
      candidateId: candidate.id,
      registryName: candidate.name,
      status: candidate.status,
      implementation: 'manual' as const,
    })),
  })

  const manifestContent = jsonFile(manifest)
  const planContent = jsonFile(plan)
  return componentCompilerOutputSchema.parse({
    version: 'components.compiler.v1',
    source,
    files: (await Promise.all([
      file('components.manifest.json', manifestContent, documentFingerprint),
      file('shadcn.adapter-plan.json', planContent, documentFingerprint),
    ])).sort((left, right) => compareText(left.path, right.path)),
  })
}

/**
 * Re-proves a persisted manifest against its Design IR. Consumers such as a
 * Starter compiler must call this rather than trusting a self-consistent JSON
 * fingerprint: a caller can always recompute a fingerprint for invalid refs.
 */
export async function validateComponentManifest(
  document: DesignDocument,
  manifestInput: unknown,
): Promise<ComponentManifest> {
  const documentValidation = validateDesignDocument(document)
  if (!documentValidation.ok) throw new Error(`Invalid DesignDocument: ${documentValidation.error}`)
  const manifest = componentManifestSchema.parse(manifestInput)
  const documentFingerprint = await fingerprint(document)
  if (manifest.source.documentId !== document.meta.id || manifest.source.revisionId !== document.revision.id) {
    throw new Error('Component Candidate Manifest does not belong to this DesignDocument revision.')
  }
  if (manifest.source.documentFingerprint !== documentFingerprint) {
    throw new Error('Component Candidate Manifest document fingerprint does not match this DesignDocument.')
  }
  const candidates = normalizeAndValidateCandidates(document, manifest.candidates)
  const declarationFingerprint = await fingerprint(candidates)
  if (manifest.source.declarationFingerprint !== declarationFingerprint) {
    throw new Error('Component Candidate Manifest declaration fingerprint does not match its candidates.')
  }
  return componentManifestSchema.parse({ ...manifest, candidates })
}

function normalizeAndValidateCandidates(
  document: DesignDocument,
  declarations: readonly ComponentCandidate[],
): readonly ComponentCandidate[] {
  const candidateIds = new Set<string>()
  const pageIds = new Set(document.prototype?.plan.pages.map((page) => page.id) ?? [])
  const tokens = new Map(document.tokens.map((token) => [token.id, token]))
  const irComponents = new Map(document.components.map((component) => [component.id, component]))

  return declarations.map((candidate) => {
    if (candidateIds.has(candidate.id)) throw new Error(`Component candidate declares duplicate id "${candidate.id}".`)
    candidateIds.add(candidate.id)
    if (!document.prototype) throw new Error(`Component candidate "${candidate.id}" requires a prototype to validate sourcePageIds.`)

    assertUnique(candidate.sourcePageIds, `Component candidate "${candidate.id}" has duplicate sourcePageId`)
    assertUnique(candidate.tokenRefs, `Component candidate "${candidate.id}" has duplicate tokenRef`)
    for (const pageId of candidate.sourcePageIds) {
      if (!pageIds.has(pageId)) throw new Error(`Component candidate "${candidate.id}" references unknown prototype page "${pageId}".`)
    }
    for (const tokenId of candidate.tokenRefs) {
      if (!tokens.has(tokenId)) throw new Error(`Component candidate "${candidate.id}" references unknown Design IR token "${tokenId}".`)
    }
    for (const binding of candidate.tokenBindings ?? []) {
      if (!candidate.tokenRefs.includes(binding.tokenId)) throw new Error(`Component candidate "${candidate.id}" token binding must reference a declared tokenRef.`)
    }
    assertCandidateApi(candidate)
    assertIrComponentAndRelations(document, candidate, irComponents)
    return normalizeCandidate(candidate)
  }).sort((left, right) => compareText(left.id, right.id))
}

function assertCandidateApi(candidate: ComponentCandidate): void {
  const props = new Set<string>()
  for (const prop of candidate.props) {
    if (props.has(prop.name)) throw new Error(`Component candidate "${candidate.id}" has duplicate prop "${prop.name}".`)
    props.add(prop.name)
    if (prop.type === 'enum') {
      assertUnique(prop.values, `Component candidate "${candidate.id}" prop "${prop.name}" has duplicate enum value`)
      if (prop.defaultValue !== undefined && !prop.values.includes(prop.defaultValue)) {
        throw new Error(`Component candidate "${candidate.id}" prop "${prop.name}" defaultValue is not an enum value.`)
      }
    }
  }
  const variants = new Set<string>()
  for (const variant of candidate.variants) {
    if (variants.has(variant.name)) throw new Error(`Component candidate "${candidate.id}" has duplicate variant "${variant.name}".`)
    if (props.has(variant.name)) throw new Error(`Component candidate "${candidate.id}" variant "${variant.name}" conflicts with prop "${variant.name}".`)
    assertUnique(variant.values, `Component candidate "${candidate.id}" variant "${variant.name}" has duplicate value`)
    variants.add(variant.name)
  }
  const slots = new Set<string>()
  for (const slot of candidate.slots) {
    if (slots.has(slot.name)) throw new Error(`Component candidate "${candidate.id}" has duplicate slot "${slot.name}".`)
    if (props.has(slot.name) || variants.has(slot.name)) {
      throw new Error(`Component candidate "${candidate.id}" slot "${slot.name}" conflicts with an existing component API member.`)
    }
    slots.add(slot.name)
  }
  const states = new Set((candidate.states ?? []).map(({ name }) => name))
  if (states.size !== (candidate.states ?? []).length) throw new Error(`Component candidate "${candidate.id}" has duplicate state names.`)
  const stories = new Set<string>()
  for (const story of candidate.stories ?? []) {
    if (stories.has(story.name)) throw new Error(`Component candidate "${candidate.id}" has duplicate story "${story.name}".`)
    stories.add(story.name)
    if (story.state && !states.has(story.state)) throw new Error(`Component candidate "${candidate.id}" story "${story.name}" references unknown state "${story.state}".`)
    for (const [variant, value] of Object.entries(story.variant)) {
      const declaration = candidate.variants.find(({ name }) => name === variant)
      if (!declaration?.values.includes(value)) throw new Error(`Component candidate "${candidate.id}" story "${story.name}" has an invalid variant value.`)
    }
  }
}

function assertIrComponentAndRelations(
  document: DesignDocument,
  candidate: ComponentCandidate,
  irComponents: ReadonlyMap<string, DesignDocument['components'][number]>,
): void {
  const component = irComponents.get(candidate.id)
  if (!component) return
  if (component.name !== candidate.name || component.status !== candidate.status || !sameSet(component.tokenIds, candidate.tokenRefs)) {
    throw new Error(`Component candidate "${candidate.id}" does not match the matching Design IR component declaration.`)
  }

  const relationTokenIds = document.relations
    .filter((relation) => relation.kind === 'component-uses-token' && relation.from.id === candidate.id)
    .map((relation) => relation.to.id)
  if (!sameSet(relationTokenIds, candidate.tokenRefs)) {
    throw new Error(`Component token relations for "${candidate.id}" do not exactly match candidate tokenRefs.`)
  }

  const prototypeRelations = document.relations.filter(
    (relation) => relation.kind === 'prototype-uses-component' && relation.to.id === candidate.id,
  )
  for (const relation of prototypeRelations) {
    if (relation.from.id !== document.prototype?.id) {
      throw new Error(`Component relation "${relation.id}" references an unsupported prototype for candidate "${candidate.id}".`)
    }
  }
}

function normalizeCandidate(candidate: ComponentCandidate): ComponentCandidate {
  return {
    ...candidate,
    sourcePageIds: uniqueSorted(candidate.sourcePageIds),
    tokenRefs: uniqueSorted(candidate.tokenRefs),
    props: [...candidate.props].map((prop) => prop.type === 'enum'
      ? { ...prop, values: uniqueSorted(prop.values) }
      : prop,
    ).sort((left, right) => compareText(left.name, right.name)),
    variants: [...candidate.variants].map((variant) => ({ ...variant, values: uniqueSorted(variant.values) }))
      .sort((left, right) => compareText(left.name, right.name)),
    slots: [...candidate.slots].sort((left, right) => compareText(left.name, right.name)),
    ...(candidate.states ? { states: [...candidate.states].sort((left, right) => compareText(left.name, right.name)) } : {}),
    ...(candidate.stories ? { stories: [...candidate.stories].sort((left, right) => compareText(left.name, right.name)) } : {}),
    ...(candidate.responsive ? { responsive: [...candidate.responsive].sort((left, right) => compareText(left.breakpoint, right.breakpoint)) } : {}),
    ...(candidate.tokenBindings ? { tokenBindings: [...candidate.tokenBindings].sort((left, right) => compareText(`${left.property}:${left.tokenId}`, `${right.property}:${right.tokenId}`)) } : {}),
  }
}

function resolveTokenMappings(document: DesignDocument, candidates: readonly ComponentCandidate[]): readonly {
  readonly tokenId: string
  readonly cssVariable: string
  readonly value: string
  readonly kind: string
}[] {
  const tokens = new Map(document.tokens.map((token) => [token.id, token]))
  const mappings = uniqueSorted(candidates.flatMap((candidate) => candidate.tokenRefs)).map((tokenId) => {
    const token = tokens.get(tokenId)
    if (!token) throw new Error(`Missing Design IR token "${tokenId}".`)
    return tokenMapping(token)
  })
  const cssVariables = new Set<string>()
  for (const mapping of mappings) {
    if (cssVariables.has(mapping.cssVariable)) {
      throw new Error(`Component adapter token mapping collision at CSS variable "${mapping.cssVariable}".`)
    }
    cssVariables.add(mapping.cssVariable)
  }
  return mappings
}

function tokenMapping(token: DesignToken): { readonly tokenId: string; readonly cssVariable: string; readonly value: string; readonly kind: string } {
  return {
    tokenId: token.id,
    cssVariable: `--cutout-token-${toKebab(token.id.replace(/^token:/, ''))}`,
    value: token.value,
    kind: token.kind,
  }
}

async function file(
  path: ComponentCompilerFile['path'],
  content: string,
  sourceFingerprint: string,
): Promise<ComponentCompilerFile> {
  return { path, content, sha256: await sha256Text(content), sourceFingerprint }
}

function jsonFile(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

async function sha256Text(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function toKebab(value: string): string {
  return value.replace(/[^A-Za-z0-9]+/g, '-').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().replace(/^-+|-+$/g, '')
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareText)
}

function assertUnique(values: readonly string[], prefix: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${prefix}.`)
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && new Set(left).size === left.length && new Set(left).size === new Set(right).size
    && left.every((entry) => new Set(right).has(entry))
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
