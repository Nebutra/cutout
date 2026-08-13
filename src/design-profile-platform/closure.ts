import { canonicalJson, fingerprint } from '@/design-ir/fingerprint'
import {
  DESIGN_PROFILE_CLOSURE_PROTOCOL,
  decodeDesignProfileManifest,
  designProfileManifestSchema,
  exactSemverSchema,
  normalizeProfileManifestContent,
  profileBindingKey,
  profileClosureSchema,
  profileDependencyReferenceSchema,
  profileLibraryRequirementSchema,
  profileManifestBindingReferences,
  registeredProfileBindingSchema,
  type DesignProfileManifest,
  type ProfileBindingReference,
  type ProfileClosure,
  type ProfileDependencyReference,
  type ProfileLibraryRequirement,
  type RegisteredProfileBinding,
} from './contracts'
import { deepFreeze } from './immutability'

type Semver = readonly [number, number, number]

function parseSemver(value: string): Semver {
  exactSemverSchema.parse(value)
  const [major, minor, patch] = value.split('.').map(Number)
  return [major!, minor!, patch!]
}

function compareSemver(left: Semver, right: Semver): number {
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2]
}

function satisfiesComparator(version: Semver, comparator: string): boolean {
  const match = /^(>=|>|<=|<|=)(\d+\.\d+\.\d+)$/.exec(comparator)
  if (!match) return false
  const difference = compareSemver(version, parseSemver(match[2]!))
  switch (match[1]) {
    case '>=': return difference >= 0
    case '>': return difference > 0
    case '<=': return difference <= 0
    case '<': return difference < 0
    case '=': return difference === 0
    default: return false
  }
}

export function kernelVersionSatisfiesRange(versionValue: string, range: string): boolean {
  const version = parseSemver(versionValue)
  if (range.startsWith('^')) {
    const lower = parseSemver(range.slice(1))
    const upper: Semver = lower[0] > 0
      ? [lower[0] + 1, 0, 0]
      : lower[1] > 0 ? [0, lower[1] + 1, 0] : [0, 0, lower[2] + 1]
    return compareSemver(version, lower) >= 0 && compareSemver(version, upper) < 0
  }
  if (range.startsWith('~')) {
    const lower = parseSemver(range.slice(1))
    return compareSemver(version, lower) >= 0 && compareSemver(version, [lower[0], lower[1] + 1, 0]) < 0
  }
  if (/^\d/.test(range)) return compareSemver(version, parseSemver(range)) === 0
  return range.split(/ +/).every((comparator) => satisfiesComparator(version, comparator))
}

function manifestKey(manifest: Pick<DesignProfileManifest, 'id' | 'version'>): string {
  return `${manifest.id}@${manifest.version}`
}

function dependencyKey(reference: ProfileDependencyReference): string {
  return `${reference.profileId}@${reference.version}`
}

function libraryKey(reference: ProfileLibraryRequirement): string {
  return `${reference.itemId}@${reference.version}`
}

function registeredBindingKey(binding: RegisteredProfileBinding): string {
  return profileBindingKey(binding)
}

function exactDependencyMatchesManifest(reference: ProfileDependencyReference, manifest: DesignProfileManifest): boolean {
  return reference.profileId === manifest.id
    && reference.version === manifest.version
    && reference.contentHash === manifest.contentHash
}

function exactBindingMatchesRegistration(reference: ProfileBindingReference, registration: RegisteredProfileBinding): boolean {
  return profileBindingKey(reference) === registeredBindingKey(registration)
    && reference.implementationHash === registration.implementationHash
}

function exactLibraryMatch(reference: ProfileLibraryRequirement, lock: ProfileLibraryRequirement): boolean {
  return reference.itemId === lock.itemId
    && reference.version === lock.version
    && reference.contentHash === lock.contentHash
}

function assertUnique<T>(values: readonly T[], key: (value: T) => string, label: string): void {
  const seen = new Set<string>()
  for (const value of values) {
    const identity = key(value)
    if (seen.has(identity)) throw new Error(`Duplicate ${label}: ${identity}`)
    seen.add(identity)
  }
}

function assertNoDependencyCycle(manifests: readonly DesignProfileManifest[]): void {
  const byKey = new Map(manifests.map((manifest) => [manifestKey(manifest), manifest]))
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (key: string): void => {
    if (visiting.has(key)) throw new Error(`Profile dependency cycle includes ${key}.`)
    if (visited.has(key)) return
    visiting.add(key)
    const manifest = byKey.get(key)
    if (manifest) for (const dependency of manifest.dependencies) visit(dependencyKey(dependency))
    visiting.delete(key)
    visited.add(key)
  }
  for (const key of byKey.keys()) visit(key)
}

