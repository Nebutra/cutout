import { describe, expect, it } from 'vitest'
import {
  DESIGN_PROFILE_MANIFEST_PROTOCOL,
  createDesignProfileManifest,
  type ProfileManifestContent,
} from './contracts'
import { resolveProfileClosure } from './closure'
import {
  assertProfileLifecycleChangeSet,
  createProfileProjectBundle,
  createProfileProjectRecord,
  decodeProfileProjectBundle,
  decodeProfileProjectRecord,
  previewProfileLifecycle,
  profileReferenceFromClosure,
} from './lifecycle'

const digestA = 'a'.repeat(64)
const digestB = 'b'.repeat(64)

function content(id: string, version: string, input: {
  capabilityRequired?: boolean
  migration?: boolean
} = {}): ProfileManifestContent {
  return {
    protocol: DESIGN_PROFILE_MANIFEST_PROTOCOL,
    id,
    version,
    kernelCompatibility: '^1.0.0',
    dependencies: [],
    schemas: [],
    compilers: [],
    recipes: [],
    policies: [],
    evaluators: [],
    renderers: [],
    inspectors: [],
    semanticActions: [],
    deliveries: [],
    migrations: input.migration ? [{
      kind: 'migration', id: `migration:${id}`, version: '1.0.0', implementationHash: digestB, required: true,
    }] : [],
    evidenceBenchmarkAdapters: [],
    outcomeScorecardAdapters: [],
    capabilityRequirements: input.capabilityRequired ? [{
      capabilityId: `capability:${id}`,
      required: true,
      reason: 'Required by the fixture Profile.',
    }] : [],
    libraryRequirements: [],
    requiredRoleClosures: [],
    identityBindings: [],
  }
}

async function closure(id: string, version: string, input: {
  capabilityRequired?: boolean
  migration?: boolean
} = {}) {
  const manifest = await createDesignProfileManifest(content(id, version, input))
  return resolveProfileClosure({
    kernelVersion: '1.2.0',
    rootProfiles: [{ profileId: id, version, contentHash: manifest.contentHash }],
    availableManifests: [manifest],
    registrations: input.migration ? [{
      kind: 'migration',
      id: `migration:${id}`,
      version: '1.0.0',
      implementationHash: digestB,
      ownerId: 'cutout:fixture',
    }] : [],
    libraryLocks: [],
  })
}

async function combinedClosure(profiles: readonly { readonly id: string, readonly version: string }[]) {
  const manifests = await Promise.all(profiles.map(({ id, version }) => createDesignProfileManifest(content(id, version))))
  return resolveProfileClosure({
    kernelVersion: '1.2.0',
    rootProfiles: manifests.map((manifest) => ({
      profileId: manifest.id, version: manifest.version, contentHash: manifest.contentHash,
    })),
    availableManifests: manifests,
    registrations: [],
    libraryLocks: [],
  })
}

