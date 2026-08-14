import { z } from 'zod'
import { canonicalJson, fingerprint } from '@/design-ir/fingerprint'
import { recordIdSchema, sha256Schema } from '@/design-os-kernel/contracts'
import {
  profileClosureSchema,
  profileDependencyReferenceSchema,
  type ProfileClosure,
} from './contracts'
import { decodeProfileClosure } from './closure'

export const PROFILE_LIFECYCLE_PREVIEW_PROTOCOL = 'design-profile.lifecycle-preview.v1' as const
export const PROFILE_PROJECT_RECORD_PROTOCOL = 'design-profile.project-record.v1' as const
export const PROFILE_PROJECT_BUNDLE_PROTOCOL = 'design-profile.project-bundle.v1' as const

export const profileLifecycleOperationSchema = z.enum(['install', 'upgrade', 'disable', 'remove'])
export type ProfileLifecycleOperation = z.infer<typeof profileLifecycleOperationSchema>

export const profileProjectRecordSchema = z.object({
  protocol: z.literal(PROFILE_PROJECT_RECORD_PROTOCOL),
  projectId: recordIdSchema,
  projectRevision: recordIdSchema,
  activeClosure: profileClosureSchema,
  installedProfiles: z.array(profileDependencyReferenceSchema).min(1).max(1_000),
  disabledProfileIds: z.array(recordIdSchema).max(1_000),
  recordHash: sha256Schema,
}).strict().superRefine((record, context) => {
  if (new Set(record.installedProfiles.map(({ profileId }) => profileId)).size !== record.installedProfiles.length) {
    context.addIssue({ code: 'custom', message: 'Installed Profile ids must be unique.' })
  }
  if (new Set(record.disabledProfileIds).size !== record.disabledProfileIds.length) {
    context.addIssue({ code: 'custom', message: 'Disabled Profile ids must be unique.' })
  }
  const installed = new Set(record.installedProfiles.map(({ profileId }) => profileId))
  if (record.disabledProfileIds.some((profileId) => !installed.has(profileId))) {
    context.addIssue({ code: 'custom', message: 'Disabled Profiles must remain in installed history.' })
  }
})
export type ProfileProjectRecord = z.infer<typeof profileProjectRecordSchema>

export const profileLifecyclePreviewSchema = z.object({
  protocol: z.literal(PROFILE_LIFECYCLE_PREVIEW_PROTOCOL),
  id: recordIdSchema,
  operation: profileLifecycleOperationSchema,
  projectId: recordIdSchema,
  expectedProjectRevision: recordIdSchema,
  currentClosureHash: sha256Schema.optional(),
  nextClosureHash: sha256Schema.optional(),
  affectedProfileIds: z.array(recordIdSchema).min(1).max(1_000),
  dependencyChanges: z.array(z.object({
    profileId: recordIdSchema,
    from: z.object({ version: z.string().min(1), contentHash: sha256Schema }).strict().optional(),
    to: z.object({ version: z.string().min(1), contentHash: sha256Schema }).strict().optional(),
  }).strict()).max(10_000),
  requiredCapabilityIds: z.array(recordIdSchema).max(1_000),
  migrationBindingIds: z.array(recordIdSchema).max(1_000),
  diagnostics: z.array(z.string().min(1).max(2_000)).max(1_000),
  blocked: z.boolean(),
  requiresChangeSet: z.literal(true),
  mutatesProject: z.literal(false),
  previewHash: sha256Schema,
}).strict()
export type ProfileLifecyclePreview = z.infer<typeof profileLifecyclePreviewSchema>

export const profileProjectBundleSchema = z.object({
  protocol: z.literal(PROFILE_PROJECT_BUNDLE_PROTOCOL),
  project: profileProjectRecordSchema,
  closures: z.array(profileClosureSchema).min(1).max(10_000),
  bundleHash: sha256Schema,
}).strict()
export type ProfileProjectBundle = z.infer<typeof profileProjectBundleSchema>

function dependencyKey(reference: z.infer<typeof profileDependencyReferenceSchema>): string {
  return `${reference.profileId}@${reference.version}:${reference.contentHash}`
}

function projectRecordContent(input: Omit<ProfileProjectRecord, 'recordHash'>): Omit<ProfileProjectRecord, 'recordHash'> {
  return {
    ...input,
    installedProfiles: [...input.installedProfiles].sort((left, right) => dependencyKey(left).localeCompare(dependencyKey(right))),
    disabledProfileIds: [...input.disabledProfileIds].sort(),
  }
}

