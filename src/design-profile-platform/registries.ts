import { z } from 'zod'
import { fingerprint } from '@/design-ir/fingerprint'
import {
  artifactGraphSchema,
  evaluationGateSchema,
  evidenceGraphSchema,
  jsonValueSchema,
  outcomeNodeSchema,
  recordIdSchema,
  schemaReferenceSchema,
  sha256Schema,
  type ArtifactGraph,
  type EvidenceGraph,
  type OutcomeNode,
  type SchemaReference,
} from '@/design-os-kernel/contracts'
import type { ProfileProposalDraft, UniversalBrief } from './brief'
import {
  exactSemverSchema,
  profileBindingReferenceSchema,
  registeredProfileBindingSchema,
  type ProfileBindingKind,
  type ProfileBindingReference,
  type RegisteredProfileBinding,
} from './contracts'
import { deepFreeze } from './immutability'

export const trustedBindingIdentitySchema = registeredProfileBindingSchema
export type TrustedBindingIdentity = RegisteredProfileBinding

export async function fingerprintTrustedImplementation(input: {
  readonly id: string
  readonly functions?: readonly Function[]
  readonly schemas?: readonly z.ZodType[]
  readonly constants?: readonly unknown[]
}): Promise<string> {
  return fingerprint({
    protocol: 'design-profile.trusted-implementation.v1',
    id: recordIdSchema.parse(input.id),
    functions: (input.functions ?? []).map((implementation) => Function.prototype.toString.call(implementation)),
    schemas: (input.schemas ?? []).map((schema) => z.toJSONSchema(schema)),
    constants: input.constants ?? [],
  })
}

export const bindingAvailabilityProjectionSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('available'),
    binding: registeredProfileBindingSchema,
    readOnly: z.literal(false),
  }).strict(),
  z.object({
    status: z.literal('degraded'),
    binding: profileBindingReferenceSchema,
    readOnly: z.literal(true),
    diagnostic: z.object({
      code: z.literal('optional-binding-unavailable'),
      message: z.string().min(1).max(1_000),
    }).strict(),
  }).strict(),
  z.object({
    status: z.literal('blocked'),
    binding: profileBindingReferenceSchema,
    readOnly: z.literal(true),
    diagnostic: z.object({
      code: z.literal('required-binding-unavailable'),
      message: z.string().min(1).max(1_000),
    }).strict(),
  }).strict(),
])
export type BindingAvailabilityProjection = z.infer<typeof bindingAvailabilityProjectionSchema>

export const unknownArtifactInspectionSchema = z.object({
  status: z.literal('unknown-schema'),
  readOnly: z.literal(true),
  identity: z.object({
    id: recordIdSchema,
    revision: recordIdSchema,
    schema: schemaReferenceSchema,
    contentHash: sha256Schema,
  }).strict(),
  provenance: z.array(z.object({
    sourceId: recordIdSchema,
    revision: recordIdSchema,
    relation: z.string().min(1).max(120),
    contentHash: sha256Schema.optional(),
  }).strict()).max(20_000),
  rawMetadata: jsonValueSchema,
  diagnostic: z.object({
    code: z.literal('unknown-artifact-schema'),
    message: z.string().min(1).max(1_000),
  }).strict(),
}).strict()
export type UnknownArtifactInspection = z.infer<typeof unknownArtifactInspectionSchema>

export function inspectUnknownArtifact(
  input: Omit<UnknownArtifactInspection, 'status' | 'readOnly' | 'diagnostic'>,
): UnknownArtifactInspection {
  return unknownArtifactInspectionSchema.parse({
    ...input,
    status: 'unknown-schema',
    readOnly: true,
    diagnostic: {
      code: 'unknown-artifact-schema',
      message: `No trusted presentation binding is registered for ${schemaKey(input.identity.schema)}.`,
    },
  })
}

export interface TrustedBindingRegistration<
  Kind extends ProfileBindingKind,
  Implementation,
> extends Omit<TrustedBindingIdentity, 'kind'> {
  readonly kind?: Kind
  readonly implementation: Implementation
}

export interface ResolvedTrustedBinding<
  Kind extends ProfileBindingKind,
  Implementation,
> extends TrustedBindingIdentity {
  readonly kind: Kind
  readonly implementation: Implementation
}

