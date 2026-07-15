import { z } from 'zod'
import { brandKitDefinitionSchema, compileBrandKit, type BrandKitDefinition } from '@/brand-kit'
import { componentCandidateSchema, compileComponentCandidates, type ComponentCandidate } from '@/components-compiler'
import { type DesignDocument } from '@/design-ir'
import { starterAssetBindingSchema, starterFrameworkSchema } from '@/starter-compiler'
import { err, ok, type Result } from '@/services/types'
import type { RevisionGuard } from './operations'

export const starterConfigSchema = z.object({
  framework: starterFrameworkSchema,
  assetBindings: z.array(starterAssetBindingSchema).max(10_000).default([]),
  existingPaths: z.array(z.string().min(1).max(240)).max(10_000).default([]),
}).strict()

export type StarterConfig = z.infer<typeof starterConfigSchema>

export interface DesignOsAuthoringState {
  readonly version: 'design-os-authoring.v1'
  readonly base: RevisionGuard
  readonly brand?: BrandKitDefinition
  readonly componentCandidates?: readonly ComponentCandidate[]
  readonly starterConfigs?: readonly StarterConfig[]
}

export type AuthoringKind = 'brand' | 'components' | 'starter'

export interface AuthoringPreview {
  readonly id: string
  readonly kind: AuthoringKind
  readonly base: RevisionGuard
  readonly value: BrandKitDefinition | readonly ComponentCandidate[] | StarterConfig
  readonly summary: string
}

export async function prepareAuthoring(
  document: DesignDocument,
  kind: AuthoringKind,
  input: unknown,
): Promise<Result<AuthoringPreview>> {
  const parsed = parse(kind, input)
  if (!parsed.success) return err(parsed.error.issues.map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`).join('; '))
  const value = parsed.data
  try {
    if (kind === 'brand') await compileBrandKit({ document, brand: value as BrandKitDefinition })
    if (kind === 'components') await compileComponentCandidates({ document, candidates: value as ComponentCandidate[] })
    if (kind === 'starter') validateStarterBindings(document, value as StarterConfig)
  } catch (cause) {
    return err(cause instanceof Error ? cause.message : String(cause))
  }
  const base = guard(document)
  return ok({
    id: `${document.meta.id}|${document.revision.id}|${kind}|${stableJson(value)}`,
    kind,
    base,
    value,
    summary: summary(kind, value),
  })
}

function validateStarterBindings(document: DesignDocument, config: StarterConfig): void {
  for (const binding of config.assetBindings) {
    const candidateExists = document.components.some((candidate) => candidate.id === binding.candidateId)
    if (!candidateExists) throw new Error(`Starter asset binding references unknown component ${binding.candidateId}.`)
    const material = document.materials.find((entry) => entry.id === binding.materialId)
    if (!material) throw new Error(`Starter asset binding references unknown material ${binding.materialId}.`)
    if (!material.revisions.some((revision) => revision.id === binding.revisionId)) {
      throw new Error(`Starter asset binding references unknown material revision ${binding.revisionId}.`)
    }
  }
}

export function applyAuthoring(
  document: DesignDocument,
  current: DesignOsAuthoringState | undefined,
  preview: AuthoringPreview,
): Result<DesignOsAuthoringState> {
  if (preview.base.documentId !== document.meta.id) return err('Authoring preview belongs to another DesignDocument.')
  if (preview.base.revisionId !== document.revision.id || preview.base.revisionNumber !== document.revision.number) {
    return err(`Revision conflict: preview targets ${preview.base.revisionId} (#${preview.base.revisionNumber}), but current document is ${document.revision.id} (#${document.revision.number}).`)
  }
  const next: DesignOsAuthoringState = current && sameGuard(current.base, preview.base)
    ? current
    : { version: 'design-os-authoring.v1', base: preview.base }
  if (preview.kind === 'brand') return ok({ ...next, brand: preview.value as BrandKitDefinition })
  if (preview.kind === 'components') return ok({ ...next, componentCandidates: preview.value as readonly ComponentCandidate[] })
  const config = preview.value as StarterConfig
  return ok({
    ...next,
    starterConfigs: [...(next.starterConfigs ?? []).filter((item) => item.framework !== config.framework), config],
  })
}

export function authoringForDocument(
  document: DesignDocument,
  state: DesignOsAuthoringState | null | undefined,
): DesignOsAuthoringState | undefined {
  return state && sameGuard(state.base, guard(document)) ? state : undefined
}

function parse(kind: AuthoringKind, input: unknown) {
  if (kind === 'brand') return brandKitDefinitionSchema.safeParse(input)
  if (kind === 'components') return z.array(componentCandidateSchema).min(1).safeParse(input)
  return starterConfigSchema.safeParse(input)
}

function guard(document: DesignDocument): RevisionGuard {
  return { documentId: document.meta.id, revisionId: document.revision.id, revisionNumber: document.revision.number }
}

function sameGuard(left: RevisionGuard, right: RevisionGuard): boolean {
  return left.documentId === right.documentId && left.revisionId === right.revisionId && left.revisionNumber === right.revisionNumber
}

function summary(kind: AuthoringKind, value: AuthoringPreview['value']): string {
  if (kind === 'brand') {
    const brand = value as BrandKitDefinition
    return `${brand.logo.variants.length} logo variants, ${brand.colors.length} colors, ${brand.type.length} typefaces; every claim includes an evidence reference.`
  }
  if (kind === 'components') {
    const candidates = value as readonly ComponentCandidate[]
    return `${candidates.length} explicit candidates; ${candidates.filter((candidate) => candidate.status === 'ready').length} marked ready.`
  }
  const starter = value as StarterConfig
  return `${starter.framework}; ${starter.assetBindings.length} explicit material bindings; collision policy remains fail.`
}

function stableJson(value: unknown): string {
  return JSON.stringify(value)
}