export async function createProfileProjectRecord(
  input: Omit<ProfileProjectRecord, 'protocol' | 'recordHash'>,
): Promise<ProfileProjectRecord> {
  const activeClosure = await decodeProfileClosure(input.activeClosure)
  const content = projectRecordContent({ ...input, protocol: PROFILE_PROJECT_RECORD_PROTOCOL, activeClosure })
  assertProjectRecordClosure(content)
  return profileProjectRecordSchema.parse({ ...content, recordHash: await fingerprint(content) })
}

export async function decodeProfileProjectRecord(input: unknown): Promise<ProfileProjectRecord> {
  const parsed = profileProjectRecordSchema.parse(input)
  const activeClosure = await decodeProfileClosure(parsed.activeClosure)
  const { recordHash, ...stored } = parsed
  const normalized = projectRecordContent({ ...stored, activeClosure })
  assertProjectRecordClosure(normalized)
  if (canonicalJson(stored) !== canonicalJson(normalized)) throw new Error('Profile Project record is not canonically ordered.')
  if (recordHash !== await fingerprint(normalized)) throw new Error('Profile Project record hash does not match.')
  return parsed
}

function assertProjectRecordClosure(record: Omit<ProfileProjectRecord, 'recordHash'>): void {
  const installedById = new Map(record.installedProfiles.map((profile) => [profile.profileId, profile]))
  for (const root of record.activeClosure.rootProfiles) {
    const installed = installedById.get(root.profileId)
    if (!installed || canonicalJson(installed) !== canonicalJson(root)) {
      throw new Error(`Active Profile closure root is absent or stale in installed history: ${root.profileId}`)
    }
  }
}

function exactProfileReference(closure: ProfileClosure, profileId: string) {
  const manifest = closure.manifests.find((candidate) => candidate.id === profileId)
  return manifest && { profileId: manifest.id, version: manifest.version, contentHash: manifest.contentHash }
}

