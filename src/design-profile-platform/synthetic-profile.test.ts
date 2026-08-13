import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { fingerprint } from '@/design-ir/fingerprint'
import { artifactGraphSchema, evidenceGraphSchema, outcomeNodeSchema } from '@/design-os-kernel/contracts'
import { SchemaRegistry, registerDomainSchema } from '@/design-os-kernel/registry'
import { createDesignProfileManifest } from './contracts'
import { resolveProfileClosure } from './closure'
import { createProfileBindingRegistries } from './registries'

describe('held-out synthetic Profile conformance', () => {
  it('adds schema, evaluator, renderer, semantic action and delivery only through registered bindings', async () => {
    const hashes = {
      schema: await fingerprint('synthetic.schema.v1'),
      evaluator: await fingerprint('synthetic.evaluator.v1'),
      renderer: await fingerprint('synthetic.renderer.v1'),
      action: await fingerprint('synthetic.action.v1'),
      delivery: await fingerprint('synthetic.delivery.v1'),
    }
    const references = {
      schema: { kind: 'schema' as const, id: 'schema:synthetic-outcome', version: '1.0.0', implementationHash: hashes.schema, required: true },
      evaluator: { kind: 'evaluator' as const, id: 'evaluator:synthetic', version: '1.0.0', implementationHash: hashes.evaluator, required: true },
      renderer: { kind: 'renderer' as const, id: 'renderer:synthetic', version: '1.0.0', implementationHash: hashes.renderer, required: true },
      action: { kind: 'semantic-action' as const, id: 'action:synthetic', version: '1.0.0', implementationHash: hashes.action, required: true },
      delivery: { kind: 'delivery' as const, id: 'delivery:synthetic', version: '1.0.0', implementationHash: hashes.delivery, required: true },
    }
    const manifest = await createDesignProfileManifest({
      protocol: 'design-profile.manifest.v1',
      id: 'profile:held-out-synthetic',
      version: '1.0.0',
      kernelCompatibility: '^1.0.0',
      dependencies: [], schemas: [references.schema], compilers: [], recipes: [], policies: [],
      evaluators: [references.evaluator], renderers: [references.renderer], inspectors: [],
      semanticActions: [references.action], deliveries: [references.delivery], migrations: [],
      evidenceBenchmarkAdapters: [], outcomeScorecardAdapters: [], capabilityRequirements: [],
      libraryRequirements: [], requiredRoleClosures: [], identityBindings: [], fixtures: [],
    })
    const registrations = Object.values(references).map((reference) => ({
      kind: reference.kind,
      id: reference.id,
      version: reference.version,
      implementationHash: reference.implementationHash,
      ownerId: 'cutout:held-out-fixture',
    }))
    const closure = await resolveProfileClosure({
      kernelVersion: '1.2.0',
      rootProfiles: [{ profileId: manifest.id, version: manifest.version, contentHash: manifest.contentHash }],
      availableManifests: [manifest], registrations, libraryLocks: [],
    })
    const registries = createProfileBindingRegistries()
    const payloadSchema = z.object({ signal: z.string().min(1) }).strict()
    const schemaRegistry = new SchemaRegistry()
    registerDomainSchema(schemaRegistry, {
      reference: { id: 'synthetic.outcome', version: 1 },
      category: 'outcome',
      canonicalOwner: 'cutout:held-out-fixture',
      schema: payloadSchema,
    })
    const registration = (kind: string) => registrations.find((candidate) => candidate.kind === kind)!
    registries.evaluators.register({
      ...registration('evaluator'), kind: 'evaluator',
      implementation: {
        outcomeSchemas: [{ id: 'synthetic.outcome', version: 1 }],
        artifactSchemas: [{ id: 'synthetic.artifact', version: 1 }],
        inputSchema: payloadSchema,
        evaluate: () => ({ status: 'passed', artifactIds: [], reasons: [] }),
      },
    })
    registries.renderers.register({
      ...registration('renderer'), kind: 'renderer',
      implementation: {
        schema: { id: 'synthetic.outcome', version: 1 }, fallbackPriority: 1, inputSchema: payloadSchema,
        project: (input) => ({
          title: payloadSchema.parse(input).signal,
          summary: 'Held-out Profile projection.',
          metadata: { heldOut: true },
          actionIds: [references.action.id],
        }),
      },
    })
    registries.semanticActions.register({
      ...registration('semantic-action'), kind: 'semantic-action',
      implementation: { compile: (request) => [{
        id: 'command:synthetic-repair', kind: 'request-repair', subject: request.subject,
        parameters: request.parameters, requiredCapabilityIds: [],
      }] },
    })
    registries.delivery.register({
      ...registration('delivery'), kind: 'delivery',
      implementation: {
        formatId: 'synthetic.delivery.v1', mediaType: 'application/json',
        artifactSchemas: [{ id: 'synthetic.artifact', version: 1 }], requiredTargetAdapterIds: [],
      },
    })
    const outcome = outcomeNodeSchema.parse({
      id: 'outcome:synthetic', revision: 'outcome:1', schema: { id: 'synthetic.outcome', version: 1 },
      recipe: { id: 'synthetic.recipe', version: 1 }, payload: { signal: 'Synthetic' },
      dependencies: [], state: 'proposed', provenance: [],
    })
    const evaluation = registries.evaluators.evaluate(references.evaluator, {
      parameters: { signal: 'Synthetic' }, outcome,
      evidenceGraph: evidenceGraphSchema.parse({
        protocol: 'design-os.protocol.v1', kind: 'evidence-graph',
        schema: { id: 'design-os.evidence-graph', version: 1 },
        identity: { id: 'evidence:synthetic', revision: 'evidence:1' }, provenance: [],
        body: { nodes: [], edges: [] },
      }),
      artifactGraph: artifactGraphSchema.parse({
        protocol: 'design-os.protocol.v1', kind: 'artifact-graph',
        schema: { id: 'design-os.artifact-graph', version: 1 },
        identity: { id: 'artifacts:synthetic', revision: 'artifacts:1' }, provenance: [],
        body: { nodes: [], dependencies: [] },
      }),
    })

    expect(closure.manifests[0]?.id).toBe('profile:held-out-synthetic')
    expect(schemaRegistry.parse({ id: 'synthetic.outcome', version: 1 }, { signal: 'Synthetic' }))
      .toEqual({ signal: 'Synthetic' })
    expect(evaluation.status).toBe('passed')
    expect(registries.renderers.project(references.renderer, { signal: 'Synthetic' }).title).toBe('Synthetic')
    expect(registries.semanticActions.compile(references.action, {
      subject: { kind: 'outcome', id: outcome.id, revision: outcome.revision }, parameters: {},
    })[0]?.effect).toBe('command-only')
    expect(registries.delivery.require(references.delivery).implementation.formatId).toBe('synthetic.delivery.v1')
  })
})
