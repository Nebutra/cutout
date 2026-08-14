import { z } from 'zod'
import {
  capabilityCatalogSchema,
  composeOutcomeFragments,
  evidenceGraphSchema,
  outcomeGraphSchema,
  registerDomainSchema,
  type CapabilityCatalog,
  type EvidenceGraph,
  type GraphFragment,
  type OutcomeGraph,
  type OutcomeNode,
  type SchemaRegistry,
} from '@/design-os-kernel'
import {
  commerceLocaleSchema,
  commerceMediaArtifactSchema,
  localizedDescriptionSchema,
  productFactSchema,
  strategyDocumentSchema,
  type CommerceLocale,
  type ProductFacts,
} from './contracts'
import { commercePolicyPackSchema, ALIEXPRESS_POLICY_PACKS } from './policies'

export const COMMERCE_PROFILE_ID = 'profile:commerce-materials' as const
export const COMMERCE_PROFILE_VERSION = '1.1.0' as const
export const COMMERCE_RECIPE_ID = 'commerce.material-recipe' as const
export const COMMERCE_RECIPE_VERSION = 2 as const
export const COMMERCE_TARGET_ID = 'target:commerce-material' as const
export const COMMERCE_IDENTITY_LOCK_ID = 'lock:commerce-product-identity' as const
export const COMMERCE_CREATIVE_DIRECTION_ID = 'lock:commerce-creative-direction' as const

export const COMMERCE_CAPABILITY_IDS = Object.freeze({
  localizedCopy: 'capability:commerce-localized-copy',
  image: 'capability:commerce-image',
  video: 'capability:commerce-video',
  strategy: 'capability:commerce-strategy',
})

export const COMMERCE_CONSTRAINT_IDS = Object.freeze([
  'constraint:commerce-fact-citations',
  'constraint:commerce-catalog-closure',
  'constraint:commerce-policy-validation',
  'constraint:commerce-product-identity',
  'constraint:commerce-creative-direction',
  'constraint:commerce-output-compliance',
])

export const commerceSemanticRoleSchema = z.enum([
  'localized-description:en-US',
  'localized-description:ko-KR',
  'localized-description:pt-BR',
  'main-image',
  'detail-image:1',
  'detail-image:2',
  'detail-image:3',
  'detail-image:4',
  'detail-image:5',
  'product-video',
  'strategy-document',
])
export type CommerceSemanticRole = z.infer<typeof commerceSemanticRoleSchema>

export const COMMERCE_SEMANTIC_ROLES: readonly CommerceSemanticRole[] = Object.freeze([
  'localized-description:en-US',
  'localized-description:ko-KR',
  'localized-description:pt-BR',
  'main-image',
  'detail-image:1',
  'detail-image:2',
  'detail-image:3',
  'detail-image:4',
  'detail-image:5',
  'product-video',
  'strategy-document',
])

const sharedOutcomeFields = {
  semanticRole: commerceSemanticRoleSchema,
  channel: z.literal('aliexpress'),
  marketPolicyId: z.string().min(1).max(240),
  identityLockId: z.literal(COMMERCE_IDENTITY_LOCK_ID),
  creativeDirectionId: z.literal(COMMERCE_CREATIVE_DIRECTION_ID),
  requiredFactIds: z.array(z.string().min(1).max(240)).max(20_000),
}

export const localizedDescriptionOutcomePayloadSchema = z.object({
  kind: z.literal('localized-description'),
  ...sharedOutcomeFields,
  semanticRole: z.enum([
    'localized-description:en-US',
    'localized-description:ko-KR',
    'localized-description:pt-BR',
  ]),
  locale: commerceLocaleSchema,
}).strict()

export const mediaOutcomePayloadSchema = z.object({
  kind: z.literal('media'),
  ...sharedOutcomeFields,
  semanticRole: z.enum([
    'main-image',
    'detail-image:1',
    'detail-image:2',
    'detail-image:3',
    'detail-image:4',
    'detail-image:5',
    'product-video',
  ]),
  mediaKind: z.enum(['image', 'video']),
}).strict()

export const strategyOutcomePayloadSchema = z.object({
  kind: z.literal('strategy'),
  ...sharedOutcomeFields,
  semanticRole: z.literal('strategy-document'),
  evidenceSections: z.tuple([
    z.literal('facts'),
    z.literal('plan'),
    z.literal('routes'),
    z.literal('validations'),
    z.literal('receipts'),
    z.literal('repairs'),
  ]),
}).strict()

