import { describe, expect, it } from 'vitest'
import { fingerprint } from '@/design-ir/fingerprint'
import {
  DESIGN_PROFILE_CLOSURE_PROTOCOL,
  DESIGN_PROFILE_MANIFEST_PROTOCOL,
  createDesignProfileManifest,
  type DesignProfileManifest,
  type ProfileBindingKind,
  type ProfileBindingReference,
  type ProfileDependencyReference,
  type ProfileManifestContent,
  type RegisteredProfileBinding,
} from './contracts'
import {
  decodeProfileClosure,
  kernelVersionSatisfiesRange,
  resolveProfileClosure,
} from './closure'

const digestA = 'a'.repeat(64)
const digestB = 'b'.repeat(64)
const digestC = 'c'.repeat(64)

function binding(
  kind: ProfileBindingKind,
  id: string,
  implementationHash: string,
  required = true,
): ProfileBindingReference {
  return { kind, id, version: '1.0.0', implementationHash, required } as ProfileBindingReference
}

function registration(reference: ProfileBindingReference, ownerId = 'cutout:platform'): RegisteredProfileBinding {
  return {
    kind: reference.kind,
    id: reference.id,
    version: reference.version,
    implementationHash: reference.implementationHash,
    ownerId,
  }
}

function manifestContent(input: {
  id: string
  dependencies?: readonly ProfileDependencyReference[]
  kernelCompatibility?: string
  compiler?: ProfileBindingReference
  renderer?: ProfileBindingReference
  libraryHash?: string
}): ProfileManifestContent {
  return {
    protocol: DESIGN_PROFILE_MANIFEST_PROTOCOL,
    id: input.id,
    version: '1.0.0',
    kernelCompatibility: input.kernelCompatibility ?? '^1.0.0',
    dependencies: [...(input.dependencies ?? [])],
    schemas: [],
    compilers: input.compiler ? [input.compiler as Extract<ProfileBindingReference, { kind: 'compiler' }>] : [],
    recipes: [],
    policies: [],
    evaluators: [],
    renderers: input.renderer ? [input.renderer as Extract<ProfileBindingReference, { kind: 'renderer' }>] : [],
    inspectors: [],
    semanticActions: [],
    deliveries: [],
    migrations: [],
    evidenceBenchmarkAdapters: [],
    outcomeScorecardAdapters: [],
    capabilityRequirements: [],
    libraryRequirements: input.libraryHash
      ? [{ itemId: 'library:shared', version: '1.0.0', contentHash: input.libraryHash }]
      : [],
    requiredRoleClosures: [],
    identityBindings: [],
    fixtures: [],
  }
}

function reference(manifest: DesignProfileManifest): ProfileDependencyReference {
  return { profileId: manifest.id, version: manifest.version, contentHash: manifest.contentHash }
}

async function fixture() {
  const dependencyCompiler = binding('compiler', 'compiler:dependency', digestA)
  const rootCompiler = binding('compiler', 'compiler:root', digestB)
  const optionalRenderer = binding('renderer', 'renderer:optional', digestC, false)
  const dependency = await createDesignProfileManifest(manifestContent({
    id: 'profile:dependency',
    compiler: dependencyCompiler,
    libraryHash: digestA,
  }))
  const root = await createDesignProfileManifest(manifestContent({
    id: 'profile:root',
    dependencies: [reference(dependency)],
    compiler: rootCompiler,
    renderer: optionalRenderer,
  }))
  return {
    dependency,
    root,
    rootReference: reference(root),
    dependencyCompiler,
    rootCompiler,
    optionalRenderer,
    registrations: [registration(rootCompiler), registration(dependencyCompiler)],
    locks: [{ itemId: 'library:shared', version: '1.0.0', contentHash: digestA }],
  }
}