export async function previewProfileLifecycle(input: {
  readonly operation: ProfileLifecycleOperation
  readonly projectId: string
  readonly expectedProjectRevision: string
  readonly profileIds: readonly string[]
  readonly currentClosure?: unknown
  readonly nextClosure?: unknown
  readonly availableCapabilityIds?: readonly string[]
}): Promise<ProfileLifecyclePreview> {
  const operation = profileLifecycleOperationSchema.parse(input.operation)
  const profileIds = [...new Set(input.profileIds.map((id) => recordIdSchema.parse(id)))].sort()
  if (profileIds.length === 0) throw new Error('A Profile lifecycle preview requires at least one Profile id.')
  const current = input.currentClosure === undefined ? undefined : await decodeProfileClosure(input.currentClosure)
  const next = input.nextClosure === undefined ? undefined : await decodeProfileClosure(input.nextClosure)
  if ((operation === 'install' || operation === 'upgrade' || operation === 'remove') && !next) {
    throw new Error(`${operation} preview requires the exact next Profile closure.`)
  }
  if ((operation === 'upgrade' || operation === 'disable' || operation === 'remove') && !current) {
    throw new Error(`${operation} preview requires the exact current Profile closure.`)
  }
  if (operation === 'install' || operation === 'upgrade' || operation === 'remove') {
    assertLifecycleClosureTransition({ operation, profileIds, current, next: next! })
  }

  const diagnostics: string[] = []
  const availableCapabilities = new Set((input.availableCapabilityIds ?? []).map((id) => recordIdSchema.parse(id)))
  const currentById = new Map((current?.manifests ?? []).map((manifest) => [manifest.id, manifest]))
  const nextById = new Map((next?.manifests ?? []).map((manifest) => [manifest.id, manifest]))
  const changedNextManifests = (next?.manifests ?? []).filter((manifest) => currentById.get(manifest.id)?.contentHash !== manifest.contentHash)
  const relevantManifests = operation === 'install' || operation === 'upgrade'
    ? changedNextManifests
    : current!.manifests.filter(({ id }) => profileIds.includes(id))
  for (const profileId of profileIds) {
    if (operation === 'install' && current?.manifests.some(({ id }) => id === profileId)) diagnostics.push(`Profile ${profileId} is already installed.`)
    if ((operation === 'upgrade' || operation === 'disable' || operation === 'remove')
      && !current?.manifests.some(({ id }) => id === profileId)) diagnostics.push(`Profile ${profileId} is not installed.`)
    if ((operation === 'install' || operation === 'upgrade') && !next?.manifests.some(({ id }) => id === profileId)) {
      diagnostics.push(`Next closure does not contain Profile ${profileId}.`)
    }
  }
  if (operation === 'install' || operation === 'upgrade') {
    for (const manifest of relevantManifests) {
      for (const requirement of manifest.capabilityRequirements) {
        if (requirement.required && !availableCapabilities.has(requirement.capabilityId)) {
          diagnostics.push(`Required capability is unavailable: ${requirement.capabilityId}`)
        }
      }
    }
  }
  const changedIds = [...new Set([...currentById.keys(), ...nextById.keys()])].sort()
  const dependencyChanges = changedIds.flatMap((profileId) => {
    const from = currentById.get(profileId)
    const to = nextById.get(profileId)
    if (from?.contentHash === to?.contentHash) return []
    return [{
      profileId,
      ...(from ? { from: { version: from.version, contentHash: from.contentHash } } : {}),
      ...(to ? { to: { version: to.version, contentHash: to.contentHash } } : {}),
    }]
  })
  const previewContent = {
    protocol: PROFILE_LIFECYCLE_PREVIEW_PROTOCOL,
    id: `profile-lifecycle:${operation}:${profileIds.join('+')}`,
    operation,
    projectId: recordIdSchema.parse(input.projectId),
    expectedProjectRevision: recordIdSchema.parse(input.expectedProjectRevision),
    ...(current ? { currentClosureHash: current.closureHash } : {}),
    ...(next ? { nextClosureHash: next.closureHash } : {}),
    affectedProfileIds: profileIds,
    dependencyChanges,
    requiredCapabilityIds: operation === 'install' || operation === 'upgrade'
      ? [...new Set(relevantManifests.flatMap((manifest) => manifest.capabilityRequirements
        .filter(({ required }) => required).map(({ capabilityId }) => capabilityId)))].sort()
      : [],
    migrationBindingIds: operation === 'upgrade'
      ? [...new Set(relevantManifests.flatMap((manifest) => manifest.migrations.map(({ id }) => id)))].sort()
      : [],
    diagnostics: [...diagnostics].sort(),
    blocked: diagnostics.length > 0,
    requiresChangeSet: true as const,
    mutatesProject: false as const,
  }
  return profileLifecyclePreviewSchema.parse({ ...previewContent, previewHash: await fingerprint(previewContent) })
}

export async function assertProfileLifecycleChangeSet(input: {
  readonly preview: unknown
  readonly previewHash: string
  readonly projectRevision: string
  readonly nextClosureHash?: string
}): Promise<ProfileLifecyclePreview> {
  const preview = profileLifecyclePreviewSchema.parse(input.preview)
  if (preview.blocked) throw new Error('Blocked Profile lifecycle preview cannot become a ChangeSet.')
  const { previewHash, ...content } = preview
  if (previewHash !== await fingerprint(content)) throw new Error('Profile lifecycle preview content hash does not match.')
  if (preview.previewHash !== sha256Schema.parse(input.previewHash)) throw new Error('Profile lifecycle preview hash does not match.')
  if (preview.expectedProjectRevision !== input.projectRevision) throw new Error('Profile lifecycle Project revision is stale.')
  if (preview.nextClosureHash !== input.nextClosureHash) throw new Error('Profile lifecycle next closure does not match the preview.')
  return preview
}