abstract class TrustedBindingRegistry<
  Kind extends ProfileBindingKind,
  Implementation,
> {
  readonly #registrations = new Map<string, ResolvedTrustedBinding<Kind, Implementation>>()
  readonly kind: Kind
  private readonly isImplementation: (value: unknown) => value is Implementation

  protected constructor(
    kind: Kind,
    isImplementation: (value: unknown) => value is Implementation,
  ) {
    this.kind = kind
    this.isImplementation = isImplementation
  }

  register(registration: TrustedBindingRegistration<Kind, Implementation>): this {
    if (registration.kind !== undefined && registration.kind !== this.kind) {
      throw new Error(`Cannot register ${registration.kind} in the ${this.kind} registry.`)
    }
    const identity = registeredProfileBindingSchema.parse({
      kind: this.kind,
      id: registration.id,
      version: registration.version,
      implementationHash: registration.implementationHash,
      ownerId: registration.ownerId,
    })
    if (identity.kind !== this.kind) throw new Error(`Binding kind mismatch: ${identity.kind}`)
    if (!this.isImplementation(registration.implementation)) {
      throw new Error(`Invalid ${this.kind} implementation: ${identity.id}`)
    }
    const key = bindingKey(identity)
    const existing = this.#registrations.get(key)
    if (existing) {
      if (existing.ownerId !== identity.ownerId
        || existing.implementationHash !== identity.implementationHash) {
        throw new Error(`Trusted binding owner or implementation hash drift: ${key}`)
      }
      throw new Error(`Trusted binding is already registered: ${key}`)
    }
    this.#registrations.set(key, Object.freeze({
      ...identity,
      implementation: registration.implementation,
    }) as ResolvedTrustedBinding<Kind, Implementation>)
    return this
  }

  registration(id: string, version: string): ResolvedTrustedBinding<Kind, Implementation> | undefined {
    return this.#registrations.get(
      `${this.kind}:${recordIdSchema.parse(id)}@${exactSemverSchema.parse(version)}`,
    )
  }

  registrations(): readonly ResolvedTrustedBinding<Kind, Implementation>[] {
    return [...this.#registrations.values()]
      .sort((left, right) => bindingKey(left).localeCompare(bindingKey(right)))
  }

  resolve(reference: ProfileBindingReference): ResolvedTrustedBinding<Kind, Implementation> | undefined {
    const parsed = profileBindingReferenceSchema.parse(reference)
    if (parsed.kind !== this.kind) {
      throw new Error(`Binding kind mismatch: expected ${this.kind}, received ${parsed.kind}.`)
    }
    const registration = this.#registrations.get(bindingKey(parsed))
    if (!registration) return undefined
    if (registration.implementationHash !== parsed.implementationHash) {
      throw new Error(`Trusted binding implementation hash drift: ${bindingKey(parsed)}`)
    }
    return registration
  }

  require(reference: ProfileBindingReference): ResolvedTrustedBinding<Kind, Implementation> {
    const registration = this.resolve(reference)
    if (!registration) throw new Error(`Missing trusted binding: ${bindingKey(reference)}`)
    return registration
  }

  availability(reference: ProfileBindingReference): BindingAvailabilityProjection {
    const parsed = profileBindingReferenceSchema.parse(reference)
    const registration = this.resolve(parsed)
    if (registration) {
      const { implementation: _implementation, ...binding } = registration
      return bindingAvailabilityProjectionSchema.parse({ status: 'available', binding, readOnly: false })
    }
    const status = parsed.required ? 'blocked' : 'degraded'
    const code = parsed.required ? 'required-binding-unavailable' : 'optional-binding-unavailable'
    return bindingAvailabilityProjectionSchema.parse({
      status,
      binding: parsed,
      readOnly: true,
      diagnostic: { code, message: `Trusted ${parsed.kind} binding is unavailable: ${bindingKey(parsed)}` },
    })
  }
}

export interface ProfileCompilerInput {
  readonly brief: UniversalBrief
  readonly profile: {
    readonly id: string
    readonly version: string
    readonly manifestDigest: string
  }
}

export interface ProfileCompiler {
  readonly compile: (input: ProfileCompilerInput) => readonly ProfileProposalDraft[] | Promise<readonly ProfileProposalDraft[]>
}

