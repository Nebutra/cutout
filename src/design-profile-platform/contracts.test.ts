import { describe, expect, it } from 'vitest'
import {
  DESIGN_PROFILE_MANIFEST_PROTOCOL,
  createDesignProfileManifest,
  decodeDesignProfileManifest,
  designProfileManifestSchema,
  profileBindingReferenceSchema,
  validateRequiredRoleOutputs,
  type IdentityContinuityBinding,
  type ProfileManifestContent,
  type ProfileRoleOutput,
  type RequiredRoleClosure,
  type ResolvedIdentityContinuityBinding,
} from './contracts'

const digestA = 'a'.repeat(64)
const digestB = 'b'.repeat(64)
const digestC = 'c'.repeat(64)

function manifestContent(overrides: Partial<ProfileManifestContent> = {}): ProfileManifestContent {
  return {
    protocol: DESIGN_PROFILE_MANIFEST_PROTOCOL,
    id: 'profile:fixture',
    version: '1.0.0',
    kernelCompatibility: '^1.0.0',
    dependencies: [],
    schemas: [{
      kind: 'schema',
      id: 'schema:fixture-output',
      version: '1.0.0',
      implementationHash: digestA,
      required: true,
    }],
    compilers: [{
      kind: 'compiler',
      id: 'compiler:fixture',
      version: '1.0.0',
      implementationHash: digestB,
      required: true,
    }],
    recipes: [],
    policies: [],
    evaluators: [{
      kind: 'evaluator',
      id: 'evaluator:fixture',
      version: '1.0.0',
      implementationHash: digestC,
      required: true,
    }],
    renderers: [],
    inspectors: [],
    semanticActions: [],
    deliveries: [],
    migrations: [],
    evidenceBenchmarkAdapters: [],
    outcomeScorecardAdapters: [],
    capabilityRequirements: [],
    libraryRequirements: [],
    requiredRoleClosures: [{
      id: 'roles:fixture',
      roles: [{
        roleId: 'role:primary',
        outputSchema: { id: 'fixture.output', version: 1 },
        cardinality: { minimum: 1, maximum: 1 },
        constraintIds: ['constraint:identity'],
      }],
    }],
    identityBindings: [{
      id: 'binding:identity',
      kind: 'identity',
      sourceKind: 'project-evidence',
      requiredRoleIds: ['role:primary'],
      evaluatorBindingId: 'evaluator:fixture',
    }],
    ...overrides,
  }
}

const roleClosure: RequiredRoleClosure = {
  id: 'roles:fixture',
  roles: [{
    roleId: 'role:primary',
    outputSchema: { id: 'fixture.output', version: 1 },
    cardinality: { minimum: 1, maximum: 1 },
    constraintIds: [],
  }],
}

const identityBinding: IdentityContinuityBinding = {
  id: 'binding:identity',
  kind: 'identity',
  sourceKind: 'project-evidence',
  requiredRoleIds: ['role:primary'],
  evaluatorBindingId: 'evaluator:fixture',
}

const resolvedBinding: ResolvedIdentityContinuityBinding = {
  bindingId: 'binding:identity',
  source: {
    kind: 'project-evidence',
    id: 'evidence:identity',
    revision: 'evidence:1',
    contentHash: digestA,
  },
  lock: { id: 'lock:identity', revision: 'lock:1', contentHash: digestB },
}

function roleOutput(overrides: Partial<ProfileRoleOutput> = {}): ProfileRoleOutput {
  return {
    roleId: 'role:primary',
    outcome: {
      id: 'outcome:primary',
      revision: 'outcome:1',
      schema: { id: 'fixture.output', version: 1 },
    },
    artifact: {
      id: 'artifact:primary',
      revision: 'artifact:1',
      schema: { id: 'fixture.output', version: 1 },
      contentHash: digestC,
    },
    observed: {
      roleId: 'role:primary',
      outcomeId: 'outcome:primary',
      outcomeRevision: 'outcome:1',
      artifactId: 'artifact:primary',
      artifactRevision: 'artifact:1',
      outputSchema: { id: 'fixture.output', version: 1 },
      contentHash: digestC,
    },
    consumedLocks: [{
      bindingId: 'binding:identity',
      lockId: 'lock:identity',
      lockRevision: 'lock:1',
      lockContentHash: digestB,
    }],
    ...overrides,
  }
}

