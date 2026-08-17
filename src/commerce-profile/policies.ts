import { z } from 'zod'
import {
  commerceLocaleSchema,
  commerceMediaArtifactSchema,
  localizedDescriptionSchema,
  type CitedClaim,
  type CommerceLocale,
  type CommerceMediaArtifact,
  type LocalizedDescription,
  type ProductFacts,
  type ValidationFinding,
  type VisualOverlay,
} from './contracts'
import { validateCatalogSelection, type AttributeIndex, type CategoryIndex } from './catalog'

const mediaConstraintSchema = z.object({
  mediaTypes: z.array(z.string().min(1).max(120)).min(1).max(20),
  minimumWidth: z.number().int().positive(),
  minimumHeight: z.number().int().positive(),
  maximumBytes: z.number().int().positive(),
}).strict()

export const commercePolicyPackSchema = z.object({
  schema: z.literal('commerce.market-policy.v1'),
  id: z.string().min(1).max(240),
  version: z.string().min(1).max(120),
  channel: z.literal('aliexpress'),
  locale: commerceLocaleSchema,
  source: z.object({
    sourceId: z.string().min(1).max(240),
    revision: z.string().min(1).max(240),
    reviewedAt: z.string().date(),
  }).strict(),
  language: z.object({
    label: z.string().min(1).max(120),
    requiredScript: z.enum(['latin', 'hangul']),
    disallowedSpellings: z.array(z.string().min(1).max(120)).max(100),
  }).strict(),
  units: z.object({
    system: z.enum(['imperial', 'metric']),
    allowed: z.array(z.string().min(1).max(20)).min(1).max(50),
    sizeLabels: z.array(z.string().min(1).max(30)).min(1).max(100),
  }).strict(),
  prohibitedClaims: z.array(z.string().min(1).max(240)).min(1).max(200),
  sensitiveVisualTerms: z.array(z.string().min(1).max(240)).min(1).max(200),
  constraints: z.object({
    descriptionMaximumCharacters: z.number().int().positive(),
    documentMediaTypes: z.array(z.string().min(1).max(120)).min(1).max(20),
    documentMaximumBytes: z.number().int().positive(),
    mainImage: mediaConstraintSchema,
    detailImage: mediaConstraintSchema,
    video: mediaConstraintSchema.extend({ playableRequired: z.boolean() }),
    strategyMediaTypes: z.array(z.string().min(1).max(120)).min(1).max(20),
    strategyMaximumBytes: z.number().int().positive(),
  }).strict(),
}).strict()
export type CommercePolicyPack = z.infer<typeof commercePolicyPackSchema>

export const compiledGenerationPolicySchema = z.object({
  schema: z.literal('commerce.generation-constraints.v1'),
  policyId: z.string().min(1).max(240),
  policyVersion: z.string().min(1).max(120),
  locale: commerceLocaleSchema,
  constraints: z.array(z.string().min(1).max(2_000)).min(1).max(500),
}).strict()
export type CompiledGenerationPolicy = z.infer<typeof compiledGenerationPolicySchema>

const COMMON_SIZE_LABELS = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'] as const