export class ProfileCompilerRegistry extends TrustedBindingRegistry<'compiler', ProfileCompiler> {
  constructor() {
    super('compiler', (value): value is ProfileCompiler => hasFunction(value, 'compile'))
  }
}

export type EvaluatorResult = Omit<z.infer<typeof evaluationGateSchema>, 'id' | 'outcomeNodeId' | 'evaluator'>

export interface ProfileEvaluator<Input = unknown> {
  readonly outcomeSchemas: readonly SchemaReference[]
  readonly artifactSchemas: readonly SchemaReference[]
  readonly inputSchema: z.ZodType<Input>
  readonly evaluate: (input: {
    readonly parameters: Input
    readonly outcome: OutcomeNode
    readonly evidenceGraph: EvidenceGraph
    readonly artifactGraph: ArtifactGraph
  }) => EvaluatorResult
}

export class EvaluatorRegistry extends TrustedBindingRegistry<'evaluator', ProfileEvaluator> {
  constructor() {
    super('evaluator', isEvaluator)
  }

  evaluate(reference: ProfileBindingReference, input: {
    readonly parameters: unknown
    readonly outcome: unknown
    readonly evidenceGraph: unknown
    readonly artifactGraph: unknown
  }): EvaluatorResult {
    const evaluator = this.require(reference).implementation
    const outcome = outcomeNodeSchema.parse(input.outcome)
    const evidenceGraph = evidenceGraphSchema.parse(input.evidenceGraph)
    const artifactGraph = artifactGraphSchema.parse(input.artifactGraph)
    const ownsOutcomeSchema = evaluator.outcomeSchemas.some((schema) => schemaKey(schema) === schemaKey(outcome.schema))
    if (!ownsOutcomeSchema) throw new Error(`Evaluator does not own Outcome schema ${schemaKey(outcome.schema)}.`)
    const parameters = evaluator.inputSchema.parse(input.parameters)
    const result = evaluatorResultSchema.parse(evaluator.evaluate(deepFreeze({
      parameters: deepFreeze(structuredClone(parameters)),
      outcome: deepFreeze(structuredClone(outcome)),
      evidenceGraph: deepFreeze(structuredClone(evidenceGraph)),
      artifactGraph: deepFreeze(structuredClone(artifactGraph)),
    })))
    const artifactsById = new Map(artifactGraph.body.nodes.map((artifact) => [artifact.id, artifact]))
    for (const artifactId of result.artifactIds) {
      const artifact = artifactsById.get(artifactId)
      if (!artifact) throw new Error(`Evaluator returned an artifact absent from the ArtifactGraph: ${artifactId}`)
      if (!evaluator.artifactSchemas.some((schema) => schemaKey(schema) === schemaKey(artifact.schema))) {
        throw new Error(`Evaluator returned an artifact schema it does not own: ${schemaKey(artifact.schema)}`)
      }
    }
    if (result.reasons.some((reason) => reason.nodeId !== undefined && reason.nodeId !== outcome.id)) {
      throw new Error(`Evaluator reason path does not belong to Outcome ${outcome.id}.`)
    }
    return result
  }
}

const evaluatorResultSchema = z.object({
  status: evaluationGateSchema.shape.status,
  artifactIds: evaluationGateSchema.shape.artifactIds,
  reasons: evaluationGateSchema.shape.reasons,
}).strict().superRefine((result, context) => {
  if (new Set(result.artifactIds).size !== result.artifactIds.length) {
    context.addIssue({ code: 'custom', message: 'Evaluator artifact ids must be unique.' })
  }
  if (result.status !== 'passed' && result.reasons.length === 0) {
    context.addIssue({ code: 'custom', message: 'A non-passing evaluator result requires a reason path.' })
  }
})

export const presentationProjectionSchema = z.object({
  title: z.string().min(1).max(240),
  summary: z.string().min(1).max(2_000),
  metadata: z.record(z.string().min(1).max(120), jsonValueSchema),
  actionIds: z.array(recordIdSchema).max(1_000),
}).strict()
export type PresentationProjection = z.infer<typeof presentationProjectionSchema>

export interface PresentationBinding {
  readonly schema: SchemaReference
  readonly fallbackPriority: number
  readonly inputSchema: z.ZodType
  readonly project: (decodedInput: unknown) => PresentationProjection
}