function assertReachableDependencyGraphAcyclic(
  roots: readonly ProfileDependencyReference[],
  manifests: readonly DesignProfileManifest[],
): void {
  const byKey = new Map(manifests.map((manifest) => [manifestKey(manifest), manifest]))
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (key: string): void => {
    if (visiting.has(key)) throw new Error(`Profile dependency cycle includes ${key}.`)
    if (visited.has(key)) return
    visiting.add(key)
    const manifest = byKey.get(key)
    if (manifest) for (const dependency of manifest.dependencies) visit(dependencyKey(dependency))
    visiting.delete(key)
    visited.add(key)
  }
  for (const root of roots) visit(dependencyKey(root))
}

function closureContent(closure: Omit<ProfileClosure, 'closureHash'>): Omit<ProfileClosure, 'closureHash'> {
  return {
    ...closure,
    rootProfiles: [...closure.rootProfiles].sort((left, right) => dependencyKey(left).localeCompare(dependencyKey(right))),
    manifests: [...closure.manifests].sort((left, right) => manifestKey(left).localeCompare(manifestKey(right))),
    registrations: [...closure.registrations].sort((left, right) => registeredBindingKey(left).localeCompare(registeredBindingKey(right))),
    libraryLocks: [...closure.libraryLocks].sort((left, right) => libraryKey(left).localeCompare(libraryKey(right))),
  }
}

function validateResolvedClosure(input: {
  readonly kernelVersion: string
  readonly roots: readonly ProfileDependencyReference[]
  readonly manifests: readonly DesignProfileManifest[]
  readonly registrations: readonly RegisteredProfileBinding[]
  readonly libraryLocks: readonly ProfileLibraryRequirement[]
}): void {
  assertUnique(input.roots, (root) => root.profileId, 'root Profile id')
  assertUnique(input.manifests, manifestKey, 'Profile manifest')
  assertUnique(input.registrations, registeredBindingKey, 'binding registration')
  assertUnique(input.libraryLocks, (lock) => lock.itemId, 'Library lock id')

  const manifestByKey = new Map(input.manifests.map((manifest) => [manifestKey(manifest), manifest]))
  const selectedById = new Map<string, DesignProfileManifest>()
  for (const manifest of input.manifests) {
    const selected = selectedById.get(manifest.id)
    if (selected && (selected.version !== manifest.version || selected.contentHash !== manifest.contentHash)) {
      throw new Error(`Conflicting Profile versions selected for ${manifest.id}.`)
    }
    selectedById.set(manifest.id, manifest)
    if (!kernelVersionSatisfiesRange(input.kernelVersion, manifest.kernelCompatibility)) {
      throw new Error(`Profile ${manifestKey(manifest)} is incompatible with Kernel ${input.kernelVersion}.`)
    }
  }
  for (const root of input.roots) {
    const manifest = manifestByKey.get(dependencyKey(root))
    if (!manifest || !exactDependencyMatchesManifest(root, manifest)) {
      throw new Error(`Root Profile ${dependencyKey(root)} is missing or has a conflicting hash.`)
    }
  }

  const registrationByKey = new Map(input.registrations.map((registration) => [registeredBindingKey(registration), registration]))
  const lockById = new Map(input.libraryLocks.map((lock) => [lock.itemId, lock]))
  const referencedBindingKeys = new Set<string>()
  const referencedLibraryIds = new Set<string>()
  for (const manifest of input.manifests) {
    for (const dependency of manifest.dependencies) {
      const resolved = manifestByKey.get(dependencyKey(dependency))
      if (!resolved || !exactDependencyMatchesManifest(dependency, resolved)) {
        throw new Error(`Profile dependency ${dependencyKey(dependency)} is missing or has a conflicting hash.`)
      }
    }
    for (const binding of profileManifestBindingReferences(manifest)) {
      referencedBindingKeys.add(profileBindingKey(binding))
      const registration = registrationByKey.get(profileBindingKey(binding))
      if (binding.required && (!registration || !exactBindingMatchesRegistration(binding, registration))) {
        throw new Error(`Required Profile binding ${profileBindingKey(binding)} is missing or has a conflicting implementation hash.`)
      }
      if (registration && !exactBindingMatchesRegistration(binding, registration)) {
        throw new Error(`Profile binding ${profileBindingKey(binding)} has a conflicting implementation hash.`)
      }
    }
    for (const requirement of manifest.libraryRequirements) {
      referencedLibraryIds.add(requirement.itemId)
      const lock = lockById.get(requirement.itemId)
      if (!lock || !exactLibraryMatch(requirement, lock)) {
        throw new Error(`Required Library lock ${libraryKey(requirement)} is missing or stale.`)
      }
    }
  }
  for (const registration of input.registrations) {
    if (!referencedBindingKeys.has(registeredBindingKey(registration))) {
      throw new Error(`Profile closure contains unreferenced binding registration ${registeredBindingKey(registration)}.`)
    }
  }
  for (const lock of input.libraryLocks) {
    if (!referencedLibraryIds.has(lock.itemId)) {
      throw new Error(`Profile closure contains unreferenced Library lock ${libraryKey(lock)}.`)
    }
  }

  const reachableKeys = new Set<string>()
  const visit = (reference: ProfileDependencyReference): void => {
    const key = dependencyKey(reference)
    if (reachableKeys.has(key)) return
    reachableKeys.add(key)
    const manifest = manifestByKey.get(key)
    if (manifest) for (const dependency of manifest.dependencies) visit(dependency)
  }
  for (const root of input.roots) visit(root)
  for (const manifest of input.manifests) {
    if (!reachableKeys.has(manifestKey(manifest))) {
      throw new Error(`Profile closure contains unreachable manifest ${manifestKey(manifest)}.`)
    }
  }
  assertNoDependencyCycle(input.manifests)
}