export const commerceOutcomePayloadSchema = z.discriminatedUnion('kind', [
  localizedDescriptionOutcomePayloadSchema,
  mediaOutcomePayloadSchema,
  strategyOutcomePayloadSchema,
])
export type CommerceOutcomePayload = z.infer<typeof commerceOutcomePayloadSchema>

export const COMMERCE_PROFILE = Object.freeze({
  id: COMMERCE_PROFILE_ID,
  version: COMMERCE_PROFILE_VERSION,
  recipeId: COMMERCE_RECIPE_ID,
  semanticRoles: COMMERCE_SEMANTIC_ROLES,
  capabilityIds: Object.values(COMMERCE_CAPABILITY_IDS),
  constraintIds: COMMERCE_CONSTRAINT_IDS,
  policyPackIds: Object.values(ALIEXPRESS_POLICY_PACKS).map((policy) => policy.id),
})

function factRevision(factId: string): string {
  return `${factId}:revision:1`
}

function factDependencyIds(facts: ProductFacts): readonly string[] {
  return facts.facts
    .map((fact) => fact.id)
    .sort()
}

export function createCommerceEvidenceGraph(input: {
  readonly facts: ProductFacts
  readonly id?: string
  readonly revision?: string
}): EvidenceGraph {
  return evidenceGraphSchema.parse({
    protocol: 'design-os.protocol.v1',
    kind: 'evidence-graph',
    schema: { id: 'design-os.evidence-graph', version: 1 },
    identity: {
      id: input.id ?? 'evidence:commerce-product',
      revision: input.revision ?? 'evidence:commerce-product:revision:1',
    },
    provenance: [],
    body: {
      nodes: input.facts.facts.map((fact) => ({
        id: fact.id,
        revision: factRevision(fact.id),
        schema: { id: 'commerce.product-fact', version: 1 },
        value: fact,
        provenance: [{
          sourceId: 'source:commerce-product-record',
          revision: 'source:revision:1',
          relation: 'normalized-from',
        }],
      })),
      edges: [],
    },
  })
}

function evidenceDependencies(facts: ProductFacts): OutcomeNode['dependencies'] {
  return factDependencyIds(facts).map((id) => ({
    kind: 'evidence' as const,
    id,
    revision: factRevision(id),
  }))
}

function sharedDependencies(facts: ProductFacts, policyId: string): OutcomeNode['dependencies'] {
  return [
    ...evidenceDependencies(facts),
    { kind: 'policy', id: policyId, revision: '2026.08.12' },
    { kind: 'lock', id: COMMERCE_IDENTITY_LOCK_ID, revision: 'lock:revision:1' },
    { kind: 'lock', id: COMMERCE_CREATIVE_DIRECTION_ID, revision: 'lock:revision:1' },
  ]
}

function outcomeNode(input: {
  readonly role: CommerceSemanticRole
  readonly payload: CommerceOutcomePayload
  readonly schemaId: string
  readonly dependencies: OutcomeNode['dependencies']
}): OutcomeNode {
  return {
    id: `outcome:commerce:${input.role}`,
    revision: `outcome:commerce:${input.role}:revision:1`,
    schema: { id: input.schemaId, version: 1 },
    recipe: { id: COMMERCE_RECIPE_ID, version: COMMERCE_RECIPE_VERSION },
    payload: commerceOutcomePayloadSchema.parse(input.payload),
    dependencies: input.dependencies,
    state: 'proposed',
    provenance: [],
  }
}

