import { z } from 'zod'
import { canonicalJson, fingerprint } from '@/design-ir/fingerprint'
import { recordIdSchema, schemaReferenceSchema, sha256Schema } from '@/design-os-kernel/contracts'

export const DESIGN_PROFILE_MANIFEST_PROTOCOL = 'design-profile.manifest.v1' as const
export const DESIGN_PROFILE_CLOSURE_PROTOCOL = 'design-profile.closure.v1' as const

const exactSemverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const kernelRangePattern = /^(?:\^|~)?(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$|^(?:(?:>=|>|<=|<|=)(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?: +|$)){1,4}$/
const secretPattern = /(?:\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b|\bBearer\s+[A-Za-z0-9._~+/-]+\b|(?:api[-_]?key|token|secret|authorization)\s*[:=]\s*[^\s,;]+)/i
const originPattern = /\b(?:https?|wss?|file):\/\/|(?:^|\s)www\./i
const pathPattern = /(?:^|[\s"'(])(?:\.{1,2}[\\/][^\s"']+|\/(?:[^\s/"']+\/)*[^\s"']*|[A-Za-z]:\\[^\s"']+)/
const executablePattern = /(?:`|#!|<script\b|\b(?:exec|spawn|system|eval|require)\s*\(|\bfunction\s*[A-Za-z0-9_$]*\s*\(|=>|(?:^|\s)(?:bash|zsh|powershell|cmd(?:\.exe)?|curl|wget|node|python\d*|pnpm|npm|yarn|deno|bun|git)\s+[^\s])/i
const authorityPattern = /\b(?:approval|approved|authority|authorization|authorized|credential|command)\b/i

export const exactSemverSchema = z.string().regex(exactSemverPattern)
export const kernelCompatibilityRangeSchema = z.string().regex(kernelRangePattern)
export const declarativeIdSchema = recordIdSchema.refine(
  (value) => !value.includes('/') && !value.includes('\\') && !/^[a-z][a-z0-9+.-]*:\/\//i.test(value),
  'Declarative ids cannot contain paths or origins.',
)

const declarativeSchemaReferenceSchema = schemaReferenceSchema.extend({
  id: declarativeIdSchema,
}).strict()

export const profileDependencyReferenceSchema = z.object({
  profileId: declarativeIdSchema,
  version: exactSemverSchema,
  contentHash: sha256Schema,
}).strict()
export type ProfileDependencyReference = z.infer<typeof profileDependencyReferenceSchema>

export const profileBindingKindSchema = z.enum([
  'schema',
  'compiler',
  'recipe',
  'policy',
  'evaluator',
  'renderer',
  'inspector',
  'semantic-action',
  'delivery',
  'migration',
  'evidence-benchmark-adapter',
  'outcome-scorecard-adapter',
])
export type ProfileBindingKind = z.infer<typeof profileBindingKindSchema>

function bindingReferenceSchema<Kind extends ProfileBindingKind>(kind: Kind) {
  return z.object({
    kind: z.literal(kind),
    id: declarativeIdSchema,
    version: exactSemverSchema,
    implementationHash: sha256Schema,
    required: z.boolean(),
  }).strict()
}

export const schemaBindingReferenceSchema = bindingReferenceSchema('schema')
export const compilerBindingReferenceSchema = bindingReferenceSchema('compiler')
export const recipeBindingReferenceSchema = bindingReferenceSchema('recipe')
export const policyBindingReferenceSchema = bindingReferenceSchema('policy')
export const evaluatorBindingReferenceSchema = bindingReferenceSchema('evaluator')
export const rendererBindingReferenceSchema = bindingReferenceSchema('renderer')
export const inspectorBindingReferenceSchema = bindingReferenceSchema('inspector')
export const semanticActionBindingReferenceSchema = bindingReferenceSchema('semantic-action')
export const deliveryBindingReferenceSchema = bindingReferenceSchema('delivery')
export const migrationBindingReferenceSchema = bindingReferenceSchema('migration')
export const evidenceBenchmarkAdapterBindingReferenceSchema = bindingReferenceSchema('evidence-benchmark-adapter')
export const outcomeScorecardAdapterBindingReferenceSchema = bindingReferenceSchema('outcome-scorecard-adapter')

export const profileBindingReferenceSchema = z.discriminatedUnion('kind', [
  schemaBindingReferenceSchema,
  compilerBindingReferenceSchema,
  recipeBindingReferenceSchema,
  policyBindingReferenceSchema,
  evaluatorBindingReferenceSchema,
  rendererBindingReferenceSchema,
  inspectorBindingReferenceSchema,
  semanticActionBindingReferenceSchema,
  deliveryBindingReferenceSchema,
  migrationBindingReferenceSchema,
  evidenceBenchmarkAdapterBindingReferenceSchema,
  outcomeScorecardAdapterBindingReferenceSchema,
])
export type ProfileBindingReference = z.infer<typeof profileBindingReferenceSchema>

export const registeredProfileBindingSchema = z.object({
  kind: profileBindingKindSchema,
  id: declarativeIdSchema,
  version: exactSemverSchema,
  implementationHash: sha256Schema,
  ownerId: declarativeIdSchema,
}).strict()
export type RegisteredProfileBinding = z.infer<typeof registeredProfileBindingSchema>

export const profileLibraryRequirementSchema = z.object({
  itemId: declarativeIdSchema,
  version: exactSemverSchema,
  contentHash: sha256Schema,
}).strict()
export type ProfileLibraryRequirement = z.infer<typeof profileLibraryRequirementSchema>

export const profileCapabilityRequirementSchema = z.object({
  capabilityId: declarativeIdSchema,
  required: z.boolean(),
  reason: z.string().min(1).max(500),
}).strict()

export const requiredRoleSchema = z.object({
  roleId: declarativeIdSchema,
  outputSchema: declarativeSchemaReferenceSchema,
  cardinality: z.object({
    minimum: z.number().int().positive().max(10_000),
    maximum: z.number().int().positive().max(10_000),
  }).strict(),
  constraintIds: z.array(declarativeIdSchema).max(1_000),
}).strict().superRefine((role, context) => {
  if (role.cardinality.maximum < role.cardinality.minimum) {
    context.addIssue({ code: 'custom', message: `Role ${role.roleId} has an invalid cardinality.` })
  }
  if (new Set(role.constraintIds).size !== role.constraintIds.length) {
    context.addIssue({ code: 'custom', message: `Role ${role.roleId} constraint ids must be unique.` })
  }
})
export type RequiredRole = z.infer<typeof requiredRoleSchema>

export const requiredRoleClosureSchema = z.object({
  id: declarativeIdSchema,
  roles: z.array(requiredRoleSchema).min(1).max(10_000),
}).strict().superRefine((closure, context) => {
  const roleIds = closure.roles.map((role) => role.roleId)
  if (new Set(roleIds).size !== roleIds.length) {
    context.addIssue({ code: 'custom', message: `Required-role closure ${closure.id} has duplicate role ids.` })
  }
})
export type RequiredRoleClosure = z.infer<typeof requiredRoleClosureSchema>

export const identityContinuityBindingSchema = z.object({
  id: declarativeIdSchema,
  kind: z.enum(['identity', 'continuity']),
  sourceKind: z.enum(['project-evidence', 'artifact-revision', 'library-revision']),
  requiredRoleIds: z.array(declarativeIdSchema).min(1).max(10_000),
  evaluatorBindingId: declarativeIdSchema,
}).strict().superRefine((binding, context) => {
  if (new Set(binding.requiredRoleIds).size !== binding.requiredRoleIds.length) {
    context.addIssue({ code: 'custom', message: `Identity binding ${binding.id} has duplicate role ids.` })
  }
})
export type IdentityContinuityBinding = z.infer<typeof identityContinuityBindingSchema>

export const resolvedIdentityContinuityBindingSchema = z.object({
  bindingId: declarativeIdSchema,
  source: z.object({
    kind: z.enum(['project-evidence', 'artifact-revision', 'library-revision']),
    id: declarativeIdSchema,
    revision: declarativeIdSchema,
    contentHash: sha256Schema,
  }).strict(),
  lock: z.object({
    id: declarativeIdSchema,
    revision: declarativeIdSchema,
    contentHash: sha256Schema,
  }).strict(),
}).strict()
export type ResolvedIdentityContinuityBinding = z.infer<typeof resolvedIdentityContinuityBindingSchema>

const consumedLockSchema = z.object({
  bindingId: declarativeIdSchema,
  lockId: declarativeIdSchema,
  lockRevision: declarativeIdSchema,
  lockContentHash: sha256Schema,
}).strict()

export const profileRoleOutputSchema = z.object({
  roleId: declarativeIdSchema,
  outcome: z.object({
    id: declarativeIdSchema,
    revision: declarativeIdSchema,
    schema: schemaReferenceSchema,
  }).strict(),
  artifact: z.object({
    id: declarativeIdSchema,
    revision: declarativeIdSchema,
    schema: schemaReferenceSchema,
    contentHash: sha256Schema,
  }).strict(),
  observed: z.object({
    roleId: declarativeIdSchema,
    outcomeId: declarativeIdSchema,
    outcomeRevision: declarativeIdSchema,
    artifactId: declarativeIdSchema,
    artifactRevision: declarativeIdSchema,
    outputSchema: schemaReferenceSchema,
    contentHash: sha256Schema,
  }).strict(),
  consumedLocks: z.array(consumedLockSchema).max(1_000),
}).strict().superRefine((output, context) => {
  const bindingIds = output.consumedLocks.map((lock) => lock.bindingId)
  if (new Set(bindingIds).size !== bindingIds.length) {
    context.addIssue({ code: 'custom', message: `Role output ${output.roleId} consumes a binding more than once.` })
  }
})
export type ProfileRoleOutput = z.infer<typeof profileRoleOutputSchema>

function uniqueBy<T>(values: readonly T[], key: (value: T) => string): boolean {
  return new Set(values.map(key)).size === values.length
}

const profileManifestContentBaseSchema = z.object({
  protocol: z.literal(DESIGN_PROFILE_MANIFEST_PROTOCOL),
  id: declarativeIdSchema,
  version: exactSemverSchema,
  kernelCompatibility: kernelCompatibilityRangeSchema,
  dependencies: z.array(profileDependencyReferenceSchema).max(1_000),
  schemas: z.array(schemaBindingReferenceSchema).max(10_000),
  compilers: z.array(compilerBindingReferenceSchema).max(10_000),
  recipes: z.array(recipeBindingReferenceSchema).max(10_000),
  policies: z.array(policyBindingReferenceSchema).max(10_000),
  evaluators: z.array(evaluatorBindingReferenceSchema).max(10_000),
  renderers: z.array(rendererBindingReferenceSchema).max(10_000),
  inspectors: z.array(inspectorBindingReferenceSchema).max(10_000),
  semanticActions: z.array(semanticActionBindingReferenceSchema).max(10_000),
  deliveries: z.array(deliveryBindingReferenceSchema).max(10_000),
  migrations: z.array(migrationBindingReferenceSchema).max(10_000),
  evidenceBenchmarkAdapters: z.array(evidenceBenchmarkAdapterBindingReferenceSchema).max(1_000),
  outcomeScorecardAdapters: z.array(outcomeScorecardAdapterBindingReferenceSchema).max(1_000),
  capabilityRequirements: z.array(profileCapabilityRequirementSchema).max(1_000),
  libraryRequirements: z.array(profileLibraryRequirementSchema).max(1_000),
  requiredRoleClosures: z.array(requiredRoleClosureSchema).max(1_000),
  identityBindings: z.array(identityContinuityBindingSchema).max(10_000),
}).strict()

function validateManifestContent(
  manifest: z.infer<typeof profileManifestContentBaseSchema>,
  context: z.RefinementCtx,
): void {
  if (!uniqueBy(manifest.dependencies, (dependency) => dependency.profileId)) {
    context.addIssue({ code: 'custom', message: 'Profile dependency ids must be unique.' })
  }
  const bindingReferences = profileManifestBindingReferences(manifest)
  if (!uniqueBy(bindingReferences, profileBindingKey)) {
    context.addIssue({ code: 'custom', message: 'Profile binding references must be unique.' })
  }
  if (!uniqueBy(manifest.capabilityRequirements, (requirement) => requirement.capabilityId)) {
    context.addIssue({ code: 'custom', message: 'Profile capability requirement ids must be unique.' })
  }
  if (!uniqueBy(manifest.libraryRequirements, (requirement) => requirement.itemId)) {
    context.addIssue({ code: 'custom', message: 'Profile Library requirement ids must be unique.' })
  }
  if (!uniqueBy(manifest.requiredRoleClosures, (closure) => closure.id)) {
    context.addIssue({ code: 'custom', message: 'Profile required-role closure ids must be unique.' })
  }
  if (!uniqueBy(manifest.identityBindings, (binding) => binding.id)) {
    context.addIssue({ code: 'custom', message: 'Profile identity binding ids must be unique.' })
  }
  const forbiddenPayload = findForbiddenManifestPayload(manifest)
  if (forbiddenPayload) {
    context.addIssue({
      code: 'custom',
      message: `Profile manifests cannot embed ${forbiddenPayload} in declarative values.`,
    })
  }
  const allRoleIds = manifest.requiredRoleClosures.flatMap((closure) => closure.roles.map((role) => role.roleId))
  if (new Set(allRoleIds).size !== allRoleIds.length) {
    context.addIssue({ code: 'custom', message: 'Profile semantic role ids must be unique across required-role closures.' })
  }
  const roleIds = new Set(allRoleIds)
  const evaluatorIds = new Set(manifest.evaluators.map((binding) => binding.id))
  for (const binding of manifest.identityBindings) {
    for (const roleId of binding.requiredRoleIds) {
      if (!roleIds.has(roleId)) {
        context.addIssue({ code: 'custom', message: `Identity binding ${binding.id} references unknown role ${roleId}.` })
      }
    }
    if (!evaluatorIds.has(binding.evaluatorBindingId)) {
      context.addIssue({ code: 'custom', message: `Identity binding ${binding.id} references unknown evaluator ${binding.evaluatorBindingId}.` })
    }
  }
}

function findForbiddenManifestPayload(value: unknown): string | undefined {
  if (typeof value === 'string') {
    if (secretPattern.test(value)) return 'credential-shaped data'
    if (originPattern.test(value)) return 'network or file origins'
    if (pathPattern.test(value)) return 'filesystem paths'
    if (executablePattern.test(value)) return 'code or commands'
    if (authorityPattern.test(value)) return 'approval or authority claims'
    return undefined
  }
  if (Array.isArray(value)) {
    for (const child of value) {
      const finding = findForbiddenManifestPayload(child)
      if (finding) return finding
    }
    return undefined
  }
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) {
      const finding = findForbiddenManifestPayload(child)
      if (finding) return finding
    }
  }
  return undefined
}

export const profileManifestContentSchema = profileManifestContentBaseSchema.superRefine(validateManifestContent)
export type ProfileManifestContent = z.infer<typeof profileManifestContentSchema>

export const designProfileManifestSchema = profileManifestContentBaseSchema.extend({
  contentHash: sha256Schema,
}).strict().superRefine(validateManifestContent)
export type DesignProfileManifest = z.infer<typeof designProfileManifestSchema>

export const profileClosureSchema = z.object({
  protocol: z.literal(DESIGN_PROFILE_CLOSURE_PROTOCOL),
  kernelVersion: exactSemverSchema,
  rootProfiles: z.array(profileDependencyReferenceSchema).max(1_000),
  manifests: z.array(designProfileManifestSchema).max(10_000),
  registrations: z.array(registeredProfileBindingSchema).max(100_000),
  libraryLocks: z.array(profileLibraryRequirementSchema).max(10_000),
  closureHash: sha256Schema,
}).strict()
export type ProfileClosure = z.infer<typeof profileClosureSchema>

const manifestArrayKeys = [
  'schemas',
  'compilers',
  'recipes',
  'policies',
  'evaluators',
  'renderers',
  'inspectors',
  'semanticActions',
  'deliveries',
  'migrations',
  'evidenceBenchmarkAdapters',
  'outcomeScorecardAdapters',
] as const

export function profileBindingKey(binding: Pick<ProfileBindingReference, 'kind' | 'id' | 'version'>): string {
  return `${binding.kind}:${binding.id}@${binding.version}`
}

export function profileManifestBindingReferences(
  manifest: Pick<ProfileManifestContent, typeof manifestArrayKeys[number]>,
): readonly ProfileBindingReference[] {
  return [
    ...manifest.schemas,
    ...manifest.compilers,
    ...manifest.recipes,
    ...manifest.policies,
    ...manifest.evaluators,
    ...manifest.renderers,
    ...manifest.inspectors,
    ...manifest.semanticActions,
    ...manifest.deliveries,
    ...manifest.migrations,
    ...manifest.evidenceBenchmarkAdapters,
    ...manifest.outcomeScorecardAdapters,
  ]
}

function sortByKey<T>(values: readonly T[], key: (value: T) => string): T[] {
  return [...values].sort((left, right) => key(left).localeCompare(key(right)))
}

export function normalizeProfileManifestContent(input: unknown): ProfileManifestContent {
  const manifest = profileManifestContentSchema.parse(input)
  return profileManifestContentSchema.parse({
    ...manifest,
    dependencies: sortByKey(manifest.dependencies, (value) => value.profileId),
    schemas: sortByKey(manifest.schemas, profileBindingKey),
    compilers: sortByKey(manifest.compilers, profileBindingKey),
    recipes: sortByKey(manifest.recipes, profileBindingKey),
    policies: sortByKey(manifest.policies, profileBindingKey),
    evaluators: sortByKey(manifest.evaluators, profileBindingKey),
    renderers: sortByKey(manifest.renderers, profileBindingKey),
    inspectors: sortByKey(manifest.inspectors, profileBindingKey),
    semanticActions: sortByKey(manifest.semanticActions, profileBindingKey),
    deliveries: sortByKey(manifest.deliveries, profileBindingKey),
    migrations: sortByKey(manifest.migrations, profileBindingKey),
    evidenceBenchmarkAdapters: sortByKey(manifest.evidenceBenchmarkAdapters, profileBindingKey),
    outcomeScorecardAdapters: sortByKey(manifest.outcomeScorecardAdapters, profileBindingKey),
    capabilityRequirements: sortByKey(manifest.capabilityRequirements, (value) => value.capabilityId),
    libraryRequirements: sortByKey(manifest.libraryRequirements, (value) => value.itemId),
    requiredRoleClosures: sortByKey(manifest.requiredRoleClosures, (value) => value.id).map((closure) => ({
      ...closure,
      roles: sortByKey(closure.roles, (role) => role.roleId).map((role) => ({
        ...role,
        constraintIds: [...role.constraintIds].sort(),
      })),
    })),
    identityBindings: sortByKey(manifest.identityBindings, (value) => value.id).map((binding) => ({
      ...binding,
      requiredRoleIds: [...binding.requiredRoleIds].sort(),
    })),
  })
}

export async function hashProfileManifestContent(input: unknown): Promise<string> {
  return fingerprint(normalizeProfileManifestContent(input))
}

export async function createDesignProfileManifest(input: unknown): Promise<DesignProfileManifest> {
  const content = normalizeProfileManifestContent(input)
  return designProfileManifestSchema.parse({ ...content, contentHash: await fingerprint(content) })
}

export async function decodeDesignProfileManifest(input: unknown): Promise<DesignProfileManifest> {
  const parsed = designProfileManifestSchema.parse(input)
  const { contentHash, ...content } = parsed
  const normalized = normalizeProfileManifestContent(content)
  if (canonicalJson(content) !== canonicalJson(normalized)) {
    throw new Error(`Profile manifest ${parsed.id}@${parsed.version} is not canonically ordered.`)
  }
  if (await fingerprint(normalized) !== contentHash) {
    throw new Error(`Profile manifest ${parsed.id}@${parsed.version} content hash does not match.`)
  }
  return parsed
}

export function validateRequiredRoleOutputs(input: {
  readonly closure: unknown
  readonly identityBindings: readonly unknown[]
  readonly resolvedBindings: readonly unknown[]
  readonly outputs: readonly unknown[]
}): readonly ProfileRoleOutput[] {
  const closure = requiredRoleClosureSchema.parse(input.closure)
  const identityBindings = input.identityBindings.map((binding) => identityContinuityBindingSchema.parse(binding))
  const resolvedBindings = input.resolvedBindings.map((binding) => resolvedIdentityContinuityBindingSchema.parse(binding))
  const outputs = input.outputs.map((output) => profileRoleOutputSchema.parse(output))
  const failures: string[] = []
  const roleById = new Map(closure.roles.map((role) => [role.roleId, role]))
  const bindingsById = new Map(identityBindings.map((binding) => [binding.id, binding]))
  const resolvedById = new Map<string, ResolvedIdentityContinuityBinding>()

  if (!uniqueBy(identityBindings, (binding) => binding.id)) failures.push('Identity binding ids must be unique.')
  for (const resolved of resolvedBindings) {
    if (resolvedById.has(resolved.bindingId)) failures.push(`Identity binding ${resolved.bindingId} is resolved more than once.`)
    resolvedById.set(resolved.bindingId, resolved)
    const descriptor = bindingsById.get(resolved.bindingId)
    if (!descriptor) failures.push(`Resolved identity binding ${resolved.bindingId} is not declared.`)
    else if (descriptor.sourceKind !== resolved.source.kind) failures.push(`Identity binding ${resolved.bindingId} source kind does not match.`)
  }
  for (const binding of identityBindings) {
    if (!resolvedById.has(binding.id)) failures.push(`Identity binding ${binding.id} is not resolved.`)
  }

  for (const role of closure.roles) {
    const count = outputs.filter((output) => output.roleId === role.roleId).length
    if (count < role.cardinality.minimum) failures.push(`Required role ${role.roleId} is missing.`)
    if (count > role.cardinality.maximum) failures.push(`Required role ${role.roleId} has duplicate outputs.`)
  }
  for (const output of outputs) {
    const role = roleById.get(output.roleId)
    if (!role) {
      failures.push(`Output references unknown role ${output.roleId}.`)
      continue
    }
    if (canonicalJson(output.outcome.schema) !== canonicalJson(role.outputSchema)) {
      failures.push(`Role ${output.roleId} outcome schema does not match its required output schema.`)
    }
    if (canonicalJson(output.artifact.schema) !== canonicalJson(role.outputSchema)) {
      failures.push(`Role ${output.roleId} artifact schema does not match its required output schema.`)
    }
    if (output.observed.roleId !== output.roleId
      || output.observed.outcomeId !== output.outcome.id
      || output.observed.outcomeRevision !== output.outcome.revision
      || output.observed.artifactId !== output.artifact.id
      || output.observed.artifactRevision !== output.artifact.revision
      || canonicalJson(output.observed.outputSchema) !== canonicalJson(output.artifact.schema)
      || output.observed.contentHash !== output.artifact.contentHash) {
      failures.push(`Role ${output.roleId} observed output does not match its declared artifact binding.`)
    }
    const consumedById = new Map(output.consumedLocks.map((lock) => [lock.bindingId, lock]))
    for (const binding of identityBindings.filter((candidate) => candidate.requiredRoleIds.includes(output.roleId))) {
      const resolved = resolvedById.get(binding.id)
      const consumed = consumedById.get(binding.id)
      if (!consumed) {
        failures.push(`Role ${output.roleId} is missing required identity binding ${binding.id}.`)
      } else if (!resolved
        || consumed.lockId !== resolved.lock.id
        || consumed.lockRevision !== resolved.lock.revision
        || consumed.lockContentHash !== resolved.lock.contentHash) {
        failures.push(`Role ${output.roleId} consumes stale identity binding ${binding.id}.`)
      }
    }
    for (const consumed of output.consumedLocks) {
      const descriptor = bindingsById.get(consumed.bindingId)
      if (!descriptor || !descriptor.requiredRoleIds.includes(output.roleId)) {
        failures.push(`Role ${output.roleId} consumes undeclared identity binding ${consumed.bindingId}.`)
      }
    }
  }
  if (failures.length > 0) throw new Error(failures.join(' '))
  return outputs
}