abstract class PresentationRegistry<Kind extends 'renderer' | 'inspector'> extends TrustedBindingRegistry<Kind, PresentationBinding> {
  protected constructor(kind: Kind) {
    super(kind, isPresentationBinding)
  }

  project(reference: ProfileBindingReference, input: unknown): PresentationProjection {
    const presentation = this.require(reference).implementation
    const decoded = presentation.inputSchema.parse(input)
    return presentationProjectionSchema.parse(presentation.project(structuredClone(decoded)))
  }
}

export class RendererRegistry extends PresentationRegistry<'renderer'> {
  constructor() { super('renderer') }
}

export class InspectorRegistry extends PresentationRegistry<'inspector'> {
  constructor() { super('inspector') }
}

export const semanticActionRequestSchema = z.object({
  subject: z.object({
    kind: z.enum(['outcome', 'artifact', 'project']),
    id: recordIdSchema,
    revision: recordIdSchema.optional(),
  }).strict(),
  parameters: jsonValueSchema,
}).strict()
export type SemanticActionRequest = z.infer<typeof semanticActionRequestSchema>

const semanticCommandDraftSchema = z.object({
  id: recordIdSchema,
  kind: z.enum([
    'propose-outcome-change',
    'request-evaluation',
    'request-repair',
    'request-delivery',
  ]),
  subject: semanticActionRequestSchema.shape.subject,
  parameters: jsonValueSchema,
  requiredCapabilityIds: z.array(recordIdSchema).max(1_000),
}).strict()
export type SemanticCommandDraft = z.infer<typeof semanticCommandDraftSchema>

export const semanticCommandSchema = semanticCommandDraftSchema.extend({
  version: z.literal('design-profile.semantic-command.v1'),
  actionBinding: profileBindingReferenceSchema,
  effect: z.literal('command-only'),
}).strict()
export type SemanticCommand = z.infer<typeof semanticCommandSchema>

export interface SemanticActionCompiler {
  readonly compile: (request: SemanticActionRequest) => readonly SemanticCommandDraft[]
}

export class SemanticActionRegistry extends TrustedBindingRegistry<'semantic-action', SemanticActionCompiler> {
  constructor() {
    super('semantic-action', (value): value is SemanticActionCompiler => hasFunction(value, 'compile'))
  }

  compile(reference: ProfileBindingReference, request: SemanticActionRequest): readonly SemanticCommand[] {
    const registration = this.require(reference)
    const parsedRequest = semanticActionRequestSchema.parse(request)
    const input = structuredClone(parsedRequest)
    const commands = registration.implementation.compile(input)
    return commands.map((command) => semanticCommandSchema.parse({
      ...semanticCommandDraftSchema.parse(command),
      version: 'design-profile.semantic-command.v1',
      actionBinding: {
        kind: registration.kind,
        id: registration.id,
        version: registration.version,
        implementationHash: registration.implementationHash,
        required: reference.required,
      },
      effect: 'command-only',
    }))
  }
}

export const deliveryDescriptionSchema = z.object({
  formatId: recordIdSchema,
  mediaType: z.string().min(1).max(240),
  artifactSchemas: z.array(schemaReferenceSchema).min(1).max(1_000),
  requiredTargetAdapterIds: z.array(recordIdSchema).max(1_000),
}).strict().superRefine((description, context) => {
  for (const [label, ids] of [
    ['artifact schema', description.artifactSchemas.map(schemaKey)],
    ['target adapter', description.requiredTargetAdapterIds],
  ] as const) {
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: 'custom', message: `Delivery ${label}s must be unique.` })
    }
  }
})
export type DeliveryDescription = z.infer<typeof deliveryDescriptionSchema>

export class DeliveryRegistry extends TrustedBindingRegistry<'delivery', DeliveryDescription> {
  constructor() {
    super('delivery', (value): value is DeliveryDescription => deliveryDescriptionSchema.safeParse(value).success)
  }
}

export const rulerReferenceSchema = z.object({
  id: recordIdSchema,
  version: z.number().int().positive(),
  digest: sha256Schema,
}).strict()