export function createCommerceOutcomeFragments(facts: ProductFacts): readonly GraphFragment[] {
  const requiredFactIds = factDependencyIds(facts)
  const copyNodes = (['en-US', 'ko-KR', 'pt-BR'] as const).map((locale) => {
    const role = `localized-description:${locale}` as const
    return outcomeNode({
      role,
      schemaId: 'commerce.localized-description',
      dependencies: sharedDependencies(facts, ALIEXPRESS_POLICY_PACKS[locale].id),
      payload: {
        kind: 'localized-description',
        semanticRole: role,
        channel: 'aliexpress',
        marketPolicyId: ALIEXPRESS_POLICY_PACKS[locale].id,
        identityLockId: COMMERCE_IDENTITY_LOCK_ID,
        creativeDirectionId: COMMERCE_CREATIVE_DIRECTION_ID,
        requiredFactIds: [...requiredFactIds],
        locale,
      },
    })
  })
  const imageRoles = COMMERCE_SEMANTIC_ROLES.filter((role): role is Extract<CommerceSemanticRole, 'main-image' | `detail-image:${number}`> => (
    role === 'main-image' || role.startsWith('detail-image:')
  ))
  const imageNodes = imageRoles.map((role) => outcomeNode({
    role,
    schemaId: 'commerce.media-artifact',
    dependencies: [
      ...sharedDependencies(facts, ALIEXPRESS_POLICY_PACKS['en-US'].id),
      ...(role === 'main-image' ? [] : [{
        kind: 'outcome' as const,
        id: 'outcome:commerce:main-image',
        revision: 'outcome:commerce:main-image:revision:1',
      }]),
    ],
    payload: {
      kind: 'media',
      semanticRole: role,
      channel: 'aliexpress',
      marketPolicyId: ALIEXPRESS_POLICY_PACKS['en-US'].id,
      identityLockId: COMMERCE_IDENTITY_LOCK_ID,
      creativeDirectionId: COMMERCE_CREATIVE_DIRECTION_ID,
      requiredFactIds: [...requiredFactIds],
      mediaKind: 'image',
    },
  }))
  const videoNode = outcomeNode({
    role: 'product-video',
    schemaId: 'commerce.media-artifact',
    dependencies: [
      ...sharedDependencies(facts, ALIEXPRESS_POLICY_PACKS['en-US'].id),
      {
        kind: 'outcome',
        id: 'outcome:commerce:main-image',
        revision: 'outcome:commerce:main-image:revision:1',
      },
    ],
    payload: {
      kind: 'media',
      semanticRole: 'product-video',
      channel: 'aliexpress',
      marketPolicyId: ALIEXPRESS_POLICY_PACKS['en-US'].id,
      identityLockId: COMMERCE_IDENTITY_LOCK_ID,
      creativeDirectionId: COMMERCE_CREATIVE_DIRECTION_ID,
      requiredFactIds: [...requiredFactIds],
      mediaKind: 'video',
    },
  })
  const materialNodes = [...copyNodes, ...imageNodes, videoNode]
  const strategyNode = outcomeNode({
    role: 'strategy-document',
    schemaId: 'commerce.strategy-document',
    dependencies: [
      ...sharedDependencies(facts, ALIEXPRESS_POLICY_PACKS['en-US'].id),
      ...materialNodes.map((node) => ({ kind: 'outcome' as const, id: node.id, revision: node.revision })),
    ],
    payload: {
      kind: 'strategy',
      semanticRole: 'strategy-document',
      channel: 'aliexpress',
      marketPolicyId: ALIEXPRESS_POLICY_PACKS['en-US'].id,
      identityLockId: COMMERCE_IDENTITY_LOCK_ID,
      creativeDirectionId: COMMERCE_CREATIVE_DIRECTION_ID,
      requiredFactIds: [...requiredFactIds],
      evidenceSections: ['facts', 'plan', 'routes', 'validations', 'receipts', 'repairs'],
    },
  })
  return [
    {
      id: 'fragment:commerce-copy',
      source: { sourceId: COMMERCE_PROFILE_ID, revision: COMMERCE_PROFILE_VERSION, relation: 'profile-fragment' },
      precedence: 10,
      nodes: copyNodes,
    },
    {
      id: 'fragment:commerce-media',
      source: { sourceId: COMMERCE_PROFILE_ID, revision: COMMERCE_PROFILE_VERSION, relation: 'profile-fragment' },
      precedence: 10,
      nodes: [...imageNodes, videoNode],
    },
    {
      id: 'fragment:commerce-strategy',
      source: { sourceId: COMMERCE_PROFILE_ID, revision: COMMERCE_PROFILE_VERSION, relation: 'profile-fragment' },
      precedence: 10,
      nodes: [strategyNode],
    },
  ]
}

export function createCommerceOutcomeGraph(input: {
  readonly facts: ProductFacts
  readonly id?: string
  readonly revision?: string
}): OutcomeGraph {
  const composed = composeOutcomeFragments({
    graph: {
      protocol: 'design-os.protocol.v1',
      kind: 'outcome-graph',
      schema: { id: 'design-os.outcome-graph', version: 1 },
      identity: {
        id: input.id ?? 'outcome:commerce-production',
        revision: input.revision ?? 'outcome:commerce-production:revision:1',
      },
      provenance: [],
    },
    fragments: createCommerceOutcomeFragments(input.facts),
  })
  if (composed.conflicts.length > 0) throw new Error('Commerce Profile fragments contain composition conflicts.')
  const graph = outcomeGraphSchema.parse(composed.graph)
  const roles = graph.body.nodes.map((node) => commerceOutcomePayloadSchema.parse(node.payload).semanticRole)
  if (roles.length !== COMMERCE_SEMANTIC_ROLES.length
    || COMMERCE_SEMANTIC_ROLES.some((role) => !roles.includes(role))) {
    throw new Error('Commerce Outcome graph does not contain the exact semantic role closure.')
  }
  return graph
}