const packs = {
  'en-US': {
    schema: 'commerce.market-policy.v1',
    id: 'policy:aliexpress:en-US',
    version: '2026.08.12',
    channel: 'aliexpress',
    locale: 'en-US',
    source: {
      sourceId: 'policy-source:aliexpress-commerce-review',
      revision: '2026-08-12',
      reviewedAt: '2026-08-12',
    },
    language: {
      label: 'American English',
      requiredScript: 'latin',
      disallowedSpellings: ['colour', 'favourite', 'centre', 'metre'],
    },
    units: {
      system: 'imperial',
      allowed: ['in', 'inch', 'inches', 'oz', 'lb', 'lbs'],
      sizeLabels: [...COMMON_SIZE_LABELS],
    },
    prohibitedClaims: ['guaranteed results', '100% safe', 'cures', 'officially certified'],
    sensitiveVisualTerms: ['medical before and after', 'weapon', 'hate symbol', 'explicit nudity'],
    constraints: {
      descriptionMaximumCharacters: 20_000,
      documentMediaTypes: ['text/plain', 'text/markdown'],
      documentMaximumBytes: 2 * 1024 * 1024,
      mainImage: {
        mediaTypes: ['image/png', 'image/jpeg'],
        minimumWidth: 800,
        minimumHeight: 800,
        maximumBytes: 5 * 1024 * 1024,
      },
      detailImage: {
        mediaTypes: ['image/png', 'image/jpeg'],
        minimumWidth: 261,
        minimumHeight: 261,
        maximumBytes: 5 * 1024 * 1024,
      },
      video: {
        mediaTypes: ['video/mp4', 'video/quicktime'],
        minimumWidth: 261,
        minimumHeight: 261,
        maximumBytes: 200 * 1024 * 1024,
        playableRequired: true,
      },
      strategyMediaTypes: ['text/plain', 'text/markdown'],
      strategyMaximumBytes: 2 * 1024 * 1024,
    },
  },
  'ko-KR': {
    schema: 'commerce.market-policy.v1',
    id: 'policy:aliexpress:ko-KR',
    version: '2026.08.12',
    channel: 'aliexpress',
    locale: 'ko-KR',
    source: {
      sourceId: 'policy-source:aliexpress-commerce-review',
      revision: '2026-08-12',
      reviewedAt: '2026-08-12',
    },
    language: {
      label: 'Korean',
      requiredScript: 'hangul',
      disallowedSpellings: ['보장된 결과', '완전 무해'],
    },
    units: {
      system: 'metric',
      allowed: ['mm', 'cm', 'm', 'g', 'kg'],
      sizeLabels: [...COMMON_SIZE_LABELS],
    },
    prohibitedClaims: ['100% 안전', '치료', '공식 인증됨', '효과 보장'],
    sensitiveVisualTerms: ['의학적 전후 사진', '무기', '혐오 상징', '노골적인 노출'],
    constraints: {
      descriptionMaximumCharacters: 20_000,
      documentMediaTypes: ['text/plain', 'text/markdown'],
      documentMaximumBytes: 2 * 1024 * 1024,
      mainImage: {
        mediaTypes: ['image/png', 'image/jpeg'],
        minimumWidth: 800,
        minimumHeight: 800,
        maximumBytes: 5 * 1024 * 1024,
      },
      detailImage: {
        mediaTypes: ['image/png', 'image/jpeg'],
        minimumWidth: 261,
        minimumHeight: 261,
        maximumBytes: 5 * 1024 * 1024,
      },
      video: {
        mediaTypes: ['video/mp4', 'video/quicktime'],
        minimumWidth: 261,
        minimumHeight: 261,
        maximumBytes: 200 * 1024 * 1024,
        playableRequired: true,
      },
      strategyMediaTypes: ['text/plain', 'text/markdown'],
      strategyMaximumBytes: 2 * 1024 * 1024,
    },
  },
  'pt-BR': {
    schema: 'commerce.market-policy.v1',
    id: 'policy:aliexpress:pt-BR',
    version: '2026.08.12',
    channel: 'aliexpress',
    locale: 'pt-BR',
    source: {
      sourceId: 'policy-source:aliexpress-commerce-review',
      revision: '2026-08-12',
      reviewedAt: '2026-08-12',
    },
    language: {
      label: 'Brazilian Portuguese',
      requiredScript: 'latin',
      disallowedSpellings: ['telemóvel', 'ecrã', 'facto'],
    },
    units: {
      system: 'metric',
      allowed: ['mm', 'cm', 'm', 'g', 'kg'],
      sizeLabels: [...COMMON_SIZE_LABELS],
    },
    prohibitedClaims: ['100% seguro', 'cura', 'oficialmente certificado', 'resultado garantido'],
    sensitiveVisualTerms: ['antes e depois médico', 'arma', 'símbolo de ódio', 'nudez explícita'],
    constraints: {
      descriptionMaximumCharacters: 20_000,
      documentMediaTypes: ['text/plain', 'text/markdown'],
      documentMaximumBytes: 2 * 1024 * 1024,
      mainImage: {
        mediaTypes: ['image/png', 'image/jpeg'],
        minimumWidth: 800,
        minimumHeight: 800,
        maximumBytes: 5 * 1024 * 1024,
      },
      detailImage: {
        mediaTypes: ['image/png', 'image/jpeg'],
        minimumWidth: 261,
        minimumHeight: 261,
        maximumBytes: 5 * 1024 * 1024,
      },
      video: {
        mediaTypes: ['video/mp4', 'video/quicktime'],
        minimumWidth: 261,
        minimumHeight: 261,
        maximumBytes: 200 * 1024 * 1024,
        playableRequired: true,
      },
      strategyMediaTypes: ['text/plain', 'text/markdown'],
      strategyMaximumBytes: 2 * 1024 * 1024,
    },
  },
} satisfies Record<CommerceLocale, CommercePolicyPack>