export const evidenceBenchmarkProjectionSchema = z.object({
  profileId: recordIdSchema,
  ruler: rulerReferenceSchema,
  metrics: z.array(z.object({
    id: recordIdSchema,
    status: z.enum(['passed', 'failed', 'blocked']),
    evidenceIds: z.array(recordIdSchema).min(1).max(10_000),
  }).strict()).max(10_000),
}).strict().superRefine((projection, context) => {
  if (new Set(projection.metrics.map(({ id }) => id)).size !== projection.metrics.length) {
    context.addIssue({ code: 'custom', message: 'Evidence benchmark metric ids must be unique.' })
  }
  for (const metric of projection.metrics) {
    if (new Set(metric.evidenceIds).size !== metric.evidenceIds.length) {
      context.addIssue({ code: 'custom', message: `Evidence benchmark metric ${metric.id} evidence ids must be unique.` })
    }
  }
})
export type EvidenceBenchmarkProjection = z.infer<typeof evidenceBenchmarkProjectionSchema>

export const outcomeScorecardProjectionSchema = z.object({
  profileId: recordIdSchema,
  ruler: rulerReferenceSchema,
  criteria: z.array(z.object({
    id: recordIdSchema,
    score: z.number().finite().nonnegative(),
    maximumScore: z.number().finite().positive(),
    evidenceIds: z.array(recordIdSchema).min(1).max(10_000),
  }).strict().superRefine((criterion, context) => {
    if (criterion.score > criterion.maximumScore) {
      context.addIssue({ code: 'custom', message: 'Outcome criterion score cannot exceed its maximum.' })
    }
  })).max(10_000),
}).strict().superRefine((projection, context) => {
  if (new Set(projection.criteria.map(({ id }) => id)).size !== projection.criteria.length) {
    context.addIssue({ code: 'custom', message: 'Outcome scorecard criterion ids must be unique.' })
  }
  for (const criterion of projection.criteria) {
    if (new Set(criterion.evidenceIds).size !== criterion.evidenceIds.length) {
      context.addIssue({ code: 'custom', message: `Outcome scorecard criterion ${criterion.id} evidence ids must be unique.` })
    }
  }
})
export type OutcomeScorecardProjection = z.infer<typeof outcomeScorecardProjectionSchema>

export interface StrictProjectionAdapter<Output> {
  readonly profileId: string
  readonly ruler: z.infer<typeof rulerReferenceSchema>
  readonly sourceSchema: z.ZodType
  readonly project: (decodedSource: unknown) => Output
}

export interface EvidenceVerificationAdapter {
  readonly profileId: string
  readonly ruler: z.infer<typeof rulerReferenceSchema>
  readonly sourceSchema: z.ZodType
  readonly verifyAndProject: (decodedSource: unknown) => Promise<EvidenceBenchmarkProjection>
}

export class EvidenceBenchmarkAdapterRegistry extends TrustedBindingRegistry<
  'evidence-benchmark-adapter',
  EvidenceVerificationAdapter
> {
  constructor() {
    super('evidence-benchmark-adapter', isEvidenceVerificationAdapter)
  }

  async verifyAndProject(
    reference: ProfileBindingReference,
    source: unknown,
  ): Promise<EvidenceBenchmarkProjection> {
    const adapter = this.require(reference).implementation
    const decoded = adapter.sourceSchema.parse(source)
    const pendingProjection = adapter.verifyAndProject(
      deepFreeze(structuredClone(decoded)),
    )
    if (!isPromiseLike(pendingProjection)) {
      throw new Error('Evidence maturity verification must return an asynchronous result.')
    }
    const projection = evidenceBenchmarkProjectionSchema.parse(await pendingProjection)
    assertProjectionIdentity(adapter, projection)
    return projection
  }
}

export class OutcomeScorecardAdapterRegistry extends TrustedBindingRegistry<
  'outcome-scorecard-adapter',
  StrictProjectionAdapter<OutcomeScorecardProjection>
> {
  constructor() {
    super('outcome-scorecard-adapter', isProjectionAdapter)
  }

  project(reference: ProfileBindingReference, source: unknown): OutcomeScorecardProjection {
    const adapter = this.require(reference).implementation
    const decoded = adapter.sourceSchema.parse(source)
    const projection = outcomeScorecardProjectionSchema.parse(adapter.project(structuredClone(decoded)))
    assertProjectionIdentity(adapter, projection)
    return projection
  }
}

