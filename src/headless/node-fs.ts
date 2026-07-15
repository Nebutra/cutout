import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, realpath, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { basename, resolve, sep } from 'node:path'
import type { DesignKit } from '@/design-kit'
import { brandKitSchema, type BrandKit } from '@/brand-kit'
import { canonicalJson } from '@/design-ir'
import { starterPlanSchema, type StarterPlan } from '@/starter-compiler'
import { artifactRecordSchema, headlessProjectStateSchema, type ArtifactRecord, type HeadlessProjectState } from './schema'
import { scanSourceInput } from './source-scanner'
import type { SourceIngestOperation } from '@/control-protocol'
import type { PreparedSourceIngestion, RuntimeStore } from './storage'

const CUTOUT_DIRECTORY = '.cutout'
const MANIFEST_FILE = 'manifest.json'
const RUN_EVENTS_FILE = 'run-events.json'
const OBJECTS_DIRECTORY = 'objects'
const EXPORTS_DIRECTORY = 'exports'
const DESIGN_KIT_DIRECTORY = 'design-kit'
const BRAND_KIT_DIRECTORY = 'brand-kit'
const STARTER_DIRECTORY = 'starter'
const STARTER_MANIFEST_FILE = 'cutout.starter-export.json'
const JOURNAL_FILE = '.transaction.json'
const TEMPORARY_PREFIX = '.cutout-tmp-'

type SavedFile = { readonly name: string; readonly contents: string | null }
type TransactionJournal = {
  readonly version: 1
  readonly id: string
  readonly files: readonly SavedFile[]
}

export interface NodeFsRuntimeStore extends RuntimeStore {
  /** Resolves only protocol-validated descriptors below the canonical project root. */
  prepareSourceIngestion(operation: SourceIngestOperation): Promise<PreparedSourceIngestion>
  /** Stores content-addressed bytes and returns the verified index record. */
  writeArtifact(input: { readonly bytes: Uint8Array; readonly mediaType: string; readonly sha256?: string }): Promise<ArtifactRecord>
  /** Reads an object only after verifying that its bytes still match its address. */
  readArtifact(sha256: string): Promise<Uint8Array>
  /**
   * Writes a complete, compiler-verified kit to a host-selected directory.
   * Callers never supply a path, so this API cannot become an arbitrary-write
   * primitive for coding agents.
   */
  writeDesignKit(kit: DesignKit): Promise<DesignKitExportReceipt>
  /**
   * Writes a complete compiler-verified Brand/VI Kit under a deterministic,
   * host-selected path. It accepts no user-controlled output location.
   */
  writeBrandKit(kit: BrandKit): Promise<BrandKitExportReceipt>
  /**
   * Applies a compiler-produced StarterPlan below the fixed starter export
   * root. It never invokes a package manager, build tool, shell, or network.
   */
  writeStarter(plan: StarterPlan): Promise<StarterExportReceipt>
}

export interface DesignKitExportReceipt {
  readonly kitId: string
  readonly revisionId: string
  readonly documentFingerprint: string
  readonly directory: string
  readonly files: readonly {
    readonly path: string
    readonly sha256: string
    readonly byteLength: number
  }[]
  readonly idempotent: boolean
}

export interface BrandKitExportReceipt {
  readonly brandKitId: string
  readonly revisionId: string
  readonly brandId: string
  readonly documentFingerprint: string
  readonly definitionFingerprint: string
  readonly directory: string
  readonly files: readonly {
    readonly path: string
    readonly sha256: string
    readonly byteLength: number
  }[]
  readonly idempotent: boolean
}

export interface StarterExportReceipt {
  readonly starterId: string
  readonly framework: StarterPlan['framework']
  readonly revisionId: string
  readonly documentFingerprint: string
  readonly planSha256: string
  readonly directory: string
  readonly files: readonly {
    readonly path: string
    readonly sha256: string
    readonly byteLength: number
  }[]
  readonly idempotent: boolean
}

const queues = new Map<string, Promise<void>>()

/**
 * Node-only persistence adapter.
 *
 * State changes use a rollback journal. A process dying between file renames is
 * recovered to the previous complete revision on the next access. Binary
 * objects are content addressed and independently verified after writing.
 */