export const ALIEXPRESS_POLICY_PACKS: Readonly<Record<CommerceLocale, CommercePolicyPack>> = Object.freeze({
  'en-US': commercePolicyPackSchema.parse(packs['en-US']),
  'ko-KR': commercePolicyPackSchema.parse(packs['ko-KR']),
  'pt-BR': commercePolicyPackSchema.parse(packs['pt-BR']),
})

export function compileGenerationPolicy(policy: CommercePolicyPack): CompiledGenerationPolicy {
  const parsed = commercePolicyPackSchema.parse(policy)
  return compiledGenerationPolicySchema.parse({
    schema: 'commerce.generation-constraints.v1',
    policyId: parsed.id,
    policyVersion: parsed.version,
    locale: parsed.locale,
    constraints: [
      `Write ${parsed.language.label} for locale ${parsed.locale}.`,
      `Use ${parsed.units.system} units only: ${parsed.units.allowed.join(', ')}.`,
      `Use only these apparel size labels when a size label is evidenced: ${parsed.units.sizeLabels.join(', ')}.`,
      `Every factual claim and every visual overlay must cite one or more supplied non-unknown fact ids.`,
      `Do not state unknown composition, dimensions, certification, or performance as fact.`,
      `Do not use these prohibited claims: ${parsed.prohibitedClaims.join('; ')}.`,
      `Do not depict or request these sensitive visual concepts: ${parsed.sensitiveVisualTerms.join('; ')}.`,
      `Documents must use ${parsed.constraints.documentMediaTypes.join(' or ')} and be no more than ${parsed.constraints.documentMaximumBytes} bytes.`,
      `Main image must be at least ${parsed.constraints.mainImage.minimumWidth}x${parsed.constraints.mainImage.minimumHeight}.`,
      `Detail images must be at least ${parsed.constraints.detailImage.minimumWidth}x${parsed.constraints.detailImage.minimumHeight} and no more than ${parsed.constraints.detailImage.maximumBytes} bytes.`,
      `Video must be playable, use ${parsed.constraints.video.mediaTypes.join(' or ')}, and be no more than ${parsed.constraints.video.maximumBytes} bytes.`,
    ],
  })
}

function finding(
  outcomeNodeId: string,
  code: string,
  message: string,
  factIds: readonly string[] = [],
  artifactId?: string,
): ValidationFinding {
  return {
    code,
    message,
    outcomeNodeId,
    ...(artifactId ? { artifactId } : {}),
    severity: 'blocking',
    factIds: [...factIds],
  }
}

const EVIDENCE_RULES = [
  { field: 'composition', pattern: /\b(?:composition|material|fabric|cotton|polyester|silk|wool)\b|소재|재질|원단|composição|material/i },
  { field: 'dimensions', pattern: /\b(?:dimension|dimensions|measure|measurement|measurements|inch|inches|cm|mm)\b|치수|dimens(?:ão|ões)/i },
  { field: 'certification', pattern: /\b(?:certified|certification|approved|compliant)\b|인증|승인|certificad[oa]|aprova[çc][aã]o/i },
  { field: 'performance', pattern: /\b(?:waterproof|durable|performance|protects|resistant)\b|방수|내구|성능|보호|impermeável|durável|resistente|desempenho/i },
] as const

function allClaims(description: LocalizedDescription): readonly CitedClaim[] {
  return [
    description.title,
    ...description.summary,
    ...description.skuBreakdown,
    ...description.attributes,
    description.sourcePlatform,
    description.productIdentity,
    ...description.mediaDescriptions,
  ]
}