describe('Design Profile manifest contracts', () => {
  it('uses exact declarative binding vocabulary and reserves ownerId for trusted registrations', () => {
    const reference = manifestContent().compilers[0]!
    expect(profileBindingReferenceSchema.parse(reference)).toEqual({
      kind: 'compiler',
      id: 'compiler:fixture',
      version: '1.0.0',
      implementationHash: digestB,
      required: true,
    })
    expect(() => profileBindingReferenceSchema.parse({ ...reference, ownerId: 'profile:forged' })).toThrow()
    expect(() => profileBindingReferenceSchema.parse({ ...reference, required: 'required' })).toThrow()
    expect(() => profileBindingReferenceSchema.parse({ ...reference, digest: digestB })).toThrow()
    expect(() => profileBindingReferenceSchema.parse({ ...reference, kind: 'generator' })).toThrow()
    expect(() => profileBindingReferenceSchema.parse({ ...reference, kind: 'presentation' })).toThrow()
  })

  it('creates canonical hashes and rejects tampered, reordered, or unknown-newer manifests', async () => {
    const content = manifestContent({
      schemas: [...manifestContent().schemas].reverse(),
      compilers: [...manifestContent().compilers].reverse(),
    })
    const manifest = await createDesignProfileManifest(content)
    expect(await decodeDesignProfileManifest(manifest)).toEqual(manifest)

    await expect(decodeDesignProfileManifest({ ...manifest, contentHash: digestA }))
      .rejects.toThrow(/content hash does not match/)
    await expect(decodeDesignProfileManifest({ ...manifest, protocol: 'design-profile.manifest.v2' }))
      .rejects.toThrow()

    const twoSchemaManifest = await createDesignProfileManifest(manifestContent({
      schemas: [
        { kind: 'schema', id: 'schema:a', version: '1.0.0', implementationHash: digestA, required: true },
        { kind: 'schema', id: 'schema:z', version: '1.0.0', implementationHash: digestB, required: true },
      ],
    }))
    await expect(decodeDesignProfileManifest({
      ...twoSchemaManifest,
      schemas: [...twoSchemaManifest.schemas].reverse(),
    })).rejects.toThrow(/not canonically ordered/)
  })

  it('rejects duplicate identities and embedded executable, authority, path, origin, or credential fields', () => {
    const valid = manifestContent()
    expect(() => designProfileManifestSchema.parse({ ...valid, contentHash: digestA, command: 'run-provider' })).toThrow()
    expect(() => designProfileManifestSchema.parse({ ...valid, contentHash: digestA, approval: true })).toThrow()
    expect(() => designProfileManifestSchema.parse({ ...valid, contentHash: digestA, outputPath: '/tmp/output' })).toThrow()
    expect(() => designProfileManifestSchema.parse({ ...valid, contentHash: digestA, origin: 'https://example.test' })).toThrow()
    expect(() => designProfileManifestSchema.parse({
      ...valid,
      contentHash: digestA,
      capabilityRequirements: [{ capabilityId: 'capability:fixture', required: true, reason: 'api_key=secret-value' }],
    })).toThrow(/credential-shaped data/)
    for (const reason of [
      'Fetch from https://example.test/profile.json',
      'Write generated data to /tmp/profile-output',
      'Run `curl example.test` before evaluation',
      'approval=true',
      'Approval granted by the Profile owner.',
      'Execute the following command after installation.',
    ]) {
      expect(() => designProfileManifestSchema.parse({
        ...valid,
        contentHash: digestA,
        capabilityRequirements: [{ capabilityId: 'capability:fixture', required: true, reason }],
      })).toThrow(/cannot embed/)
    }
    expect(() => designProfileManifestSchema.parse({
      ...valid,
      contentHash: digestA,
      compilers: [...valid.compilers, valid.compilers[0]],
    })).toThrow(/binding references must be unique/)
    expect(() => designProfileManifestSchema.parse({
      ...valid,
      contentHash: digestA,
      requiredRoleClosures: [{
        ...valid.requiredRoleClosures[0]!,
        roles: [valid.requiredRoleClosures[0]!.roles[0]!, valid.requiredRoleClosures[0]!.roles[0]!],
      }],
    })).toThrow(/duplicate role ids/)
    expect(() => designProfileManifestSchema.parse({
      ...valid,
      contentHash: digestA,
      requiredRoleClosures: [{
        id: 'roles:path',
        roles: [{
          roleId: 'role:path',
          outputSchema: { id: 'https://example.test/schema', version: 1 },
          cardinality: { minimum: 1, maximum: 1 },
          constraintIds: [],
        }],
      }],
      identityBindings: [],
    })).toThrow(/paths or origins/)
  })
})

describe('required-role and identity-lock closure', () => {
  const validate = (outputs: readonly ProfileRoleOutput[], input: {
    identityBindings?: readonly IdentityContinuityBinding[]
    resolvedBindings?: readonly ResolvedIdentityContinuityBinding[]
  } = {}) => validateRequiredRoleOutputs({
    closure: roleClosure,
    identityBindings: input.identityBindings ?? [identityBinding],
    resolvedBindings: input.resolvedBindings ?? [resolvedBinding],
    outputs,
  })

  it('accepts the exact observed output and resolved lock closure', () => {
    const output = roleOutput()
    expect(validate([output])).toEqual([output])
  })

  it('rejects missing and duplicate role outputs', () => {
    expect(() => validate([])).toThrow(/Required role role:primary is missing/)
    expect(() => validate([roleOutput(), roleOutput({
      artifact: { ...roleOutput().artifact, id: 'artifact:duplicate' },
    })])).toThrow(/duplicate outputs/)
  })

  it('rejects unresolved, stale, missing, and undeclared lock consumption', () => {
    expect(() => validate([roleOutput()], { resolvedBindings: [] })).toThrow(/is not resolved/)
    expect(() => validate([roleOutput({ consumedLocks: [] })])).toThrow(/missing required identity binding/)
    expect(() => validate([roleOutput({
      consumedLocks: [{
        ...roleOutput().consumedLocks[0]!,
        lockContentHash: digestA,
      }],
    })])).toThrow(/consumes stale identity binding/)
    expect(() => validate([roleOutput({
      consumedLocks: [{
        bindingId: 'binding:undeclared',
        lockId: 'lock:undeclared',
        lockRevision: 'lock:1',
        lockContentHash: digestA,
      }],
    })])).toThrow(/undeclared identity binding/)
  })

  it('rejects outcome, artifact, and observed-output mismatches', () => {
    expect(() => validate([roleOutput({
      outcome: { ...roleOutput().outcome, schema: { id: 'fixture.other', version: 1 } },
    })])).toThrow(/outcome schema does not match/)
    expect(() => validate([roleOutput({
      artifact: { ...roleOutput().artifact, schema: { id: 'fixture.other', version: 1 } },
    })])).toThrow(/artifact schema does not match/)
    expect(() => validate([roleOutput({
      observed: { ...roleOutput().observed, artifactRevision: 'artifact:stale' },
    })])).toThrow(/observed output does not match/)
  })
})