export function createNodeFsRuntimeStore(projectRoot: string): NodeFsRuntimeStore {
  const requestedRoot = resolve(projectRoot)
  let initialized: Promise<{ root: string; directory: string; objects: string; designKitExports: string; brandKitExports: string; starterExports: string }> | undefined

  const paths = () => initialized ??= initializeRoot(requestedRoot)

  return {
    async prepareSourceIngestion(operation) {
      const { root } = await paths()
      return scanSourceInput(root, operation)
    },
    async load() {
      const { directory } = await paths()
      return serialized(directory, async () => {
        await recoverInterruptedTransaction(directory)
        await cleanupTemporaryFiles(directory)
        const manifest = await readJson(await managedPath(directory, MANIFEST_FILE))
        const files = (manifest as { files?: Record<string, unknown> }).files
        if (!files || typeof files !== 'object') throw new Error('Invalid .cutout manifest files.')
        const readNamed = async (name: keyof HeadlessProjectState['manifest']['files']) => readJson(await managedPath(directory, files[name]))
        const markdown = await readFile(await managedPath(directory, files.designMarkdown), 'utf8')
        const ledger = await readOptionalJson(await managedPath(directory, files.controlLedger))
        const runEvents = await readOptionalJson(await managedPath(directory, RUN_EVENTS_FILE))
        const state = {
          manifest,
          design: await readNamed('designIr'),
          designMarkdown: markdown,
          artifactIndex: await readNamed('artifactIndex'),
          policy: await readNamed('policy'),
          ...(ledger === undefined ? {} : { ledger }),
          ...(runEvents === undefined ? {} : { runEvents }),
        }
        return headlessProjectStateSchema.parse(state)
      })
    },
    async save(input) {
      const state = headlessProjectStateSchema.parse(input)
      const { directory } = await paths()
      await serialized(directory, async () => {
        await recoverInterruptedTransaction(directory)
        await cleanupTemporaryFiles(directory)
        const { files } = state.manifest
        const nextFiles: readonly { name: string; value: string | null }[] = [
          { name: files.designIr, value: json(state.design) },
          { name: files.designMarkdown, value: state.designMarkdown },
          { name: files.artifactIndex, value: json(state.artifactIndex) },
          { name: files.policy, value: json(state.policy) },
          { name: files.controlLedger, value: state.ledger ? json(state.ledger) : null },
          { name: RUN_EVENTS_FILE, value: state.runEvents ? json(state.runEvents) : null },
          // Write the manifest last; its visibility is the state commit point.
          { name: MANIFEST_FILE, value: json(state.manifest) },
        ]
        await transactionalWrite(directory, nextFiles)
      })
    },
    async writeArtifact(input) {
      const { directory, objects } = await paths()
      return serialized(directory, async () => {
        await recoverInterruptedTransaction(directory)
        await cleanupTemporaryFiles(objects)
        const bytes = new Uint8Array(input.bytes)
        const sha256 = digest(bytes)
        if (input.sha256 && normalizeDigest(input.sha256) !== sha256) {
          throw new Error('Artifact SHA-256 does not match the supplied bytes.')
        }
        if (typeof input.mediaType !== 'string' || input.mediaType.length === 0 || input.mediaType.length > 200) {
          throw new Error('Expected an artifact media type.')
        }
        const target = await managedPath(objects, sha256)
        try {
          const existing = new Uint8Array(await readFile(target))
          if (digest(existing) !== sha256) throw new Error('Stored artifact SHA-256 does not match its address.')
          return artifactRecordSchema.parse({ sha256, mediaType: input.mediaType, byteLength: existing.byteLength })
        } catch (error) {
          if (!isMissingFile(error)) throw error
        }

        const temporary = temporaryPath(target)
        try {
          await writeFile(temporary, bytes, { flag: 'wx' })
          const persisted = new Uint8Array(await readFile(temporary))
          if (digest(persisted) !== sha256) throw new Error('Artifact bytes changed before commit.')
          await rename(temporary, target)
        } finally {
          await rm(temporary, { force: true })
        }
        const persisted = new Uint8Array(await readFile(target))
        if (digest(persisted) !== sha256) throw new Error('Stored artifact SHA-256 does not match its address.')
        return artifactRecordSchema.parse({ sha256, mediaType: input.mediaType, byteLength: persisted.byteLength })
      })
    },
    async readArtifact(sha256) {
      const { directory, objects } = await paths()
      return serialized(directory, async () => {
        await recoverInterruptedTransaction(directory)
        await cleanupTemporaryFiles(objects)
        const normalized = normalizeDigest(sha256)
        const bytes = new Uint8Array(await readFile(await managedPath(objects, normalized)))
        if (digest(bytes) !== normalized) throw new Error('Stored artifact SHA-256 does not match its address.')
        return bytes
      })
    },
    async writeDesignKit(kit) {
      const { directory, designKitExports } = await paths()
      return serialized(directory, async () => {
        await recoverInterruptedTransaction(directory)
        await cleanupTemporaryFiles(designKitExports)
        const normalized = validateDesignKit(kit)
        const kitId = designKitId(normalized)
        const target = await managedExportDirectory(designKitExports, kitId)

        const existing = await readExistingKit(target, normalized, kitId)
        if (existing) return existing

        const staging = await stagingExportDirectory(designKitExports)
        try {
          await writeKitDirectory(staging, normalized)
          // Rename is the visibility/commit point. `target` is revision- and
          // content-addressed, so an existing directory is never overwritten.
          await rename(staging, target)
        } catch (error) {
          // A concurrent writer may have committed the same deterministic kit.
          if (isAlreadyExists(error)) {
            const concurrent = await readExistingKit(target, normalized, kitId)
            if (concurrent) return concurrent
          }
          throw error
        } finally {
          await rm(staging, { recursive: true, force: true })
        }
        const receipt = await readExistingKit(target, normalized, kitId)
        if (!receipt) throw new Error('Design Kit export did not become readable after commit.')
        return { ...receipt, idempotent: false }
      })
    },
    async writeBrandKit(kit) {
      const { directory, brandKitExports } = await paths()
      return serialized(directory, async () => {
        await recoverInterruptedTransaction(directory)
        await cleanupTemporaryFiles(brandKitExports)
        const normalized = validateBrandKit(kit)
        const brandKitId = brandKitExportId(normalized)
        const target = await managedExportDirectory(brandKitExports, brandKitId)

        const existing = await readExistingBrandKit(target, normalized, brandKitId)
        if (existing) return existing

        const staging = await stagingExportDirectory(brandKitExports)
        try {
          await writeBrandKitDirectory(staging, normalized)
          await rename(staging, target)
        } catch (error) {
          if (isAlreadyExists(error)) {
            const concurrent = await readExistingBrandKit(target, normalized, brandKitId)
            if (concurrent) return concurrent
          }
          throw error
        } finally {
          await rm(staging, { recursive: true, force: true })
        }
        const receipt = await readExistingBrandKit(target, normalized, brandKitId)
        if (!receipt) throw new Error('Brand Kit export did not become readable after commit.')
        return { ...receipt, idempotent: false }
      })
    },
    async writeStarter(plan) {
      const { directory, objects, starterExports } = await paths()
      return serialized(directory, async () => {
        await recoverInterruptedTransaction(directory)
        const normalized = await validateStarterPlan(plan)
        const starterId = starterExportId(normalized)
        const target = await managedExportDirectory(starterExports, starterId)
        const expected = await starterExportExpected(normalized, async (sha256) => {
          const bytes = new Uint8Array(await readFile(await managedPath(objects, sha256)))
          if (digest(bytes) !== sha256) throw new Error('Stored artifact SHA-256 does not match its address.')
          return bytes
        })

        const existing = await readExistingStarter(target, expected, normalized, starterId)
        if (existing) return existing

        const staging = await stagingExportDirectory(starterExports)
        try {
          await writeStarterDirectory(staging, expected)
          // A deterministic, content-addressed target is immutable. Rename is
          // the only visibility point; existing targets are never merged.
          await rename(staging, target)
        } catch (error) {
          if (isAlreadyExists(error)) {
            const concurrent = await readExistingStarter(target, expected, normalized, starterId)
            if (concurrent) return concurrent
          }
          throw error
        } finally {
          await rm(staging, { recursive: true, force: true })
        }
        const receipt = await readExistingStarter(target, expected, normalized, starterId)
        if (!receipt) throw new Error('Starter export did not become readable after commit.')
        return { ...receipt, idempotent: false }
      })
    },
  }
}