describe('Profile closure resolution', () => {
  it('resolves the exact reachable closure canonically and independently of installation order', async () => {
    const value = await fixture()
    const forward = await resolveProfileClosure({
      kernelVersion: '1.2.3',
      rootProfiles: [value.rootReference],
      availableManifests: [value.root, value.dependency],
      registrations: value.registrations,
      libraryLocks: value.locks,
    })
    const reverse = await resolveProfileClosure({
      kernelVersion: '1.2.3',
      rootProfiles: [value.rootReference],
      availableManifests: [value.dependency, value.root],
      registrations: [...value.registrations].reverse(),
      libraryLocks: value.locks,
    })

    expect(reverse).toEqual(forward)
    expect(forward.protocol).toBe(DESIGN_PROFILE_CLOSURE_PROTOCOL)
    expect(forward.manifests.map(({ id }) => id)).toEqual(['profile:dependency', 'profile:root'])
    expect(forward.registrations.map(({ id }) => id)).toEqual(['compiler:dependency', 'compiler:root'])
    expect(forward.registrations).not.toContainEqual(expect.objectContaining({ id: 'renderer:optional' }))
    expect(Object.isFrozen(forward)).toBe(true)
    expect(Object.isFrozen(forward.manifests[0])).toBe(true)
    await expect(decodeProfileClosure(structuredClone(forward))).resolves.toEqual(forward)
  })

  it('rejects missing, conflicting, incompatible, and stale dependencies or bindings', async () => {
    const value = await fixture()
    const resolve = (overrides: Partial<Parameters<typeof resolveProfileClosure>[0]> = {}) => resolveProfileClosure({
      kernelVersion: '1.2.3',
      rootProfiles: [value.rootReference],
      availableManifests: [value.root, value.dependency],
      registrations: value.registrations,
      libraryLocks: value.locks,
      ...overrides,
    })

    await expect(resolve({ availableManifests: [value.root] })).rejects.toThrow(/dependency .* is missing/)
    await expect(resolve({ registrations: [registration(value.rootCompiler)] }))
      .rejects.toThrow(/Required Profile binding .* is missing/)
    await expect(resolve({ registrations: [
      registration(value.rootCompiler),
      registration({ ...value.dependencyCompiler, implementationHash: digestB }),
    ] })).rejects.toThrow(/conflicting implementation hash/)
    await expect(resolve({ libraryLocks: [] })).rejects.toThrow(/Library lock .* is missing or stale/)
    await expect(resolve({ kernelVersion: '2.0.0' })).rejects.toThrow(/incompatible with Kernel/)
    await expect(resolve({ rootProfiles: [{ ...value.rootReference, contentHash: digestC }] }))
      .rejects.toThrow(/missing or has a conflicting hash/)
  })

  it('rejects dependency cycles and conflicting selected Profile versions', async () => {
    const first = {
      ...(await createDesignProfileManifest(manifestContent({ id: 'profile:first' }))),
      dependencies: [{ profileId: 'profile:second', version: '1.0.0', contentHash: digestA }],
      contentHash: digestB,
    }
    const second = {
      ...(await createDesignProfileManifest(manifestContent({ id: 'profile:second' }))),
      dependencies: [{ profileId: 'profile:first', version: '1.0.0', contentHash: digestB }],
      contentHash: digestA,
    }
    await expect(resolveProfileClosure({
      kernelVersion: '1.0.0',
      rootProfiles: [{ profileId: 'profile:first', version: '1.0.0', contentHash: digestB }],
      availableManifests: [first, second],
      registrations: [],
      libraryLocks: [],
    })).rejects.toThrow(/dependency cycle/)

    const versionOne = await createDesignProfileManifest(manifestContent({ id: 'profile:shared' }))
    const versionTwo = await createDesignProfileManifest({
      ...manifestContent({ id: 'profile:shared' }),
      version: '2.0.0',
    })
    await expect(resolveProfileClosure({
      kernelVersion: '1.0.0',
      rootProfiles: [reference(versionOne), reference(versionTwo)],
      availableManifests: [versionOne, versionTwo],
      registrations: [],
      libraryLocks: [],
    })).rejects.toThrow(/Conflicting Profile versions selected/)
  })

  it('rejects tampered, noncanonical, unreachable, and unknown-newer stored closures', async () => {
    const value = await fixture()
    const closure = await resolveProfileClosure({
      kernelVersion: '1.2.3',
      rootProfiles: [value.rootReference],
      availableManifests: [value.root, value.dependency],
      registrations: value.registrations,
      libraryLocks: value.locks,
    })

    await expect(decodeProfileClosure({ ...closure, closureHash: digestA }))
      .rejects.toThrow(/closure hash does not match/)
    await expect(decodeProfileClosure({ ...closure, protocol: 'design-profile.closure.v2' })).rejects.toThrow()
    await expect(decodeProfileClosure({ ...closure, manifests: [...closure.manifests].reverse() }))
      .rejects.toThrow(/not canonically ordered/)

    const unreachable = await createDesignProfileManifest(manifestContent({ id: 'profile:unreachable' }))
    const withUnreachable = {
      ...closure,
      manifests: [...closure.manifests, unreachable],
    }
    await expect(decodeProfileClosure({
      ...withUnreachable,
      closureHash: await fingerprint({
        protocol: withUnreachable.protocol,
        kernelVersion: withUnreachable.kernelVersion,
        rootProfiles: withUnreachable.rootProfiles,
        manifests: withUnreachable.manifests,
        registrations: withUnreachable.registrations,
        libraryLocks: withUnreachable.libraryLocks,
      }),
    })).rejects.toThrow(/unreachable manifest/)
  })

  it('implements exact, caret, tilde, and comparator Kernel ranges', () => {
    expect(kernelVersionSatisfiesRange('1.2.3', '1.2.3')).toBe(true)
    expect(kernelVersionSatisfiesRange('1.9.9', '^1.2.3')).toBe(true)
    expect(kernelVersionSatisfiesRange('2.0.0', '^1.2.3')).toBe(false)
    expect(kernelVersionSatisfiesRange('0.2.9', '^0.2.3')).toBe(true)
    expect(kernelVersionSatisfiesRange('0.3.0', '^0.2.3')).toBe(false)
    expect(kernelVersionSatisfiesRange('1.2.9', '~1.2.3')).toBe(true)
    expect(kernelVersionSatisfiesRange('1.3.0', '~1.2.3')).toBe(false)
    expect(kernelVersionSatisfiesRange('1.5.0', '>=1.2.0 <2.0.0')).toBe(true)
  })
})