export interface ProfileBindingRegistries {
  readonly compilers: ProfileCompilerRegistry
  readonly evaluators: EvaluatorRegistry
  readonly renderers: RendererRegistry
  readonly inspectors: InspectorRegistry
  readonly semanticActions: SemanticActionRegistry
  readonly delivery: DeliveryRegistry
  readonly evidenceBenchmarkAdapters: EvidenceBenchmarkAdapterRegistry
  readonly outcomeScorecardAdapters: OutcomeScorecardAdapterRegistry
}

export function createProfileBindingRegistries(): ProfileBindingRegistries {
  return {
    compilers: new ProfileCompilerRegistry(),
    evaluators: new EvaluatorRegistry(),
    renderers: new RendererRegistry(),
    inspectors: new InspectorRegistry(),
    semanticActions: new SemanticActionRegistry(),
    delivery: new DeliveryRegistry(),
    evidenceBenchmarkAdapters: new EvidenceBenchmarkAdapterRegistry(),
    outcomeScorecardAdapters: new OutcomeScorecardAdapterRegistry(),
  }
}

function hasFunction(value: unknown, key: string): boolean {
  return value !== null && typeof value === 'object'
    && typeof (value as Record<string, unknown>)[key] === 'function'
}

function isEvaluator(value: unknown): value is ProfileEvaluator {
  if (!hasFunction(value, 'evaluate') || value === null || typeof value !== 'object') return false
  const candidate = value as Partial<ProfileEvaluator>
  return Array.isArray(candidate.outcomeSchemas)
    && candidate.outcomeSchemas.every((schema) => schemaReferenceSchema.safeParse(schema).success)
    && Array.isArray(candidate.artifactSchemas)
    && candidate.artifactSchemas.every((schema) => schemaReferenceSchema.safeParse(schema).success)
    && candidate.inputSchema instanceof z.ZodType
}

function isPresentationBinding(value: unknown): value is PresentationBinding {
  if (!hasFunction(value, 'project') || value === null || typeof value !== 'object') return false
  const candidate = value as Partial<PresentationBinding>
  return schemaReferenceSchema.safeParse(candidate.schema).success
    && Number.isInteger(candidate.fallbackPriority)
    && candidate.inputSchema instanceof z.ZodType
}

function isProjectionAdapter(value: unknown): value is StrictProjectionAdapter<never> {
  if (!hasFunction(value, 'project') || value === null || typeof value !== 'object') return false
  const candidate = value as Partial<StrictProjectionAdapter<never>>
  return candidate.sourceSchema instanceof z.ZodType
    && recordIdSchema.safeParse(candidate.profileId).success
    && rulerReferenceSchema.safeParse(candidate.ruler).success
}

function isEvidenceVerificationAdapter(value: unknown): value is EvidenceVerificationAdapter {
  if (!hasFunction(value, 'verifyAndProject') || value === null || typeof value !== 'object') return false
  const candidate = value as Partial<EvidenceVerificationAdapter>
  return isAsyncFunction(candidate.verifyAndProject)
    && candidate.sourceSchema instanceof z.ZodType
    && recordIdSchema.safeParse(candidate.profileId).success
    && rulerReferenceSchema.safeParse(candidate.ruler).success
}

const asyncFunctionPrototype = Object.getPrototypeOf(async () => undefined)

function isAsyncFunction(value: unknown): value is (...args: readonly unknown[]) => Promise<unknown> {
  return typeof value === 'function' && Object.getPrototypeOf(value) === asyncFunctionPrototype
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return value !== null && (typeof value === 'object' || typeof value === 'function')
    && typeof (value as { readonly then?: unknown }).then === 'function'
}

function assertProjectionIdentity(
  adapter: Pick<StrictProjectionAdapter<unknown>, 'profileId' | 'ruler'>,
  projection: Pick<EvidenceBenchmarkProjection, 'profileId' | 'ruler'>,
): void {
  if (projection.profileId !== adapter.profileId
    || projection.ruler.id !== adapter.ruler.id
    || projection.ruler.version !== adapter.ruler.version
    || projection.ruler.digest !== adapter.ruler.digest) {
    throw new Error('Profile projection changed its registered Profile or frozen ruler identity.')
  }
}

function schemaKey(reference: SchemaReference): string {
  return `${reference.id}@${reference.version}`
}

function bindingKey(binding: Pick<ProfileBindingReference | RegisteredProfileBinding, 'kind' | 'id' | 'version'>): string {
  return `${binding.kind}:${binding.id}@${binding.version}`
}