async function initializeRoot(requestedRoot: string) {
  await mkdir(requestedRoot, { recursive: true })
  // The selected project root is a trust boundary too. Reject a direct link
  // before canonicalising it, otherwise a `--project` alias could silently
  // redirect every managed write to a different project.
  await assertNotSymlink(requestedRoot)
  const root = await realpath(requestedRoot)
  const requestedDirectory = resolve(root, CUTOUT_DIRECTORY)
  await assertDirectChild(root, requestedDirectory)
  await assertNotSymlink(requestedDirectory, true)
  await mkdir(requestedDirectory, { recursive: true })
  await assertNotSymlink(requestedDirectory)
  const directory = await realpath(requestedDirectory)
  await assertDirectChild(root, directory)

  const requestedObjects = resolve(directory, OBJECTS_DIRECTORY)
  await assertDirectChild(directory, requestedObjects)
  await assertNotSymlink(requestedObjects, true)
  await mkdir(requestedObjects, { recursive: true })
  await assertNotSymlink(requestedObjects)
  const objects = await realpath(requestedObjects)
  await assertDirectChild(directory, objects)

  const requestedExports = resolve(directory, EXPORTS_DIRECTORY)
  await assertDirectChild(directory, requestedExports)
  await assertNotSymlink(requestedExports, true)
  await mkdir(requestedExports, { recursive: true })
  await assertNotSymlink(requestedExports)
  const exports = await realpath(requestedExports)
  await assertDirectChild(directory, exports)

  const requestedDesignKitExports = resolve(exports, DESIGN_KIT_DIRECTORY)
  await assertDirectChild(exports, requestedDesignKitExports)
  await assertNotSymlink(requestedDesignKitExports, true)
  await mkdir(requestedDesignKitExports, { recursive: true })
  await assertNotSymlink(requestedDesignKitExports)
  const designKitExports = await realpath(requestedDesignKitExports)
  await assertDirectChild(exports, designKitExports)
  const requestedBrandKitExports = resolve(exports, BRAND_KIT_DIRECTORY)
  await assertDirectChild(exports, requestedBrandKitExports)
  await assertNotSymlink(requestedBrandKitExports, true)
  await mkdir(requestedBrandKitExports, { recursive: true })
  await assertNotSymlink(requestedBrandKitExports)
  const brandKitExports = await realpath(requestedBrandKitExports)
  await assertDirectChild(exports, brandKitExports)
  const requestedStarterExports = resolve(exports, STARTER_DIRECTORY)
  await assertDirectChild(exports, requestedStarterExports)
  await assertNotSymlink(requestedStarterExports, true)
  await mkdir(requestedStarterExports, { recursive: true })
  await assertNotSymlink(requestedStarterExports)
  const starterExports = await realpath(requestedStarterExports)
  await assertDirectChild(exports, starterExports)
  return { root, directory, objects, designKitExports, brandKitExports, starterExports }
}