function citedTextFindings(input: {
  readonly outcomeNodeId: string
  readonly claim: CitedClaim | VisualOverlay
  readonly facts: ProductFacts
  readonly policy: CommercePolicyPack
  readonly artifactId?: string
}): readonly ValidationFinding[] {
  const result: ValidationFinding[] = []
  const factById = new Map(input.facts.facts.map((fact) => [fact.id, fact]))
  const citedFacts = input.claim.citations.flatMap(({ factId }) => {
    const fact = factById.get(factId)
    if (!fact) {
      result.push(finding(input.outcomeNodeId, 'citation-unresolved', `Citation does not resolve: ${factId}`, [factId], input.artifactId))
      return []
    }
    if (fact.confidence === 'unknown' || fact.value.type === 'unknown') {
      result.push(finding(input.outcomeNodeId, 'citation-unknown', `Citation refers to unknown evidence: ${factId}`, [factId], input.artifactId))
      return []
    }
    return [fact]
  })
  for (const rule of EVIDENCE_RULES) {
    if (rule.pattern.test(input.claim.text)
      && !citedFacts.some((fact) => {
        const field = fact.field.toLowerCase()
        return rule.field === 'dimensions'
          ? field.includes('measurement') || field.includes('attribute.size')
          : field.includes(rule.field)
      })) {
      result.push(finding(
        input.outcomeNodeId,
        `claim-${rule.field}-unsupported`,
        `Claim requires cited ${rule.field} evidence.`,
        input.claim.citations.map((citation) => citation.factId),
        input.artifactId,
      ))
    }
  }
  const lower = input.claim.text.toLocaleLowerCase(input.policy.locale)
  for (const phrase of input.policy.prohibitedClaims) {
    if (lower.includes(phrase.toLocaleLowerCase(input.policy.locale))) {
      result.push(finding(input.outcomeNodeId, 'prohibited-claim', `Prohibited claim found: ${phrase}`, [], input.artifactId))
    }
  }
  return result
}

function documentText(description: LocalizedDescription): string {
  return allClaims(description).map((claim) => claim.text).join('\n')
}

const UNIT_TOKEN_PATTERN = /(?:^|\s)(-?\d+(?:[.,]\d+)?)\s*(mm|cm|m|in|inch|inches|g|kg|oz|lb|lbs)\b/gi

function normalizedAttributeField(field: string): string {
  const lower = field.toLowerCase()
  const marker = ['.attribute.', '.composition.', '.certification.', '.performance.']
    .find((candidate) => lower.includes(candidate))
  return marker ? field.slice(lower.indexOf(marker) + marker.length).toLocaleLowerCase() : ''
}

function measurementToBase(value: number, unit: string): { dimension: 'length' | 'mass', value: number } | undefined {
  const normalized = unit.toLowerCase()
  const lengthScale: Readonly<Record<string, number>> = {
    mm: 1, cm: 10, m: 1_000, in: 25.4, inch: 25.4, inches: 25.4,
  }
  const massScale: Readonly<Record<string, number>> = {
    g: 1, kg: 1_000, oz: 28.349523125, lb: 453.59237, lbs: 453.59237,
  }
  if (lengthScale[normalized] !== undefined) return { dimension: 'length', value: value * lengthScale[normalized] }
  if (massScale[normalized] !== undefined) return { dimension: 'mass', value: value * massScale[normalized] }
  return undefined
}

function escapedRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function factConsistencyFindings(input: {
  readonly outcomeNodeId: string
  readonly description: LocalizedDescription
  readonly facts: ProductFacts
  readonly policy: CommercePolicyPack
  readonly artifactId?: string
}): readonly ValidationFinding[] {
  const result: ValidationFinding[] = []
  const categoryFact = input.facts.facts.find((fact) => fact.id === input.facts.categoryFactId)
  if (categoryFact?.field === 'category.leaf-id'
    && categoryFact.value.type === 'text'
    && categoryFact.value.value !== input.description.categoryId) {
    result.push(finding(input.outcomeNodeId, 'category-fact-mismatch', 'Catalog category conflicts with normalized product evidence.', [categoryFact.id], input.artifactId))
  }
  const factAttributes = new Map(input.facts.facts.flatMap((fact) => {
    const key = normalizedAttributeField(fact.field)
    return key && fact.value.type === 'text'
      ? [[key, { id: fact.id, value: fact.value.value }] as const]
      : []
  }))
  for (const [key, value] of Object.entries(input.description.catalogAttributes)) {
    const fact = factAttributes.get(key.toLocaleLowerCase())
    if (!fact) {
      result.push(finding(input.outcomeNodeId, 'attribute-fact-unresolved', `Catalog attribute ${key} has no normalized product evidence.`, [], input.artifactId))
    } else if (fact.value !== value) {
      result.push(finding(input.outcomeNodeId, 'attribute-fact-mismatch', `Catalog attribute ${key} conflicts with normalized product evidence.`, [fact.id], input.artifactId))
    }
  }
  const measurementFacts = input.facts.facts.flatMap((fact) => {
    if (fact.value.type !== 'measurement') return []
    const base = measurementToBase(fact.value.value, fact.value.unit)
    return base ? [{ id: fact.id, ...base }] : []
  })
  for (const match of documentText(input.description).matchAll(UNIT_TOKEN_PATTERN)) {
    const value = Number(match[1]!.replace(',', '.'))
    const converted = measurementToBase(value, match[2]!)
    if (!converted) continue
    const compatible = measurementFacts.filter((fact) => fact.dimension === converted.dimension)
    if (compatible.length === 0) {
      result.push(finding(
        input.outcomeNodeId,
        'measurement-fact-unresolved',
        `Localized measurement has no normalized ${converted.dimension} evidence.`,
        [],
        input.artifactId,
      ))
    } else if (!compatible.some((fact) => {
      const tolerance = Math.max(0.51, Math.abs(fact.value) * 0.02)
      return Math.abs(fact.value - converted.value) <= tolerance
    })) {
      result.push(finding(
        input.outcomeNodeId,
        'measurement-fact-mismatch',
        `Localized measurement conflicts with normalized ${converted.dimension} evidence.`,
        compatible.map((fact) => fact.id),
        input.artifactId,
      ))
    }
  }
  const sizeSelection = Object.entries(input.description.catalogAttributes)
    .find(([key]) => key.toLocaleLowerCase() === 'size')?.[1]
  if (sizeSelection && input.policy.units.sizeLabels.includes(sizeSelection)) {
    const sizePattern = new RegExp(`(?:^|[^A-Za-z0-9])${escapedRegularExpression(sizeSelection)}(?:$|[^A-Za-z0-9])`, 'i')
    if (!sizePattern.test(documentText(input.description))) {
      result.push(finding(input.outcomeNodeId, 'size-label-fact-mismatch', 'Localized copy omits or conflicts with the catalog-backed size label.', [], input.artifactId))
    }
  }
  return result
}

