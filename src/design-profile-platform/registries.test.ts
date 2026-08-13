import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { artifactGraphSchema, evidenceGraphSchema, outcomeNodeSchema } from '@/design-os-kernel/contracts'
import {
  DeliveryRegistry,
  EvaluatorRegistry,
  EvidenceBenchmarkAdapterRegistry,
  InspectorRegistry,
  OutcomeScorecardAdapterRegistry,
  ProfileCompilerRegistry,
  RendererRegistry,
  SemanticActionRegistry,
  createProfileBindingRegistries,
  evidenceBenchmarkProjectionSchema,
  fingerprintTrustedImplementation,
  inspectUnknownArtifact,
} from './registries'
import {
  profileBindingReferenceSchema,
  type ProfileBindingKind,
  type ProfileBindingReference,
} from './contracts'

const digestA = 'a'.repeat(64)
const digestB = 'b'.repeat(64)

function reference(
  kind: ProfileBindingKind,
  id: string,
  implementationHash = digestA,
  required = true,
): ProfileBindingReference {
  return {
    kind,
    id,
    version: '1.0.0',
    implementationHash,
    required,
  } as ProfileBindingReference
}

function registration<Kind extends ProfileBindingKind>(kind: Kind, id: string, implementationHash = digestA) {
  return { kind, id, version: '1.0.0', implementationHash, ownerId: 'cutout:fixture-owner' }
}