function validateDesignKit(input: DesignKit): DesignKit {
  const seen = new Set<string>()
  for (const file of input.files) {
    if (!validFileName(file.path) || seen.has(file.path)) throw new Error('Design Kit contains an unsafe or duplicate file name.')
    seen.add(file.path)
    const bytes = new TextEncoder().encode(file.content)
    if (digest(bytes) !== file.sha256.toLowerCase()) throw new Error(`Design Kit file hash does not match content: ${file.path}`)
  }
  if (!seen.has('manifest.json')) throw new Error('Design Kit is missing its hash manifest.')
  return input
}

function designKitId(kit: DesignKit): string {
  const project = safeSegment(kit.source.documentId)
  const revision = safeSegment(kit.source.revisionId)
  return `${project}--${revision}--${kit.source.documentFingerprint.slice(0, 16).toLowerCase()}`
}

function validateBrandKit(input: BrandKit): BrandKit {
  const kit = brandKitSchema.parse(input)
  const seen = new Set<string>()
  for (const file of kit.files) {
    if (!validFileName(file.path) || seen.has(file.path)) throw new Error('Brand Kit contains an unsafe or duplicate file name.')
    seen.add(file.path)
    const bytes = new TextEncoder().encode(file.content)
    if (digest(bytes) !== file.sha256.toLowerCase()) throw new Error(`Brand Kit file hash does not match content: ${file.path}`)
  }
  if (!seen.has('brand.manifest.json')) throw new Error('Brand Kit is missing its hash manifest.')
  return kit
}

export function brandKitExportId(kit: BrandKit): string {
  const project = safeSegment(kit.source.documentId)
  const revision = safeSegment(kit.source.revisionId)
  const brand = safeSegment(kit.source.brandId)
  return `${project}--${revision}--${brand}--${kit.source.documentFingerprint.slice(0, 16).toLowerCase()}--${kit.source.definitionFingerprint.slice(0, 16).toLowerCase()}`
}

function safeSegment(value: string): string {
  const segment = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
  if (!segment) throw new Error('Design Kit source has no safe project/revision identifier.')
  return segment
}