export function validateLocalizedDescription(input: {
  readonly outcomeNodeId: string
  readonly description: LocalizedDescription
  readonly facts: ProductFacts
  readonly policy: CommercePolicyPack
  readonly categoryIndex: CategoryIndex
  readonly attributeIndex: AttributeIndex
  readonly artifactId?: string
  readonly mediaType?: string
  readonly byteLength?: number
}): readonly ValidationFinding[] {
  const description = localizedDescriptionSchema.parse(input.description)
  const policy = commercePolicyPackSchema.parse(input.policy)
  const result = allClaims(description).flatMap((claim) => citedTextFindings({
    outcomeNodeId: input.outcomeNodeId,
    claim,
    facts: input.facts,
    policy,
    ...(input.artifactId ? { artifactId: input.artifactId } : {}),
  }))
  result.push(...factConsistencyFindings({
    outcomeNodeId: input.outcomeNodeId,
    description,
    facts: input.facts,
    policy,
    ...(input.artifactId ? { artifactId: input.artifactId } : {}),
  }))
  if (description.locale !== policy.locale) {
    result.push(finding(input.outcomeNodeId, 'locale-mismatch', `Expected ${policy.locale}, received ${description.locale}.`, [], input.artifactId))
  }
  const combined = documentText(description)
  if (combined.length > policy.constraints.descriptionMaximumCharacters) {
    result.push(finding(input.outcomeNodeId, 'description-too-long', 'Localized description exceeds the policy character limit.', [], input.artifactId))
  }
  if (input.mediaType && !policy.constraints.documentMediaTypes.includes(input.mediaType)) {
    result.push(finding(input.outcomeNodeId, 'document-media-type-invalid', `Document media type is not permitted: ${input.mediaType}`, [], input.artifactId))
  }
  if (input.byteLength !== undefined && input.byteLength > policy.constraints.documentMaximumBytes) {
    result.push(finding(input.outcomeNodeId, 'document-size-invalid', `Document exceeds ${policy.constraints.documentMaximumBytes} bytes.`, [], input.artifactId))
  }
  if (policy.language.requiredScript === 'hangul' && !/[\uAC00-\uD7AF]/u.test(combined)) {
    result.push(finding(input.outcomeNodeId, 'language-script-mismatch', 'Korean output must contain Hangul.', [], input.artifactId))
  }
  if (policy.language.requiredScript === 'latin' && !/[A-Za-zÀ-ÖØ-öø-ÿ]/u.test(combined)) {
    result.push(finding(input.outcomeNodeId, 'language-script-mismatch', `${policy.language.label} output must contain Latin text.`, [], input.artifactId))
  }
  const lower = combined.toLocaleLowerCase(policy.locale)
  for (const spelling of policy.language.disallowedSpellings) {
    if (lower.includes(spelling.toLocaleLowerCase(policy.locale))) {
      result.push(finding(input.outcomeNodeId, 'locale-spelling', `Disallowed ${policy.language.label} spelling: ${spelling}`, [], input.artifactId))
    }
  }
  for (const match of combined.matchAll(UNIT_TOKEN_PATTERN)) {
    const unit = match[2]!.toLowerCase()
    if (!policy.units.allowed.includes(unit)) {
      result.push(finding(input.outcomeNodeId, 'unit-not-localized', `Unit is not permitted for ${policy.locale}: ${unit}`, [], input.artifactId))
    }
  }
  try {
    validateCatalogSelection({
      categoryId: description.categoryId,
      attributes: description.catalogAttributes,
      categoryIndex: input.categoryIndex,
      attributeIndex: input.attributeIndex,
    })
  } catch (error) {
    result.push(finding(
      input.outcomeNodeId,
      'catalog-selection-invalid',
      error instanceof Error ? error.message : 'Catalog selection is invalid.',
      [],
      input.artifactId,
    ))
  }
  return result
}