function collectReachableManifests(
  roots: readonly ProfileDependencyReference[],
  available: readonly DesignProfileManifest[],
): DesignProfileManifest[] {
  const availableByKey = new Map(available.map((manifest) => [manifestKey(manifest), manifest]))
  const resolved = new Map<string, DesignProfileManifest>()
  const selectedById = new Map<string, DesignProfileManifest>()
  const visit = (reference: ProfileDependencyReference): void => {
    const manifest = availableByKey.get(dependencyKey(reference))
    if (!manifest || !exactDependencyMatchesManifest(reference, manifest)) {
      throw new Error(`Profile dependency ${dependencyKey(reference)} is missing or has a conflicting hash.`)
    }
    const selected = selectedById.get(manifest.id)
    if (selected && (selected.version !== manifest.version || selected.contentHash !== manifest.contentHash)) {
      throw new Error(`Conflicting Profile versions selected for ${manifest.id}.`)
    }
    if (resolved.has(manifestKey(manifest))) return
    selectedById.set(manifest.id, manifest)
    resolved.set(manifestKey(manifest), manifest)
    for (const dependency of manifest.dependencies) visit(dependency)
  }
  for (const root of roots) visit(root)
  return [...resolved.values()]
}

export async function resolveProfileClosure(input: {
  readonly kernelVersion: string
  readonly rootProfiles: readonly unknown[]
  readonly availableManifests: readonly unknown[]
  readonly registrations: readonly unknown[]
  readonly libraryLocks: readonly unknown[]
}): Promise<ProfileClosure> {
  const kernelVersion = exactSemverSchema.parse(input.kernelVersion)
  const roots = input.rootProfiles.map((root) => profileDependencyReferenceSchema.parse(root))
  const manifestShapes = input.availableManifests.map((manifest) => designProfileManifestSchema.parse(manifest))
  assertReachableDependencyGraphAcyclic(roots, manifestShapes)
  const available = await Promise.all(manifestShapes.map((manifest) => decodeDesignProfileManifest(manifest)))
  const registrations = input.registrations.map((registration) => registeredProfileBindingSchema.parse(registration))
  const libraryLocks = input.libraryLocks.map((lock) => profileLibraryRequirementSchema.parse(lock))
  assertUnique(available, manifestKey, 'available Profile manifest')
  assertUnique(registrations, registeredBindingKey, 'binding registration')
  const manifests = collectReachableManifests(roots, available)
  const referencedBindingKeys = new Set(manifests.flatMap((manifest) => profileManifestBindingReferences(manifest).map(profileBindingKey)))
  const referencedLibraryIds = new Set(manifests.flatMap((manifest) => manifest.libraryRequirements.map((requirement) => requirement.itemId)))
  const closureRegistrations = registrations.filter((registration) => referencedBindingKeys.has(registeredBindingKey(registration)))
  const closureLocks = libraryLocks.filter((lock) => referencedLibraryIds.has(lock.itemId))
  validateResolvedClosure({ kernelVersion, roots, manifests, registrations: closureRegistrations, libraryLocks: closureLocks })
  const content = closureContent({
    protocol: DESIGN_PROFILE_CLOSURE_PROTOCOL,
    kernelVersion,
    rootProfiles: roots,
    manifests,
    registrations: closureRegistrations,
    libraryLocks: closureLocks,
  })
  const closure = profileClosureSchema.parse({ ...content, closureHash: await fingerprint(content) })
  return deepFreeze(closure)
}

export async function decodeProfileClosure(input: unknown): Promise<ProfileClosure> {
  const parsed = profileClosureSchema.parse(input)
  const manifests = await Promise.all(parsed.manifests.map((manifest) => decodeDesignProfileManifest(manifest)))
  validateResolvedClosure({
    kernelVersion: parsed.kernelVersion,
    roots: parsed.rootProfiles,
    manifests,
    registrations: parsed.registrations,
    libraryLocks: parsed.libraryLocks,
  })
  const { closureHash, ...storedContent } = parsed
  const normalized = closureContent(storedContent)
  if (canonicalJson(storedContent) !== canonicalJson(normalized)) {
    throw new Error('Profile closure is not canonically ordered.')
  }
  for (const manifest of manifests) {
    const { contentHash, ...content } = manifest
    if (contentHash !== await fingerprint(normalizeProfileManifestContent(content))) {
      throw new Error(`Profile manifest ${manifestKey(manifest)} content hash does not match.`)
    }
  }
  if (closureHash !== await fingerprint(normalized)) throw new Error('Profile closure hash does not match.')
  return deepFreeze(parsed)
}