async function managedExportDirectory(parent: string, kitId: string): Promise<string> {
  if (!validFileName(kitId)) throw new Error('Expected a safe Design Kit identifier.')
  await assertStableDirectory(parent)
  const target = resolve(parent, kitId)
  await assertDirectChild(parent, target)
  await assertNotSymlink(target, true)
  return target
}

async function stagingExportDirectory(parent: string): Promise<string> {
  await assertStableDirectory(parent)
  const staging = resolve(parent, `cutout-export-tmp-${randomUUID()}`)
  await assertDirectChild(parent, staging)
  await mkdir(staging)
  await assertNotSymlink(staging)
  return staging
}

async function writeKitDirectory(directory: string, kit: DesignKit) {
  await assertStableDirectory(directory)
  for (const file of kit.files) {
    const target = await managedPath(directory, file.path)
    await atomicText(target, file.content)
  }
}

async function writeBrandKitDirectory(directory: string, kit: BrandKit) {
  await assertStableDirectory(directory)
  for (const file of kit.files) {
    const target = await managedPath(directory, file.path)
    await atomicText(target, file.content)
  }
}

async function readExistingKit(
  directory: string,
  kit: DesignKit,
  kitId: string,
): Promise<DesignKitExportReceipt | null> {
  try {
    await assertNotSymlink(directory)
    if (!(await lstat(directory)).isDirectory()) throw new Error('Design Kit export target is not a directory.')
  } catch (error) {
    if (isMissingFile(error)) return null
    throw error
  }
  const canonical = await realpath(directory)
  if (canonical !== directory) throw new Error('Refusing a non-canonical Design Kit export directory.')

  const expected = new Map<DesignKit['files'][number]['path'], DesignKit['files'][number]>(kit.files.map((file) => [file.path, file]))
  const names = await readdir(directory)
  if (names.length !== expected.size || names.some((name) => !expected.has(name as DesignKit['files'][number]['path']))) {
    throw new Error('A Design Kit export already exists with different files; refusing to overwrite it.')
  }
  const files = [] as Array<{ path: string; sha256: string; byteLength: number }>
  for (const [path, file] of expected) {
    const target = await managedPath(directory, path)
    const bytes = new Uint8Array(await readFile(target))
    const sha256 = digest(bytes)
    if (sha256 !== file.sha256.toLowerCase()) {
      throw new Error(`A Design Kit export already exists with a different hash for ${path}; refusing to overwrite it.`)
    }
    files.push({ path, sha256, byteLength: bytes.byteLength })
  }
  return {
    kitId,
    revisionId: kit.source.revisionId,
    documentFingerprint: kit.source.documentFingerprint,
    directory: `.cutout/exports/design-kit/${kitId}`,
    files: files.sort((left, right) => left.path.localeCompare(right.path)),
    idempotent: true,
  }
}

async function readExistingBrandKit(
  directory: string,
  kit: BrandKit,
  brandKitId: string,
): Promise<BrandKitExportReceipt | null> {
  try {
    await assertNotSymlink(directory)
    if (!(await lstat(directory)).isDirectory()) throw new Error('Brand Kit export target is not a directory.')
  } catch (error) {
    if (isMissingFile(error)) return null
    throw error
  }
  if (await realpath(directory) !== directory) throw new Error('Refusing a non-canonical Brand Kit export directory.')

  const expected = new Map<BrandKit['files'][number]['path'], BrandKit['files'][number]>(kit.files.map((file) => [file.path, file]))
  const names = await readdir(directory)
  if (names.length !== expected.size || names.some((name) => !expected.has(name as BrandKit['files'][number]['path']))) {
    throw new Error('A Brand Kit export already exists with different files; refusing to overwrite it.')
  }
  const files: Array<{ path: string; sha256: string; byteLength: number }> = []
  for (const [path, file] of expected) {
    const target = await managedPath(directory, path)
    const bytes = new Uint8Array(await readFile(target))
    const sha256 = digest(bytes)
    if (sha256 !== file.sha256.toLowerCase()) {
      throw new Error(`A Brand Kit export already exists with a different hash for ${path}; refusing to overwrite it.`)
    }
    files.push({ path, sha256, byteLength: bytes.byteLength })
  }
  return {
    brandKitId,
    revisionId: kit.source.revisionId,
    brandId: kit.source.brandId,
    documentFingerprint: kit.source.documentFingerprint,
    definitionFingerprint: kit.source.definitionFingerprint,
    directory: `.cutout/exports/brand-kit/${brandKitId}`,
    files: files.sort((left, right) => left.path.localeCompare(right.path)),
    idempotent: true,
  }
}