export function validateCommerceMedia(input: {
  readonly outcomeNodeId: string
  readonly artifactId: string
  readonly artifact: CommerceMediaArtifact
  readonly facts: ProductFacts
  readonly policy: CommercePolicyPack
  readonly expectedRole: string
  readonly expectedMediaKind: CommerceMediaArtifact['mediaKind']
  readonly identityLockId: string
  readonly creativeDirectionId: string
}): readonly ValidationFinding[] {
  const artifact = commerceMediaArtifactSchema.parse(input.artifact)
  const policy = commercePolicyPackSchema.parse(input.policy)
  const result = artifact.overlays.flatMap((claim) => citedTextFindings({
    outcomeNodeId: input.outcomeNodeId,
    claim,
    facts: input.facts,
    policy,
    artifactId: input.artifactId,
  }))
  if (artifact.role !== input.expectedRole) {
    result.push(finding(input.outcomeNodeId, 'semantic-role-mismatch', `Expected role ${input.expectedRole}.`, [], input.artifactId))
  }
  if (artifact.mediaKind !== input.expectedMediaKind) {
    result.push(finding(input.outcomeNodeId, 'media-kind-mismatch', `Expected ${input.expectedMediaKind} media.`, [], input.artifactId))
  }
  if (artifact.identityLockId !== input.identityLockId) {
    result.push(finding(input.outcomeNodeId, 'identity-lock-mismatch', 'Artifact does not preserve the shared product identity lock.', [], input.artifactId))
  }
  if (artifact.creativeDirectionId !== input.creativeDirectionId) {
    result.push(finding(input.outcomeNodeId, 'creative-direction-mismatch', 'Artifact does not preserve the shared creative direction.', [], input.artifactId))
  }
  const constraints = artifact.mediaKind === 'video'
    ? policy.constraints.video
    : artifact.role === 'main-image'
      ? policy.constraints.mainImage
      : policy.constraints.detailImage
  if (!constraints.mediaTypes.includes(artifact.mediaType)) {
    result.push(finding(input.outcomeNodeId, 'media-type-invalid', `Media type is not permitted: ${artifact.mediaType}`, [], input.artifactId))
  }
  if (artifact.width < constraints.minimumWidth || artifact.height < constraints.minimumHeight) {
    result.push(finding(input.outcomeNodeId, 'media-dimensions-invalid', `Media dimensions are below ${constraints.minimumWidth}x${constraints.minimumHeight}.`, [], input.artifactId))
  }
  if (artifact.byteLength > constraints.maximumBytes) {
    result.push(finding(input.outcomeNodeId, 'media-size-invalid', `Media exceeds ${constraints.maximumBytes} bytes.`, [], input.artifactId))
  }
  if (artifact.mediaKind === 'video' && policy.constraints.video.playableRequired && artifact.playable !== true) {
    result.push(finding(input.outcomeNodeId, 'video-not-playable', 'Video must be playable.', [], input.artifactId))
  }
  const overlayText = [
    ...artifact.overlays.map((overlay) => overlay.text),
    ...artifact.visualReviewLabels,
  ].join('\n').toLocaleLowerCase(policy.locale)
  for (const term of policy.sensitiveVisualTerms) {
    if (overlayText.includes(term.toLocaleLowerCase(policy.locale))) {
      result.push(finding(input.outcomeNodeId, 'sensitive-visual', `Sensitive visual term found: ${term}`, [], input.artifactId))
    }
  }
  return result
}