export function createCommerceCapabilityCatalog(): CapabilityCatalog {
  return capabilityCatalogSchema.parse({
    protocol: 'design-os.protocol.v1',
    kind: 'capability-catalog',
    schema: { id: 'design-os.capability-catalog', version: 1 },
    identity: { id: 'catalog:commerce-capabilities', revision: 'catalog:commerce:revision:1' },
    provenance: [],
    body: {
      entries: [
        {
          id: COMMERCE_CAPABILITY_IDS.localizedCopy,
          operation: 'produce-localized-cited-commerce-copy',
          inputSchemas: [{ id: 'commerce.product-fact', version: 1 }],
          outputSchemas: [{ id: 'commerce.localized-description', version: 1 }],
          transientFailureCodes: ['provider-timeout', 'rate-limit', 'host-recovery-interrupted'],
        },
        {
          id: COMMERCE_CAPABILITY_IDS.image,
          operation: 'produce-fact-locked-commerce-image',
          inputSchemas: [{ id: 'commerce.product-fact', version: 1 }],
          outputSchemas: [{ id: 'commerce.media-artifact', version: 1 }],
          transientFailureCodes: ['provider-timeout', 'rate-limit', 'host-recovery-interrupted'],
        },
        {
          id: COMMERCE_CAPABILITY_IDS.video,
          operation: 'produce-fact-locked-commerce-video',
          inputSchemas: [
            { id: 'commerce.product-fact', version: 1 },
            { id: 'commerce.media-artifact', version: 1 },
          ],
          outputSchemas: [{ id: 'commerce.media-artifact', version: 1 }],
          transientFailureCodes: ['provider-timeout', 'rate-limit', 'host-recovery-interrupted'],
        },
        {
          id: COMMERCE_CAPABILITY_IDS.strategy,
          operation: 'produce-evidence-derived-commerce-strategy',
          inputSchemas: [
            { id: 'commerce.product-fact', version: 1 },
            { id: 'commerce.localized-description', version: 1 },
            { id: 'commerce.media-artifact', version: 1 },
          ],
          outputSchemas: [{ id: 'commerce.strategy-document', version: 1 }],
          transientFailureCodes: ['provider-timeout', 'rate-limit', 'host-recovery-interrupted'],
        },
      ],
    },
  })
}

export function installCommerceProfileSchemas(registry: SchemaRegistry): SchemaRegistry {
  const registrations: readonly {
    readonly reference: { readonly id: string, readonly version: number }
    readonly category: 'outcome' | 'presentation' | 'recipe'
    readonly schema: z.ZodType
  }[] = [
    { reference: { id: 'commerce.product-fact', version: 1 }, category: 'outcome' as const, schema: productFactSchema },
    { reference: { id: 'commerce.localized-description', version: 1 }, category: 'outcome' as const, schema: localizedDescriptionSchema },
    { reference: { id: 'commerce.media-artifact', version: 1 }, category: 'outcome' as const, schema: commerceMediaArtifactSchema },
    { reference: { id: 'commerce.strategy-document', version: 1 }, category: 'outcome' as const, schema: strategyDocumentSchema },
    { reference: { id: 'commerce.market-policy', version: 1 }, category: 'presentation' as const, schema: commercePolicyPackSchema },
    { reference: { id: COMMERCE_RECIPE_ID, version: COMMERCE_RECIPE_VERSION }, category: 'recipe' as const, schema: commerceOutcomePayloadSchema },
  ]
  for (const registration of registrations) {
    registerDomainSchema(registry, {
      ...registration,
      canonicalOwner: 'src/commerce-profile',
    })
  }
  return registry
}

export function policyForOutcome(node: OutcomeNode): (typeof ALIEXPRESS_POLICY_PACKS)[CommerceLocale] {
  const payload = commerceOutcomePayloadSchema.parse(node.payload)
  const policy = Object.values(ALIEXPRESS_POLICY_PACKS).find((candidate) => candidate.id === payload.marketPolicyId)
  if (!policy) throw new Error(`Commerce Outcome references an unknown policy: ${payload.marketPolicyId}`)
  return policy
}