type StarterExportFile = {
  readonly path: string
  readonly bytes: Uint8Array
  readonly sha256: string
}

type StarterExportExpected = {
  readonly planSha256: string
  readonly files: readonly StarterExportFile[]
}

/** Re-validate every byte supplied by the pure Starter Compiler boundary. */
async function validateStarterPlan(input: StarterPlan): Promise<StarterPlan> {
  const plan = starterPlanSchema.parse(input)
  const paths = new Set<string>()
  for (const file of plan.files) {
    if (!validRelativeExportPath(file.path) || file.path === STARTER_MANIFEST_FILE || paths.has(file.path)) {
      throw new Error('Starter Plan contains an unsafe or duplicate output path.')
    }
    paths.add(file.path)
    if (digest(new TextEncoder().encode(file.content)) !== file.sha256.toLowerCase()) {
      throw new Error(`Starter Plan file hash does not match content: ${file.path}`)
    }
  }
  for (const asset of plan.assets) {
    if (!validRelativeExportPath(asset.outputPath) || asset.outputPath === STARTER_MANIFEST_FILE || paths.has(asset.outputPath)) {
      throw new Error('Starter Plan contains an unsafe or duplicate output path.')
    }
    paths.add(asset.outputPath)
    const sourceSha256 = sourceDigest(asset.sourceUri)
    if (asset.sha256 && asset.sha256.toLowerCase() !== sourceSha256) {
      throw new Error(`Starter Plan asset digest does not match its content-addressed source: ${asset.outputPath}`)
    }
  }
  return plan
}

export function starterPlanFingerprint(plan: StarterPlan): string {
  return digest(new TextEncoder().encode(canonicalJson(plan)))
}

export function starterExportId(plan: StarterPlan): string {
  const project = safeSegment(plan.source.documentId)
  const revision = safeSegment(plan.source.revisionId)
  const framework = safeSegment(plan.framework)
  return `${project}--${revision}--${framework}--${plan.source.documentFingerprint.slice(0, 16).toLowerCase()}--${starterPlanFingerprint(plan).slice(0, 16)}`
}

async function starterExportExpected(
  plan: StarterPlan,
  readObject: (sha256: string) => Promise<Uint8Array>,
): Promise<StarterExportExpected> {
  const planSha256 = starterPlanFingerprint(plan)
  const files: StarterExportFile[] = plan.files.map((file) => ({
    path: file.path,
    bytes: new TextEncoder().encode(file.content),
    sha256: file.sha256.toLowerCase(),
  }))
  for (const asset of plan.assets) {
    const sha256 = sourceDigest(asset.sourceUri)
    const bytes = await readObject(sha256)
    if (digest(bytes) !== sha256) throw new Error(`Starter asset bytes do not match source digest: ${asset.outputPath}`)
    files.push({ path: asset.outputPath, bytes, sha256 })
  }
  const source = plan.source
  const manifest = {
    version: 'cutout.starter-export.v1',
    starterId: starterExportId(plan),
    framework: plan.framework,
    source,
    planSha256,
    files: files.map((file) => ({ path: file.path, sha256: file.sha256, byteLength: file.bytes.byteLength }))
      .sort((left, right) => left.path.localeCompare(right.path)),
  }
  const manifestBytes = new TextEncoder().encode(json(manifest))
  files.push({ path: STARTER_MANIFEST_FILE, bytes: manifestBytes, sha256: digest(manifestBytes) })
  return { planSha256, files: files.sort((left, right) => left.path.localeCompare(right.path)) }
}

function sourceDigest(sourceUri: string): string {
  const match = /^sha256:([a-f0-9]{64})$/i.exec(sourceUri)
  if (!match) throw new Error('Starter assets must use a local content-addressed sha256: URI.')
  return match[1]!.toLowerCase()
}

async function writeStarterDirectory(directory: string, expected: StarterExportExpected) {
  await assertStableDirectory(directory)
  for (const file of expected.files) {
    const target = await managedRelativePath(directory, file.path, true)
    await atomicBytes(target, file.bytes)
  }
}