describe('Design Profile trusted binding registries', () => {
  it('binds implementation hashes to executable source and runtime schemas', async () => {
    const schema = z.object({ value: z.string() }).strict()
    const first = (value: string) => value.toUpperCase()
    const second = (value: string) => value.toLowerCase()
    const firstHash = await fingerprintTrustedImplementation({
      id: 'implementation:fixture', functions: [first], schemas: [schema], constants: [{ version: 1 }],
    })
    expect(await fingerprintTrustedImplementation({
      id: 'implementation:fixture', functions: [first], schemas: [schema], constants: [{ version: 1 }],
    })).toBe(firstHash)
    expect(await fingerprintTrustedImplementation({
      id: 'implementation:fixture', functions: [second], schemas: [schema], constants: [{ version: 1 }],
    })).not.toBe(firstHash)
    expect(await fingerprintTrustedImplementation({
      id: 'implementation:fixture', functions: [first], schemas: [z.object({ value: z.number() }).strict()], constants: [{ version: 1 }],
    })).not.toBe(firstHash)
  })

  it('registers each typed catalog under exact owner and implementation hash identity', () => {
    const registries = createProfileBindingRegistries()
    const compiler = { compile: () => [] }
    const evaluator = {
      outcomeSchemas: [{ id: 'fixture.outcome', version: 1 }],
      artifactSchemas: [{ id: 'fixture.artifact', version: 1 }],
      inputSchema: z.object({}).strict(),
      evaluate: () => ({ status: 'passed' as const, artifactIds: [], reasons: [] }),
    }
    const presentation = {
      schema: { id: 'fixture.outcome', version: 1 },
      fallbackPriority: 10,
      inputSchema: z.object({ title: z.string() }).strict(),
      project: (input: unknown) => ({
        title: z.object({ title: z.string() }).parse(input).title,
        summary: z.object({ title: z.string() }).parse(input).title,
        metadata: {},
        actionIds: [],
      }),
    }
    const semanticAction = { compile: () => [] }
    const delivery = {
      formatId: 'format:fixture',
      mediaType: 'application/json',
      artifactSchemas: [{ id: 'fixture.artifact', version: 1 }],
      requiredTargetAdapterIds: ['target-adapter:fixture'],
    }
    const evidenceAdapter = {
      profileId: 'profile:fixture',
      ruler: { id: 'ruler:evidence', version: 1, digest: digestA },
      sourceSchema: z.object({ status: z.enum(['passed', 'failed', 'blocked']) }).strict(),
      project: (source: unknown) => ({
        profileId: 'profile:fixture',
        ruler: { id: 'ruler:evidence', version: 1, digest: digestA },
        metrics: [{
          id: 'metric:fixture',
          status: z.object({ status: z.enum(['passed', 'failed', 'blocked']) }).parse(source).status,
          evidenceIds: ['evidence:fixture'],
        }],
      }),
    }
    const scorecardAdapter = {
      profileId: 'profile:fixture',
      ruler: { id: 'ruler:outcome', version: 1, digest: digestB },
      sourceSchema: z.object({ score: z.number().nonnegative() }).strict(),
      project: (source: unknown) => ({
        profileId: 'profile:fixture',
        ruler: { id: 'ruler:outcome', version: 1, digest: digestB },
        criteria: [{
          id: 'criterion:fixture',
          score: z.object({ score: z.number() }).parse(source).score,
          maximumScore: 10,
          evidenceIds: ['evidence:fixture'],
        }],
      }),
    }

    registries.compilers.register({ ...registration('compiler', 'compiler:z'), implementation: compiler })
    registries.compilers.register({ ...registration('compiler', 'compiler:a'), implementation: compiler })
    registries.evaluators.register({ ...registration('evaluator', 'evaluator:fixture'), implementation: evaluator })
    registries.renderers.register({ ...registration('renderer', 'renderer:fixture'), implementation: presentation })
    registries.inspectors.register({ ...registration('inspector', 'inspector:fixture'), implementation: presentation })
    registries.semanticActions.register({ ...registration('semantic-action', 'action:fixture'), implementation: semanticAction })
    registries.delivery.register({ ...registration('delivery', 'delivery:fixture'), implementation: delivery })
    registries.evidenceBenchmarkAdapters.register({
      ...registration('evidence-benchmark-adapter', 'benchmark:fixture'),
      implementation: evidenceAdapter,
    })
    registries.outcomeScorecardAdapters.register({
      ...registration('outcome-scorecard-adapter', 'scorecard:fixture'),
      implementation: scorecardAdapter,
    })

    expect(registries.compilers.registrations().map(({ id }) => id)).toEqual(['compiler:a', 'compiler:z'])
    expect(registries.compilers.require(reference('compiler', 'compiler:a'))).toMatchObject({
      kind: 'compiler',
      id: 'compiler:a',
      version: '1.0.0',
      ownerId: 'cutout:fixture-owner',
      implementationHash: digestA,
      implementation: compiler,
    })
    expect(registries.evaluators.registration('evaluator:fixture', '1.0.0')?.implementation).toBe(evaluator)
    expect(registries.renderers.registration('renderer:fixture', '1.0.0')?.implementation).toBe(presentation)
    expect(registries.inspectors.registration('inspector:fixture', '1.0.0')?.implementation).toBe(presentation)
    expect(registries.semanticActions.registration('action:fixture', '1.0.0')?.implementation).toBe(semanticAction)
    expect(registries.delivery.registration('delivery:fixture', '1.0.0')?.implementation).toEqual(delivery)
    expect(registries.evidenceBenchmarkAdapters.project(
      reference('evidence-benchmark-adapter', 'benchmark:fixture'),
      { status: 'passed' },
    ).metrics[0]?.status).toBe('passed')
    expect(registries.outcomeScorecardAdapters.project(
      reference('outcome-scorecard-adapter', 'scorecard:fixture'),
      { score: 8 },
    ).criteria[0]?.score).toBe(8)
  })

  it('invokes evaluators through strict schema, immutability, and artifact reachability checks', () => {
    const registry = new EvaluatorRegistry()
    let result: {
      status: 'passed' | 'blocked'
      artifactIds: string[]
      reasons: Array<{ code: string, message: string, nodeId: string, dependencyPath: string[], evidence: [] }>
    } = { status: 'passed', artifactIds: [], reasons: [] }
    const evaluate = vi.fn(({ outcome }) => {
      expect(Object.isFrozen(outcome)).toBe(true)
      return result
    })
    registry.register({
      ...registration('evaluator', 'evaluator:strict'),
      implementation: {
        outcomeSchemas: [{ id: 'fixture.outcome', version: 1 }],
        artifactSchemas: [{ id: 'fixture.artifact', version: 1 }],
        inputSchema: z.object({ signal: z.string() }).strict(),
        evaluate,
      },
    })
    const outcome = outcomeNodeSchema.parse({
      id: 'outcome:fixture', revision: 'outcome:1', schema: { id: 'fixture.outcome', version: 1 },
      recipe: { id: 'recipe:fixture', version: 1 }, payload: {}, dependencies: [], state: 'proposed', provenance: [],
    })
    const evidenceGraph = evidenceGraphSchema.parse({
      protocol: 'design-os.protocol.v1', kind: 'evidence-graph', schema: { id: 'design-os.evidence-graph', version: 1 },
      identity: { id: 'evidence:fixture', revision: 'evidence:1' }, provenance: [], body: { nodes: [], edges: [] },
    })
    const artifactGraph = artifactGraphSchema.parse({
      protocol: 'design-os.protocol.v1', kind: 'artifact-graph', schema: { id: 'design-os.artifact-graph', version: 1 },
      identity: { id: 'artifacts:fixture', revision: 'artifacts:1' }, provenance: [], body: { nodes: [], dependencies: [] },
    })
    expect(registry.evaluate(reference('evaluator', 'evaluator:strict'), {
      parameters: { signal: 'valid' }, outcome, evidenceGraph, artifactGraph,
    }).status).toBe('passed')
    expect(() => registry.evaluate(reference('evaluator', 'evaluator:strict'), {
      parameters: { signal: 'valid', extra: true }, outcome, evidenceGraph, artifactGraph,
    })).toThrow()

    result = { status: 'passed', artifactIds: ['artifact:missing'], reasons: [] }
    expect(() => registry.evaluate(reference('evaluator', 'evaluator:strict'), {
      parameters: { signal: 'valid' }, outcome, evidenceGraph, artifactGraph,
    })).toThrow(/absent from the ArtifactGraph/)
    result = {
      status: 'blocked',
      artifactIds: [],
      reasons: [{
        code: 'fixture-blocked', message: 'Blocked fixture.', nodeId: 'outcome:other',
        dependencyPath: ['outcome:other'], evidence: [],
      }],
    }
    expect(() => registry.evaluate(reference('evaluator', 'evaluator:strict'), {
      parameters: { signal: 'valid' }, outcome, evidenceGraph, artifactGraph,
    })).toThrow(/does not belong to Outcome/)
  })

  it('fails closed on duplicate ids and owner or implementation hash drift', () => {
    const registry = new ProfileCompilerRegistry()
    const implementation = { compile: () => [] }
    registry.register({ ...registration('compiler', 'compiler:fixture'), implementation })

    expect(() => registry.register({
      ...registration('compiler', 'compiler:fixture'),
      implementation,
    })).toThrow(/already registered/)
    expect(() => registry.register({
      ...registration('compiler', 'compiler:fixture', digestB),
      implementation,
    })).toThrow(/implementation hash drift/)
    expect(() => registry.require(reference('compiler', 'compiler:fixture', digestB)))
      .toThrow(/implementation hash drift/)
    expect(registry.resolve(reference('compiler', 'compiler:missing', digestA, false))).toBeUndefined()
    expect(() => registry.require(reference('compiler', 'compiler:missing')))
      .toThrow(/Missing trusted binding/)
  })

  it('keeps declarative binding references free of trusted owner and executable implementations', () => {
    expect(profileBindingReferenceSchema.parse(reference('evaluator', 'evaluator:fixture')))
      .toEqual(reference('evaluator', 'evaluator:fixture'))
    expect(() => profileBindingReferenceSchema.parse({
      ...reference('evaluator', 'evaluator:fixture'),
      ownerId: 'profile:forged-owner',
    })).toThrow()
    expect(() => profileBindingReferenceSchema.parse({
      ...reference('evaluator', 'evaluator:fixture'),
      implementation: { evaluate: () => ({ status: 'passed' }) },
    })).toThrow()
    expect(() => profileBindingReferenceSchema.parse(reference('evaluator', '../evaluator')))
      .toThrow(/paths or origins/)
  })

  it('projects unavailable optional bindings as degraded and required bindings as blocked', () => {
    const registry = new RendererRegistry()

    expect(registry.availability(reference('renderer', 'renderer:optional', digestA, false)))
      .toEqual(expect.objectContaining({
        status: 'degraded',
        readOnly: true,
        diagnostic: expect.objectContaining({ code: 'optional-binding-unavailable' }),
      }))
    expect(registry.availability(reference('renderer', 'renderer:required')))
      .toEqual(expect.objectContaining({
        status: 'blocked',
        readOnly: true,
        diagnostic: expect.objectContaining({ code: 'required-binding-unavailable' }),
      }))
  })

  it('retains unknown artifact identity, provenance and raw metadata as read-only', () => {
    const inspection = inspectUnknownArtifact({
      identity: {
        id: 'artifact:unknown',
        revision: 'artifact:unknown:1',
        schema: { id: 'fixture.unknown', version: 7 },
        contentHash: digestA,
      },
      provenance: [{
        sourceId: 'source:unknown',
        revision: 'source:1',
        relation: 'observed-from',
        contentHash: digestA,
      }],
      rawMetadata: { mediaType: 'application/x-fixture', opaqueTag: 'retained' },
    })

    expect(inspection).toEqual(expect.objectContaining({
      status: 'unknown-schema',
      readOnly: true,
      rawMetadata: { mediaType: 'application/x-fixture', opaqueTag: 'retained' },
      diagnostic: expect.objectContaining({ code: 'unknown-artifact-schema' }),
    }))
    expect(inspection.identity.id).toBe('artifact:unknown')
    expect(inspection.provenance).toHaveLength(1)
  })

  it('compiles semantic actions into inert commands without mutating caller state', () => {
    const registry = new SemanticActionRegistry()
    const compile = vi.fn((request) => {
      if (request.parameters && typeof request.parameters === 'object' && !Array.isArray(request.parameters)) {
        request.parameters.changed = true
      }
      return [{
        id: 'command:repair',
        kind: 'request-repair' as const,
        subject: request.subject,
        parameters: { reason: 'failed-evaluation' },
        requiredCapabilityIds: ['capability:repair'],
      }]
    })
    registry.register({
      ...registration('semantic-action', 'action:repair'),
      implementation: { compile },
    })
    const request = {
      subject: { kind: 'outcome' as const, id: 'outcome:fixture', revision: 'outcome:1' },
      parameters: { changed: false },
    }

    const commands = registry.compile(reference('semantic-action', 'action:repair'), request)

    expect(request.parameters).toEqual({ changed: false })
    expect(compile).toHaveBeenCalledOnce()
    expect(commands).toEqual([expect.objectContaining({
      version: 'design-profile.semantic-command.v1',
      id: 'command:repair',
      effect: 'command-only',
      actionBinding: reference('semantic-action', 'action:repair'),
      requiredCapabilityIds: ['capability:repair'],
    })])
    expect(JSON.stringify(commands)).not.toContain('function')
  })

  it('strictly decodes adapter inputs and rejects caller-authored projection fields', () => {
    const project = vi.fn(() => ({
      profileId: 'profile:fixture',
      ruler: { id: 'ruler:evidence', version: 1, digest: digestA },
      metrics: [],
      productionReady: true,
    }))
    const evidence = new EvidenceBenchmarkAdapterRegistry()
    evidence.register({
      ...registration('evidence-benchmark-adapter', 'benchmark:strict'),
      implementation: {
        profileId: 'profile:fixture',
        ruler: { id: 'ruler:evidence', version: 1, digest: digestA },
        sourceSchema: z.object({ id: z.string() }).strict(),
        project,
      },
    })

    expect(() => evidence.project(
      reference('evidence-benchmark-adapter', 'benchmark:strict'),
      { id: 'source', extra: true },
    )).toThrow()
    expect(project).not.toHaveBeenCalled()
    expect(() => evidence.project(
      reference('evidence-benchmark-adapter', 'benchmark:strict'),
      { id: 'source' },
    )).toThrow()

    const drifting = new EvidenceBenchmarkAdapterRegistry()
    drifting.register({
      ...registration('evidence-benchmark-adapter', 'benchmark:drifting'),
      implementation: {
        profileId: 'profile:fixture',
        ruler: { id: 'ruler:evidence', version: 1, digest: digestA },
        sourceSchema: z.object({}).strict(),
        project: () => ({
          profileId: 'profile:other',
          ruler: { id: 'ruler:changed', version: 2, digest: digestB },
          metrics: [],
        }),
      },
    })
    expect(() => drifting.project(reference('evidence-benchmark-adapter', 'benchmark:drifting'), {}))
      .toThrow(/frozen ruler identity/)

    expect(() => evidenceBenchmarkProjectionSchema.parse({
      profileId: 'profile:fixture',
      ruler: { id: 'ruler:evidence', version: 1, digest: digestA },
      metrics: [0, 1].map(() => ({ id: 'metric:duplicate', status: 'passed', evidenceIds: ['evidence:fixture'] })),
    })).toThrow(/metric ids must be unique/)

    expect(new EvaluatorRegistry()).toBeInstanceOf(EvaluatorRegistry)
    expect(new RendererRegistry()).toBeInstanceOf(RendererRegistry)
    expect(new InspectorRegistry()).toBeInstanceOf(InspectorRegistry)
    expect(new DeliveryRegistry()).toBeInstanceOf(DeliveryRegistry)
    expect(new OutcomeScorecardAdapterRegistry()).toBeInstanceOf(OutcomeScorecardAdapterRegistry)
  })
})
