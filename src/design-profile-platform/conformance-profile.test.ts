import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { canonicalJson } from '@/design-ir/fingerprint'
import { artifactGraphSchema, evidenceGraphSchema, jsonValueSchema, outcomeNodeSchema } from '@/design-os-kernel/contracts'
import { SchemaRegistry, registerDomainSchema } from '@/design-os-kernel/registry'
import { createDesignProfileManifest } from './contracts'
import { resolveProfileClosure } from './closure'
import { createProfileBindingRegistries, fingerprintTrustedImplementation } from './registries'

const payloadSchema = z.object({ signal: z.string().min(1) }).strict()

function evaluateConformanceProfile(input: {
  readonly parameters: unknown
  readonly outcome: z.infer<typeof outcomeNodeSchema>
}) {
  const parameters = payloadSchema.parse(input.parameters)
  const outcomePayload = payloadSchema.safeParse(input.outcome.payload)
  if (!outcomePayload.success || canonicalJson(parameters) !== canonicalJson(outcomePayload.data)) {
    return {
      status: 'blocked' as const,
      artifactIds: [],
      reasons: [{
        code: 'conformance-payload-drift',
        message: 'Evaluator parameters do not match the exact Outcome payload.',
        nodeId: input.outcome.id,
        dependencyPath: [input.outcome.id],
        evidence: [
          { key: 'parameters', value: parameters },
          { key: 'outcomePayload', value: input.outcome.payload },
        ],
      }],
    }
  }
  return { status: 'passed' as const, artifactIds: [], reasons: [] }
}

function projectConformanceProfile(input: unknown) {
  return {
    title: payloadSchema.parse(input).signal,
    summary: 'Contract conformance Profile projection.',
    metadata: { evidenceClass: 'contract-conformance' },
    actionIds: ['action:conformance-profile'],
  }
}

function compileConformanceRepair(request: { readonly subject: { readonly kind: 'outcome' | 'artifact' | 'project', readonly id: string, readonly revision?: string }, readonly parameters: unknown }) {
  return [{
    id: 'command:conformance-repair', kind: 'request-repair' as const, subject: request.subject,
    parameters: jsonValueSchema.parse(request.parameters), requiredCapabilityIds: [],
  }]
}