async function readExistingStarter(
  directory: string,
  expected: StarterExportExpected,
  plan: StarterPlan,
  starterId: string,
): Promise<StarterExportReceipt | null> {
  try {
    await assertNotSymlink(directory)
    if (!(await lstat(directory)).isDirectory()) throw new Error('Starter export target is not a directory.')
  } catch (error) {
    if (isMissingFile(error)) return null
    throw error
  }
  if (await realpath(directory) !== directory) throw new Error('Refusing a non-canonical Starter export directory.')

  const expectedPaths = new Set(expected.files.map((file) => file.path))
  const actualPaths = await listRelativeFiles(directory)
  if (actualPaths.length !== expectedPaths.size || actualPaths.some((path) => !expectedPaths.has(path))) {
    throw new Error('A Starter export already exists with different files; refusing to overwrite it.')
  }
  const files: StarterExportReceipt['files'][number][] = []
  for (const file of expected.files) {
    const target = await managedRelativePath(directory, file.path, false)
    const bytes = new Uint8Array(await readFile(target))
    const sha256 = digest(bytes)
    if (sha256 !== file.sha256) {
      throw new Error(`A Starter export already exists with a different hash for ${file.path}; refusing to overwrite it.`)
    }
    files.push({ path: file.path, sha256, byteLength: bytes.byteLength })
  }
  return {
    starterId,
    framework: plan.framework,
    revisionId: plan.source.revisionId,
    documentFingerprint: plan.source.documentFingerprint,
    planSha256: expected.planSha256,
    directory: `.cutout/exports/starter/${starterId}`,
    files: files.sort((left, right) => left.path.localeCompare(right.path)),
    idempotent: true,
  }
}

async function managedRelativePath(directory: string, value: string, createParents: boolean): Promise<string> {
  if (!validRelativeExportPath(value)) throw new Error('Expected a safe relative export path.')
  await assertStableDirectory(directory)
  const target = resolve(directory, value)
  if (!containedBy(directory, target)) throw new Error('Expected a path contained by the controlled export directory.')
  const relativeSegments = value.split('/')
  let current = directory
  for (const segment of relativeSegments.slice(0, -1)) {
    const next = resolve(current, segment)
    await assertDirectChild(current, next)
    await assertNotSymlink(next, true)
    if (createParents) {
      try {
        await mkdir(next)
      } catch (error) {
        if (!isAlreadyExists(error)) throw error
      }
    }
    await assertNotSymlink(next)
    if (!(await lstat(next)).isDirectory()) throw new Error('Starter export path has a non-directory ancestor.')
    if (await realpath(next) !== next) throw new Error('Refusing a non-canonical Starter export ancestor.')
    current = next
  }
  await assertNotSymlink(target, true)
  return target
}

async function listRelativeFiles(directory: string, prefix = ''): Promise<string[]> {
  await assertStableDirectory(directory)
  const entries = await readdir(directory, { withFileTypes: true })
  const paths: string[] = []
  for (const entry of entries) {
    const target = resolve(directory, entry.name)
    await assertDirectChild(directory, target)
    if (entry.isSymbolicLink()) throw new Error('Refusing symbolic links in a Starter export.')
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) paths.push(...await listRelativeFiles(target, relativePath))
    else if (entry.isFile()) paths.push(relativePath)
    else throw new Error('Starter export contains an unsupported filesystem entry.')
  }
  return paths.sort((left, right) => left.localeCompare(right))
}

async function transactionalWrite(directory: string, files: readonly { name: string; value: string | null }[]) {
  const unique = new Map<string, string | null>()
  for (const file of files) {
    if (unique.has(file.name)) throw new Error(`Duplicate transaction file: ${file.name}`)
    unique.set(file.name, file.value)
  }
  const journalPath = await managedPath(directory, JOURNAL_FILE)
  const previous: SavedFile[] = []
  for (const name of unique.keys()) {
    const path = await managedPath(directory, name)
    previous.push({ name, contents: (await readOptionalText(path)) ?? null })
  }
  const journal: TransactionJournal = { version: 1, id: randomUUID(), files: previous }
  await atomicText(journalPath, json(journal))
  // A failed write intentionally leaves this journal behind for recovery.
  for (const [name, value] of unique) {
    const path = await managedPath(directory, name)
    if (value === null) await rm(path, { force: true })
    else await atomicText(path, value)
  }
  await unlink(journalPath)
}

async function recoverInterruptedTransaction(directory: string) {
  const journalPath = await managedPath(directory, JOURNAL_FILE)
  const raw = await readOptionalText(journalPath)
  if (raw === undefined) return
  const journal = transactionJournal(JSON.parse(raw))
  for (const entry of journal.files) {
    const path = await managedPath(directory, entry.name)
    if (entry.contents === null) await rm(path, { force: true })
    else await atomicText(path, entry.contents)
  }
  await unlink(journalPath)
}