function assertLifecycleClosureTransition(input: {
  readonly operation: 'install' | 'upgrade' | 'remove'
  readonly profileIds: readonly string[]
  readonly current?: ProfileClosure
  readonly next: ProfileClosure
}): void {
  const currentRoots = new Map((input.current?.rootProfiles ?? []).map((root) => [root.profileId, root]))
  const nextRoots = new Map(input.next.rootProfiles.map((root) => [root.profileId, root]))
  const requested = new Set(input.profileIds)
  for (const [profileId, currentRoot] of currentRoots) {
    const nextRoot = nextRoots.get(profileId)
    if (!requested.has(profileId) && (!nextRoot || canonicalJson(currentRoot) !== canonicalJson(nextRoot))) {
      throw new Error(`Profile lifecycle transition changes unrelated root Profile ${profileId}.`)
    }
  }
  if (input.operation === 'install') {
    for (const profileId of requested) {
      if (currentRoots.has(profileId)) throw new Error(`Install transition already contains root Profile ${profileId}.`)
      if (!nextRoots.has(profileId)) throw new Error(`Install transition is missing root Profile ${profileId}.`)
    }
  } else if (input.operation === 'upgrade') {
    for (const profileId of requested) {
      if (!currentRoots.has(profileId) || !nextRoots.has(profileId)) {
        throw new Error(`Upgrade transition must replace existing root Profile ${profileId}.`)
      }
      if (canonicalJson(currentRoots.get(profileId)) === canonicalJson(nextRoots.get(profileId))) {
        throw new Error(`Upgrade transition did not change root Profile ${profileId}.`)
      }
    }
  } else {
    for (const profileId of requested) {
      if (!currentRoots.has(profileId) || nextRoots.has(profileId)) {
        throw new Error(`Remove transition must remove existing root Profile ${profileId}.`)
      }
    }
  }
  const expectedNextRootIds = new Set(input.operation === 'remove'
    ? [...currentRoots.keys()].filter((profileId) => !requested.has(profileId))
    : [...currentRoots.keys(), ...requested])
  for (const profileId of nextRoots.keys()) {
    if (!expectedNextRootIds.has(profileId)) {
      throw new Error(`Profile lifecycle transition adds unrequested root Profile ${profileId}.`)
    }
  }
}

export async function createProfileProjectBundle(input: {
  readonly project: unknown
  readonly closures: readonly unknown[]
}): Promise<ProfileProjectBundle> {
  const project = await decodeProfileProjectRecord(input.project)
  const closures = await Promise.all(input.closures.map(decodeProfileClosure))
  const byHash = new Map(closures.map((closure) => [closure.closureHash, closure]))
  if (byHash.size !== closures.length) throw new Error('Project Bundle Profile closures must be unique.')
  if (!byHash.has(project.activeClosure.closureHash)) throw new Error('Project Bundle is missing the active Profile closure.')
  assertBundleInstalledProfiles(project, closures)
  const normalizedClosures = [...byHash.values()].sort((left, right) => left.closureHash.localeCompare(right.closureHash))
  const content = { protocol: PROFILE_PROJECT_BUNDLE_PROTOCOL, project, closures: normalizedClosures }
  return profileProjectBundleSchema.parse({ ...content, bundleHash: await fingerprint(content) })
}

export async function decodeProfileProjectBundle(input: unknown): Promise<ProfileProjectBundle> {
  const parsed = profileProjectBundleSchema.parse(input)
  const project = await decodeProfileProjectRecord(parsed.project)
  const closures = await Promise.all(parsed.closures.map(decodeProfileClosure))
  const normalized = [...closures].sort((left, right) => left.closureHash.localeCompare(right.closureHash))
  if (new Set(normalized.map(({ closureHash }) => closureHash)).size !== normalized.length) {
    throw new Error('Project Bundle Profile closures must be unique.')
  }
  if (!normalized.some(({ closureHash }) => closureHash === project.activeClosure.closureHash)) {
    throw new Error('Project Bundle is missing the active Profile closure.')
  }
  assertBundleInstalledProfiles(project, normalized)
  const content = { protocol: PROFILE_PROJECT_BUNDLE_PROTOCOL, project, closures: normalized }
  if (canonicalJson({ protocol: parsed.protocol, project: parsed.project, closures: parsed.closures }) !== canonicalJson(content)) {
    throw new Error('Profile Project Bundle is not canonically ordered.')
  }
  if (parsed.bundleHash !== await fingerprint(content)) throw new Error('Profile Project Bundle hash does not match.')
  return parsed
}

function assertBundleInstalledProfiles(project: ProfileProjectRecord, closures: readonly ProfileClosure[]): void {
  for (const installed of project.installedProfiles) {
    const retained = closures.some((closure) => closure.manifests.some((manifest) => (
      manifest.id === installed.profileId
      && manifest.version === installed.version
      && manifest.contentHash === installed.contentHash
    )))
    if (!retained) throw new Error(`Project Bundle is missing installed Profile closure bytes: ${installed.profileId}`)
  }
}

export function profileReferenceFromClosure(closureInput: unknown, profileId: string) {
  const closure = profileClosureSchema.parse(closureInput)
  const reference = exactProfileReference(closure, recordIdSchema.parse(profileId))
  if (!reference) throw new Error(`Profile ${profileId} is absent from closure ${closure.closureHash}.`)
  return profileDependencyReferenceSchema.parse(reference)
}