describe('held-out Profile contract conformance', () => {
  it('adds schema, evaluator, renderer, semantic action and delivery only through registered bindings', async () => {
    const hashes = {
      schema: await fingerprintTrustedImplementation({ id: 'implementation:conformance-schema', schemas: [payloadSchema] }),
      evaluator: await fingerprintTrustedImplementation({ id: 'implementation:conformance-evaluator', functions: [evaluateConformanceProfile], schemas: [payloadSchema] }),
      renderer: await fingerprintTrustedImplementation({ id: 'implementation:conformance-renderer', functions: [projectConformanceProfile], schemas: [payloadSchema] }),
      action: await fingerprintTrustedImplementation({ id: 'implementation:conformance-action', functions: [compileConformanceRepair] }),
      delivery: await fingerprintTrustedImplementation({
        id: 'implementation:conformance-delivery',
        constants: [{ formatId: 'conformance.delivery.v1', mediaType: 'application/json', artifactSchemas: [{ id: 'conformance.artifact', version: 1 }], requiredTargetAdapterIds: [] }],
      }),
    }
    const references = {
      schema: { kind: 'schema' as const, id: 'schema:conformance-outcome', version: '1.0.0', implementationHash: hashes.schema, required: true },
      evaluator: { kind: 'evaluator' as const, id: 'evaluator:conformance-profile', version: '1.0.0', implementationHash: hashes.evaluator, required: true },
      renderer: { kind: 'renderer' as const, id: 'renderer:conformance-profile', version: '1.0.0', implementationHash: hashes.renderer, required: true },
      action: { kind: 'semantic-action' as const, id: 'action:conformance-profile', version: '1.0.0', implementationHash: hashes.action, required: true },
      delivery: { kind: 'delivery' as const, id: 'delivery:conformance-profile', version: '1.0.0', implementationHash: hashes.delivery, required: true },
    }
    const manifest = await createDesignProfileManifest({
      protocol: 'design-profile.manifest.v1',
      id: 'profile:held-out-conformance',
      version: '1.0.0',
      kernelCompatibility: '^1.0.0',
      dependencies: [], schemas: [references.schema], compilers: [], recipes: [], policies: [],
      evaluators: [references.evaluator], renderers: [references.renderer], inspectors: [],
      semanticActions: [references.action], deliveries: [references.delivery], migrations: [],
      evidenceBenchmarkAdapters: [], outcomeScorecardAdapters: [], capabilityRequirements: [],
      libraryRequirements: [], requiredRoleClosures: [], identityBindings: [],
    })
    const registrations = Object.values(references).map((reference) => ({
      kind: reference.kind,
      id: reference.id,
      version: reference.version,
      implementationHash: reference.implementationHash,
      ownerId: 'cutout:held-out-conformance',
    }))
    const closure = await resolveProfileClosure({
      kernelVersion: '1.2.0',
      rootProfiles: [{ profileId: manifest.id, version: manifest.version, contentHash: manifest.contentHash }],
      availableManifests: [manifest], registrations, libraryLocks: [],
    })
    const registries = createProfileBindingRegistries()
    const schemaRegistry = new SchemaRegistry()
    registerDomainSchema(schemaRegistry, {
      reference: { id: 'conformance.outcome', version: 1 },
      category: 'outcome',
      canonicalOwner: 'cutout:held-out-conformance',
      schema: payloadSchema,
    })
    const registration = (kind: string) => registrations.find((candidate) => candidate.kind === kind)!
    registries.evaluators.register({
      ...registration('evaluator'), kind: 'evaluator',
      implementation: {
        outcomeSchemas: [{ id: 'conformance.outcome', version: 1 }],
        artifactSchemas: [{ id: 'conformance.artifact', version: 1 }],
        inputSchema: payloadSchema,
        evaluate: evaluateConformanceProfile,
      },
    })
    registries.renderers.register({
      ...registration('renderer'), kind: 'renderer',
      implementation: {
        schema: { id: 'conformance.outcome', version: 1 }, fallbackPriority: 1, inputSchema: payloadSchema,
        project: projectConformanceProfile,
      },
    })
    registries.semanticActions.register({
      ...registration('semantic-action'), kind: 'semantic-action',
      implementation: { compile: compileConformanceRepair },
    })
    registries.delivery.register({
      ...registration('delivery'), kind: 'delivery',
      implementation: {
        formatId: 'conformance.delivery.v1', mediaType: 'application/json',
        artifactSchemas: [{ id: 'conformance.artifact', version: 1 }], requiredTargetAdapterIds: [],
      },
    })
    const outcome = outcomeNodeSchema.parse({
      id: 'outcome:conformance', revision: 'outcome:1', schema: { id: 'conformance.outcome', version: 1 },
      recipe: { id: 'conformance.recipe', version: 1 }, payload: { signal: 'Conformance' },
      dependencies: [], state: 'proposed', provenance: [],
    })
    const evaluation = registries.evaluators.evaluate(references.evaluator, {
      parameters: { signal: 'Conformance' }, outcome,
      evidenceGraph: evidenceGraphSchema.parse({
        protocol: 'design-os.protocol.v1', kind: 'evidence-graph',
        schema: { id: 'design-os.evidence-graph', version: 1 },
        identity: { id: 'evidence:conformance', revision: 'evidence:1' }, provenance: [],
        body: { nodes: [], edges: [] },
      }),
      artifactGraph: artifactGraphSchema.parse({
        protocol: 'design-os.protocol.v1', kind: 'artifact-graph',
        schema: { id: 'design-os.artifact-graph', version: 1 },
        identity: { id: 'artifacts:conformance', revision: 'artifacts:1' }, provenance: [],
        body: { nodes: [], dependencies: [] },
      }),
    })

    expect(closure.manifests[0]?.id).toBe('profile:held-out-conformance')
    expect(schemaRegistry.parse({ id: 'conformance.outcome', version: 1 }, { signal: 'Conformance' }))
      .toEqual({ signal: 'Conformance' })
    expect(evaluation.status).toBe('passed')
    expect(registries.evaluators.evaluate(references.evaluator, {
      parameters: { signal: 'Drifted' }, outcome,
      evidenceGraph: evidenceGraphSchema.parse({
        protocol: 'design-os.protocol.v1', kind: 'evidence-graph',
        schema: { id: 'design-os.evidence-graph', version: 1 },
        identity: { id: 'evidence:conformance', revision: 'evidence:1' }, provenance: [],
        body: { nodes: [], edges: [] },
      }),
      artifactGraph: artifactGraphSchema.parse({
        protocol: 'design-os.protocol.v1', kind: 'artifact-graph',
        schema: { id: 'design-os.artifact-graph', version: 1 },
        identity: { id: 'artifacts:conformance', revision: 'artifacts:1' }, provenance: [],
        body: { nodes: [], dependencies: [] },
      }),
    })).toEqual(expect.objectContaining({
      status: 'blocked',
      reasons: [expect.objectContaining({ code: 'conformance-payload-drift', nodeId: outcome.id })],
    }))
    expect(registries.renderers.project(references.renderer, { signal: 'Conformance' }).title).toBe('Conformance')
    expect(registries.semanticActions.compile(references.action, {
      subject: { kind: 'outcome', id: outcome.id, revision: outcome.revision }, parameters: {},
    })[0]?.effect).toBe('command-only')
    expect(registries.delivery.require(references.delivery).implementation.formatId).toBe('conformance.delivery.v1')
  })
})