async function cleanupTemporaryFiles(directory: string) {
  await assertStableDirectory(directory)
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.name.includes(TEMPORARY_PREFIX) || entry.isDirectory()) continue
    // The generated name stays a direct child and unlink never follows a link.
    await rm(resolve(directory, entry.name), { force: true })
  }
}

function transactionJournal(value: unknown): TransactionJournal {
  if (!value || typeof value !== 'object') throw new Error('Invalid .cutout transaction journal.')
  const candidate = value as { version?: unknown; id?: unknown; files?: unknown }
  if (candidate.version !== 1 || typeof candidate.id !== 'string' || !Array.isArray(candidate.files)) throw new Error('Invalid .cutout transaction journal.')
  const seen = new Set<string>()
  const files = candidate.files.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid .cutout transaction journal.')
    const item = entry as { name?: unknown; contents?: unknown }
    if (typeof item.name !== 'string' || !validFileName(item.name) || seen.has(item.name) || (item.contents !== null && typeof item.contents !== 'string')) {
      throw new Error('Invalid .cutout transaction journal.')
    }
    seen.add(item.name)
    return { name: item.name, contents: item.contents } as SavedFile
  })
  return { version: 1, id: candidate.id, files }
}

async function managedPath(directory: string, value: unknown): Promise<string> {
  if (typeof value !== 'string' || !validManagedName(value)) throw new Error('Expected a safe .cutout file name.')
  await assertStableDirectory(directory)
  const path = resolve(directory, value)
  await assertDirectChild(directory, path)
  await assertNotSymlink(path, true)
  return path
}

async function assertStableDirectory(directory: string) {
  await assertNotSymlink(directory)
  if (await realpath(directory) !== directory) throw new Error('Refusing a non-canonical .cutout directory.')
}

function validFileName(value: string) {
  return basename(value) === value && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) && !value.includes('..')
}

function validManagedName(value: string) {
  return value === JOURNAL_FILE || validFileName(value)
}

function validRelativeExportPath(value: string) {
  return value.length > 0
    && value.length <= 240
    && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value)
    && !value.startsWith('/')
    && !value.split('/').some((segment) => segment.length === 0 || segment === '.' || segment === '..')
}

function containedBy(parent: string, child: string) {
  return child.startsWith(`${parent}${sep}`)
}

async function assertDirectChild(parent: string, child: string) {
  if (!child.startsWith(`${parent}${sep}`)) throw new Error('Expected a path contained by the .cutout directory.')
}

async function assertNotSymlink(path: string, missingAllowed = false) {
  try {
    if ((await lstat(path)).isSymbolicLink()) throw new Error('Refusing symbolic links in the .cutout directory.')
  } catch (error) {
    if (missingAllowed && isMissingFile(error)) return
    throw error
  }
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown
}

async function readOptionalJson(path: string): Promise<unknown | undefined> {
  const raw = await readOptionalText(path)
  return raw === undefined ? undefined : JSON.parse(raw) as unknown
}

async function readOptionalText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (isMissingFile(error)) return undefined
    throw error
  }
}

async function atomicText(path: string, value: string) {
  await atomicBytes(path, new TextEncoder().encode(value))
}

async function atomicBytes(path: string, value: Uint8Array) {
  const temporary = temporaryPath(path)
  try {
    await writeFile(temporary, value, { flag: 'wx' })
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}

function temporaryPath(path: string) {
  return `${path}${TEMPORARY_PREFIX}${randomUUID()}`
}

function digest(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex')
}

function normalizeDigest(value: string) {
  const normalized = value.toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw new Error('Expected a SHA-256 hex digest.')
  return normalized
}

async function serialized<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => { release = resolve })
  const queued = previous.then(() => current)
  queues.set(key, queued)
  await previous
  try {
    return await operation()
  } finally {
    release()
    if (queues.get(key) === queued) queues.delete(key)
  }
}

function json(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function isMissingFile(error: unknown): error is { code: string } {
  return Boolean(error && typeof error === 'object' && (error as { code?: unknown }).code === 'ENOENT')
}

function isAlreadyExists(error: unknown): error is { code: string } {
  return Boolean(error && typeof error === 'object' && (error as { code?: unknown }).code === 'EEXIST')
}