describe('Profile lifecycle previews and Project Bundle closure', () => {
  it('previews install without mutation and binds an exact ChangeSet handoff', async () => {
    const next = await closure('profile:synthetic', '1.0.0', { capabilityRequired: true })
    const input = {
      operation: 'install' as const,
      projectId: 'project:fixture',
      expectedProjectRevision: 'project:revision:1',
      profileIds: ['profile:synthetic'],
      nextClosure: next,
      availableCapabilityIds: ['capability:profile:synthetic'],
    }
    const before = structuredClone(input)
    const preview = await previewProfileLifecycle(input)

    expect(input).toEqual(before)
    expect(preview).toEqual(expect.objectContaining({
      operation: 'install',
      nextClosureHash: next.closureHash,
      blocked: false,
      requiresChangeSet: true,
      mutatesProject: false,
    }))
    await expect(assertProfileLifecycleChangeSet({
      preview,
      previewHash: preview.previewHash,
      projectRevision: 'project:revision:1',
      nextClosureHash: next.closureHash,
    })).resolves.toEqual(preview)
    await expect(assertProfileLifecycleChangeSet({
      preview,
      previewHash: preview.previewHash,
      projectRevision: 'project:revision:stale',
      nextClosureHash: next.closureHash,
    })).rejects.toThrow(/revision is stale/)
    await expect(assertProfileLifecycleChangeSet({
      preview: { ...preview, affectedProfileIds: ['profile:forged'] },
      previewHash: preview.previewHash,
      projectRevision: 'project:revision:1',
      nextClosureHash: next.closureHash,
    })).rejects.toThrow(/content hash does not match/)
  })

  it('blocks unavailable capabilities and records exact upgrade migration impact', async () => {
    const current = await closure('profile:synthetic', '1.0.0')
    const next = await closure('profile:synthetic', '2.0.0', { capabilityRequired: true, migration: true })
    const blocked = await previewProfileLifecycle({
      operation: 'upgrade',
      projectId: 'project:fixture',
      expectedProjectRevision: 'project:revision:1',
      profileIds: ['profile:synthetic'],
      currentClosure: current,
      nextClosure: next,
      availableCapabilityIds: [],
    })

    expect(blocked.blocked).toBe(true)
    expect(blocked.requiredCapabilityIds).toEqual(['capability:profile:synthetic'])
    expect(blocked.migrationBindingIds).toEqual(['migration:profile:synthetic'])
    expect(blocked.dependencyChanges).toEqual([expect.objectContaining({
      profileId: 'profile:synthetic',
      from: { version: '1.0.0', contentHash: current.manifests[0]!.contentHash },
      to: { version: '2.0.0', contentHash: next.manifests[0]!.contentHash },
    })])
    await expect(assertProfileLifecycleChangeSet({
      preview: blocked,
      previewHash: blocked.previewHash,
      projectRevision: 'project:revision:1',
      nextClosureHash: next.closureHash,
    })).rejects.toThrow(/Blocked Profile lifecycle preview/)
  })

  it('previews disable without requiring unavailable production capabilities', async () => {
    const current = await closure('profile:synthetic', '1.0.0', { capabilityRequired: true })
    const preview = await previewProfileLifecycle({
      operation: 'disable',
      projectId: 'project:fixture',
      expectedProjectRevision: 'project:revision:1',
      profileIds: ['profile:synthetic'],
      currentClosure: current,
    })
    expect(preview.currentClosureHash).toBe(current.closureHash)
    expect(preview.nextClosureHash).toBeUndefined()
    expect(preview.blocked).toBe(false)
    expect(preview.requiredCapabilityIds).toEqual([])
    expect(preview.mutatesProject).toBe(false)
    await expect(previewProfileLifecycle({
      operation: 'remove',
      projectId: 'project:fixture',
      expectedProjectRevision: 'project:revision:1',
      profileIds: ['profile:missing'],
      currentClosure: current,
    })).rejects.toThrow(/exact next Profile closure/)
  })

  it('removes one exact root while preserving unrelated Profile roots and binding the successor closure', async () => {
    const current = await combinedClosure([
      { id: 'profile:commerce', version: '1.0.0' },
      { id: 'profile:game-asset', version: '1.0.0' },
    ])
    const next = await combinedClosure([{ id: 'profile:commerce', version: '1.0.0' }])
    const preview = await previewProfileLifecycle({
      operation: 'remove', projectId: 'project:fixture', expectedProjectRevision: 'project:revision:1',
      profileIds: ['profile:game-asset'], currentClosure: current, nextClosure: next,
    })
    expect(preview).toEqual(expect.objectContaining({
      blocked: false,
      currentClosureHash: current.closureHash,
      nextClosureHash: next.closureHash,
      requiredCapabilityIds: [],
      migrationBindingIds: [],
    }))
    await expect(assertProfileLifecycleChangeSet({
      preview, previewHash: preview.previewHash, projectRevision: 'project:revision:1', nextClosureHash: next.closureHash,
    })).resolves.toEqual(preview)

    const droppingCommerce = await combinedClosure([{ id: 'profile:game-asset', version: '1.0.0' }])
    await expect(previewProfileLifecycle({
      operation: 'remove', projectId: 'project:fixture', expectedProjectRevision: 'project:revision:1',
      profileIds: ['profile:game-asset'], currentClosure: current, nextClosure: droppingCommerce,
    })).rejects.toThrow(/unrelated root Profile profile:commerce/)

    const sole = await combinedClosure([{ id: 'profile:game-asset', version: '1.0.0' }])
    const empty = await combinedClosure([])
    const soleRemoval = await previewProfileLifecycle({
      operation: 'remove', projectId: 'project:fixture', expectedProjectRevision: 'project:revision:1',
      profileIds: ['profile:game-asset'], currentClosure: sole, nextClosure: empty,
    })
    expect(soleRemoval.nextClosureHash).toBe(empty.closureHash)
    const project = await createProfileProjectRecord({
      projectId: 'project:fixture', projectRevision: 'project:revision:2', activeClosure: empty,
      installedProfiles: [profileReferenceFromClosure(sole, 'profile:game-asset')], disabledProfileIds: [],
    })
    await expect(createProfileProjectBundle({ project, closures: [empty] }))
      .rejects.toThrow(/missing installed Profile closure bytes/)
    await expect(createProfileProjectBundle({ project, closures: [empty, sole] }))
      .resolves.toEqual(expect.objectContaining({ project }))
  })

  it('round-trips an exact closure in the Project Bundle and rejects tampering before use', async () => {
    const activeClosure = await closure('profile:synthetic', '1.0.0')
    const project = await createProfileProjectRecord({
      projectId: 'project:fixture',
      projectRevision: 'project:revision:1',
      activeClosure,
      installedProfiles: [profileReferenceFromClosure(activeClosure, 'profile:synthetic')],
      disabledProfileIds: [],
    })
    const bundle = await createProfileProjectBundle({ project, closures: [activeClosure] })

    await expect(decodeProfileProjectRecord(structuredClone(project))).resolves.toEqual(project)
    await expect(decodeProfileProjectBundle(structuredClone(bundle))).resolves.toEqual(bundle)
    await expect(decodeProfileProjectRecord({ ...project, recordHash: digestA }))
      .rejects.toThrow(/record hash does not match/)
    await expect(decodeProfileProjectBundle({ ...bundle, bundleHash: digestA }))
      .rejects.toThrow(/Bundle hash does not match/)
    await expect(createProfileProjectBundle({ project, closures: [] }))
      .rejects.toThrow(/missing the active Profile closure/)
    await expect(createProfileProjectBundle({ project, closures: [activeClosure, activeClosure] }))
      .rejects.toThrow(/closures must be unique/)
    await expect(createProfileProjectRecord({
      projectId: 'project:fixture',
      projectRevision: 'project:revision:1',
      activeClosure,
      installedProfiles: [],
      disabledProfileIds: [],
    })).rejects.toThrow(/absent or stale in installed history/)
  })
})
