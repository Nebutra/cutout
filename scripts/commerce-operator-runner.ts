import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { constants } from 'node:fs'
import {
  chmod,
  lstat,
  link,
  mkdir,
  open,
  readFile,
  rename,
  unlink,
} from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { Writable } from 'node:stream'
import { stripVTControlCharacters } from 'node:util'
import { z } from 'zod'
import { canonicalJson, fingerprint } from '../src/design-ir/fingerprint'
import {
  COMMERCE_HELD_OUT_HOST_BUILD_VERSION,
  commerceHeldOutCommitmentSchema,
  decodeCommerceHeldOutEvaluatorPackage,
} from '../src/commerce-profile/held-out'
import {
  assertCommerceProductionProviderAuthority,
  decodeCommerceHeldOutPendingAdmission,
} from '../src/commerce-profile/production-runner'
import { verifyCommerceProductionRehearsalBundle } from '../src/commerce-profile/rehearsal'
import {
  admitCommerceHeldOutPending,
  runCommerceHeldOutEvaluatorPackage,
} from '../src/commerce-profile/production-session'
import { createCommerceProductionOperatorHost } from '../src/commerce-profile/operator-host'
import {
  COMMERCE_OPERATOR_MAXIMUM_REQUEST_BYTES,
  COMMERCE_OPERATOR_NATIVE_PROTOCOL,
  COMMERCE_OPERATOR_PROTOCOL,
  COMMERCE_OPERATOR_RESULT_FILES,
  commerceOperatorResultSchema,
  commerceOperatorStatusSchema,
  decodeCommerceOperatorRequestBytes,
  type CommerceOperatorNativeRequest,
  type CommerceOperatorRequest,
  type CommerceOperatorStatus,
} from '../src/commerce-profile/operator-protocol'

const MAXIMUM_NATIVE_RESPONSE_BYTES = 128 * 1024 * 1024
const MAXIMUM_STORED_DOCUMENT_BYTES = 384 * 1024 * 1024
const MAXIMUM_NATIVE_INPUT_MILLISECONDS = 30_000
const MAXIMUM_NATIVE_OPERATION_MILLISECONDS = 11 * 60 * 1_000
const NATIVE_INPUT_CHUNK_BYTES = 64 * 1024
const JOB_STATE_PROTOCOL = 'cutout.commerce-operator-job.v1' as const
const REQUEST_BINDING_FILE = 'request-binding.json'
const COMMITMENT_FILE = 'commitment.json'
const ACTIVE_FILE = 'active.json'
const LOCK_FILE = '.lock'
const NATIVE_HOST_MACOS_REQUIREMENT = 'identifier "com.nebutra.cutout.commerce-credential-owner"'
  + ' and anchor apple generic'
  + ' and certificate 1[field.1.2.840.113635.100.6.2.6] exists'
  + ' and certificate leaf[field.1.2.840.113635.100.6.1.13] exists'
  + ' and certificate leaf[subject.OU] = "2L5YC85FQ7"'

const jobStateSchema = z.object({
  protocol: z.literal(JOB_STATE_PROTOCOL),
  jobId: z.string().regex(/^[A-Za-z0-9_-]{16,80}$/),
  status: commerceOperatorStatusSchema,
  updatedAt: z.number().int().nonnegative(),
  diagnostic: z.string().min(1).max(240).optional(),
}).strict()

const requestBindingSchema = z.object({
  protocol: z.literal('cutout.commerce-operator-request-binding.v1'),
  jobId: z.string().regex(/^[A-Za-z0-9_-]{16,80}$/),
  providerId: z.string().min(1).max(240),
  evaluatorPackageHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict()

const activeProcessSchema = z.object({
  protocol: z.literal('cutout.commerce-operator-active-process.v1'),
  pid: z.number().int().positive(),
  startedAt: z.number().int().nonnegative(),
}).strict()

const nativeResponseSchema = z.object({
  protocol: z.literal(COMMERCE_OPERATOR_NATIVE_PROTOCOL),
  ok: z.boolean(),
  result: z.unknown().optional(),
  error: z.object({
    code: z.string().min(1).max(120),
    message: z.string().min(1).max(1_000),
  }).strict().optional(),
}).strict()

function appDataRoot(): string {
  if (process.platform === 'darwin') {
    const home = process.env.HOME
    if (!home) throw new Error('Commerce operator app-data root is unavailable.')
    return join(home, 'Library', 'Application Support', 'com.nebutra.cutout')
  }
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA
    if (!local) throw new Error('Commerce operator app-data root is unavailable.')
    return join(local, 'com.nebutra.cutout')
  }
  const base = process.env.XDG_DATA_HOME
    ?? (process.env.HOME ? join(process.env.HOME, '.local', 'share') : undefined)
  if (!base) throw new Error('Commerce operator app-data root is unavailable.')
  return join(base, 'com.nebutra.cutout')
}

function assertOwnedByCurrentUser(metadata: Awaited<ReturnType<typeof lstat>>): void {
  const effectiveUserId = process.geteuid?.()
  if (effectiveUserId !== undefined && metadata.uid !== effectiveUserId) {
    throw new Error('Commerce operator private storage ownership is invalid.')
  }
}

async function assertPrivateDirectory(path: string): Promise<void> {
  const metadata = await lstat(path)
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error('Commerce operator private job storage is invalid.')
  }
  assertOwnedByCurrentUser(metadata)
  if (process.platform !== 'win32') await chmod(path, 0o700)
}

export async function ensurePrivateDirectory(path: string, trustedRoot: string = path): Promise<void> {
  const root = resolve(trustedRoot)
  const target = resolve(path)
  const suffix = relative(root, target)
  if (suffix === '..' || suffix.startsWith(`..${sep}`) || isAbsolute(suffix)) {
    throw new Error('Commerce operator private job storage is outside its Host-owned root.')
  }

  await mkdir(root, { recursive: true, mode: 0o700 })
  await assertPrivateDirectory(root)
  let current = root
  for (const component of suffix.split(sep).filter(Boolean)) {
    current = join(current, component)
    try {
      await mkdir(current, { mode: 0o700 })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
    await assertPrivateDirectory(current)
  }
}

export async function atomicWrite(path: string, value: unknown): Promise<void> {
  const directory = dirname(path)
  await ensurePrivateDirectory(directory)
  const temporary = join(directory, `.tmp-${process.pid}-${globalThis.crypto.randomUUID()}`)
  const bytes = new TextEncoder().encode(`${canonicalJson(value)}\n`)
  const handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600)
  try {
    await handle.writeFile(bytes)
    await handle.sync()
  } finally {
    await handle.close()
  }
  await rename(temporary, path)
  if (process.platform !== 'win32') await chmod(path, 0o600)
}

export async function atomicPublish(path: string, value: unknown): Promise<void> {
  const directory = dirname(path)
  await ensurePrivateDirectory(directory)
  const temporary = join(directory, `.tmp-${process.pid}-${globalThis.crypto.randomUUID()}`)
  const bytes = new TextEncoder().encode(`${canonicalJson(value)}\n`)
  const handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600)
  try {
    await handle.writeFile(bytes)
    await handle.sync()
  } finally {
    await handle.close()
  }
  try {
    await link(temporary, path)
    if (process.platform !== 'win32') await chmod(path, 0o600)
  } finally {
    await unlink(temporary).catch(() => undefined)
  }
}

async function publishExact(path: string, value: unknown, label: string): Promise<void> {
  try {
    await atomicPublish(path, value)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    if (canonicalJson(await readJson(path)) !== canonicalJson(value)) {
      throw new Error(`${label} drifted from the exclusively published result.`)
    }
  }
}

async function readJson(path: string): Promise<unknown> {
  const metadata = await lstat(path)
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > MAXIMUM_STORED_DOCUMENT_BYTES) {
    throw new Error('Commerce operator stored document is invalid.')
  }
  assertOwnedByCurrentUser(metadata)
  if (process.platform !== 'win32' && (metadata.mode & 0o077) !== 0) {
    throw new Error('Commerce operator stored document permissions are invalid.')
  }
  return JSON.parse(await readFile(path, 'utf8')) as unknown
}

async function optionalJson(path: string): Promise<unknown | undefined> {
  try {
    return await readJson(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

async function writeState(
  jobDirectory: string,
  jobId: string,
  status: CommerceOperatorStatus,
  diagnostic?: string,
): Promise<void> {
  await atomicWrite(join(jobDirectory, COMMERCE_OPERATOR_RESULT_FILES.status), jobStateSchema.parse({
    protocol: JOB_STATE_PROTOCOL,
    jobId,
    status,
    updatedAt: Date.now(),
    ...(diagnostic ? { diagnostic } : {}),
  }))
}

export async function acquireJobLock(jobDirectory: string): Promise<() => Promise<void>> {
  const lockPath = join(jobDirectory, LOCK_FILE)
  try {
    const handle = await open(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600)
    await handle.writeFile(String(process.pid))
    await handle.close()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    const metadata = await lstat(lockPath)
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 32) {
      throw new Error('Commerce operator job lock is invalid.')
    }
    assertOwnedByCurrentUser(metadata)
    if (process.platform !== 'win32' && (metadata.mode & 0o077) !== 0) {
      throw new Error('Commerce operator job lock permissions are invalid.')
    }
    const pid = Number.parseInt(await readFile(lockPath, 'utf8'), 10)
    let active = Number.isInteger(pid) && pid > 0
    if (active) {
      try {
        process.kill(pid, 0)
      } catch {
        active = false
      }
    }
    if (active) throw new Error('Commerce operator job is already active.')
    await unlink(lockPath)
    return acquireJobLock(jobDirectory)
  }
  return async () => {
    await unlink(lockPath).catch(() => undefined)
  }
}

async function bindExactRequest(
  jobDirectory: string,
  request: Extract<CommerceOperatorRequest, { command: 'preflight' | 'run' | 'recover' }>,
): Promise<void> {
  const expected = requestBindingSchema.parse({
    protocol: 'cutout.commerce-operator-request-binding.v1',
    jobId: request.jobId,
    providerId: request.providerId,
    evaluatorPackageHash: await fingerprint(request.evaluatorPackage),
  })
  const path = join(jobDirectory, REQUEST_BINDING_FILE)
  const existing = await optionalJson(path)
  if (existing !== undefined && canonicalJson(requestBindingSchema.parse(existing)) !== canonicalJson(expected)) {
    throw new Error('Commerce operator recovery request drifted from the bound job.')
  }
  if (existing === undefined) await atomicPublish(path, expected)
}

function nativeExecutable(): string {
  const suffix = process.platform === 'win32' ? '.exe' : ''
  return join(dirname(process.execPath), `cutout-commerce-native-host${suffix}`)
}

async function assertNativeExecutable(executable: string): Promise<void> {
  const metadata = await lstat(executable)
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error('Commerce operator native Host is unavailable.')
  }
  assertOwnedByCurrentUser(metadata)
  if (process.platform !== 'darwin') return
  const verification = spawnSync('/usr/bin/codesign', [
    '--verify', '--strict', '--verbose=2', `-R=${NATIVE_HOST_MACOS_REQUIREMENT}`, executable,
  ], {
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'ignore', 'ignore'],
  })
  if (verification.error || verification.status !== 0) {
    throw new Error('Commerce operator native Host signature is invalid.')
  }
}

function nativeEnvironment(): NodeJS.ProcessEnv {
  const names = [
    'HOME', 'LOCALAPPDATA', 'APPDATA', 'USERPROFILE', 'XDG_CONFIG_HOME',
    'XDG_DATA_HOME', 'TMPDIR', 'TEMP', 'TMP', 'CUTOUT_COMMERCE_EVALUATOR_PUBKEY',
  ] as const
  return Object.fromEntries(names.flatMap((name) => {
    const value = process.env[name]
    return value === undefined ? [] : [[name, value]]
  }))
}

export async function writeNativeRequest(
  stream: Writable,
  bytes: Uint8Array,
): Promise<void> {
  for (let offset = 0; offset < bytes.byteLength; offset += NATIVE_INPUT_CHUNK_BYTES) {
    const chunk = bytes.subarray(offset, Math.min(
      offset + NATIVE_INPUT_CHUNK_BYTES,
      bytes.byteLength,
    ))
    if (!stream.write(chunk)) await once(stream, 'drain')
  }
  const completion = once(stream, 'finish')
  stream.end()
  await completion
}

async function invokeNative(request: CommerceOperatorNativeRequest, signal?: AbortSignal): Promise<unknown> {
  const executable = nativeExecutable()
  await assertNativeExecutable(executable)
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [], {
      env: nativeEnvironment(),
      shell: false,
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    const chunks: Buffer[] = []
    let size = 0
    let settled = false
    let inputTimer: ReturnType<typeof setTimeout> | undefined
    const operationTimer = setTimeout(
      () => fail('Commerce operator native request timed out.'),
      MAXIMUM_NATIVE_OPERATION_MILLISECONDS,
    )
    operationTimer.unref()
    const clearTimers = () => {
      clearTimeout(operationTimer)
      if (inputTimer) clearTimeout(inputTimer)
    }
    const fail = (message: string) => {
      if (settled) return
      settled = true
      clearTimers()
      child.kill('SIGTERM')
      reject(new Error(message))
    }
    const abort = () => fail('Commerce operator request was cancelled.')
    signal?.addEventListener('abort', abort, { once: true })
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.byteLength
      if (size > MAXIMUM_NATIVE_RESPONSE_BYTES) {
        fail('Commerce operator native response exceeded its byte limit.')
        return
      }
      chunks.push(chunk)
    })
    child.on('error', () => fail('Commerce operator native Host could not start.'))
    child.on('close', (code) => {
      signal?.removeEventListener('abort', abort)
      if (settled) return
      settled = true
      clearTimers()
      if (code !== 0) {
        reject(new Error('Commerce operator native Host failed.'))
        return
      }
      try {
        const response = nativeResponseSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')))
        if (!response.ok || response.result === undefined) {
          reject(new Error(response.error?.message ?? 'Commerce operator native request failed.'))
          return
        }
        resolve(response.result)
      } catch {
        reject(new Error('Commerce operator native response is invalid.'))
      }
    })
    inputTimer = setTimeout(
      () => fail('Commerce operator native request input timed out.'),
      MAXIMUM_NATIVE_INPUT_MILLISECONDS,
    )
    inputTimer.unref()
    const requestBytes = new TextEncoder().encode(canonicalJson(request))
    void writeNativeRequest(child.stdin, requestBytes).then(
      () => {
        if (inputTimer) clearTimeout(inputTimer)
        inputTimer = undefined
      },
      () => fail('Commerce operator native request input failed.'),
    )
  })
}

async function cancelJob(jobDirectory: string, request: Extract<CommerceOperatorRequest, { command: 'cancel' }>) {
  const state = jobStateSchema.parse(await readJson(join(jobDirectory, COMMERCE_OPERATOR_RESULT_FILES.status)))
  if (state.status === 'admitted') throw new Error('Admitted Commerce operator jobs cannot be cancelled.')
  await writeState(jobDirectory, request.jobId, 'cancelled')
  const active = await optionalJson(join(jobDirectory, ACTIVE_FILE))
  if (active) {
    const processRecord = activeProcessSchema.parse(active)
    try {
      process.kill(process.platform === 'win32' ? processRecord.pid : -processRecord.pid, 'SIGTERM')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
    }
  }
  return 'cancelled' as const
}

export function assertCommerceOperatorTransition(
  command: Exclude<CommerceOperatorRequest['command'], 'status' | 'cancel'>,
  status: CommerceOperatorStatus,
): void {
  const allowed: Record<typeof command, readonly CommerceOperatorStatus[]> = {
    preflight: ['created', 'preflighted', 'failed'],
    run: ['created', 'preflighted'],
    recover: ['preflighted', 'running', 'pending-evaluator', 'failed'],
    admit: ['pending-evaluator', 'admitted'],
  }
  if (!allowed[command].includes(status)) {
    throw new Error(`Commerce operator ${command} is invalid while the job is ${status}.`)
  }
}

async function dispatch(request: CommerceOperatorRequest, jobDirectory: string): Promise<CommerceOperatorStatus> {
  if (request.command === 'status') {
    const stored = await optionalJson(join(jobDirectory, COMMERCE_OPERATOR_RESULT_FILES.status))
    const status = stored ? jobStateSchema.parse(stored).status : 'created'
    await writeState(jobDirectory, request.jobId, status)
    return status
  }
  if (request.command === 'cancel') return cancelJob(jobDirectory, request)

  const release = await acquireJobLock(jobDirectory)
  try {
    const storedState = await optionalJson(join(jobDirectory, COMMERCE_OPERATOR_RESULT_FILES.status))
    const currentStatus = storedState ? jobStateSchema.parse(storedState).status : 'created'
    assertCommerceOperatorTransition(request.command, currentStatus)
    const retainedCommitmentValue = await optionalJson(join(jobDirectory, COMMITMENT_FILE))
    const retainedCommitment = retainedCommitmentValue === undefined
      ? undefined
      : commerceHeldOutCommitmentSchema.parse(retainedCommitmentValue)
    const operatorHost = createCommerceProductionOperatorHost({
      jobId: request.jobId,
      transport: { request: invokeNative },
      ...(retainedCommitment ? { retainedCommitment } : {}),
    })
    const host = {
      ...operatorHost,
      async createCommitment(value: Parameters<typeof operatorHost.createCommitment>[0]) {
        const commitment = await operatorHost.createCommitment(value)
        await publishExact(
          join(jobDirectory, COMMITMENT_FILE),
          commitment,
          'Commerce operator commitment checkpoint',
        )
        return commitment
      },
    }
    if (request.command === 'admit') {
      const storedPending = await decodeCommerceHeldOutPendingAdmission(
        await readJson(join(jobDirectory, COMMERCE_OPERATOR_RESULT_FILES.run)),
      )
      const admitted = await admitCommerceHeldOutPending({
        pending: storedPending,
        evaluatorAttestation: request.evaluatorAttestation,
        host,
      })
      await publishExact(
        join(jobDirectory, COMMERCE_OPERATOR_RESULT_FILES.admit),
        admitted,
        'Commerce operator admission',
      )
      await writeState(jobDirectory, request.jobId, 'admitted')
      return 'admitted'
    }

    const evaluatorPackage = await decodeCommerceHeldOutEvaluatorPackage(request.evaluatorPackage)
    await bindExactRequest(jobDirectory, { ...request, evaluatorPackage })
    if (request.command === 'preflight') {
      const preflight = await host.preflightProvider(request.providerId)
      assertCommerceProductionProviderAuthority(preflight.provider, preflight.hasKey)
      await publishExact(join(jobDirectory, COMMERCE_OPERATOR_RESULT_FILES.preflight), {
        protocol: 'cutout.commerce-operator-preflight.v1',
        hostBuildVersion: COMMERCE_HELD_OUT_HOST_BUILD_VERSION,
        providerId: request.providerId,
        inputManifestHash: evaluatorPackage.evaluatorChallenge.payload.inputManifestHash,
        allowedRunId: evaluatorPackage.evaluatorChallenge.payload.allowedRunId,
      }, 'Commerce operator preflight')
      await writeState(jobDirectory, request.jobId, 'preflighted')
      return 'preflighted'
    }

    const retained = await optionalJson(join(jobDirectory, COMMERCE_OPERATOR_RESULT_FILES.run))
    if (retained !== undefined) {
      const pending = await decodeCommerceHeldOutPendingAdmission(retained)
      await verifyCommerceProductionRehearsalBundle(pending.bundle, {
        heldOutCommitmentHash: pending.commitment.commitmentHash,
        host,
      })
      await writeState(jobDirectory, request.jobId, 'pending-evaluator')
      return 'pending-evaluator'
    }
    await writeState(jobDirectory, request.jobId, 'running')
    await atomicWrite(join(jobDirectory, ACTIVE_FILE), activeProcessSchema.parse({
      protocol: 'cutout.commerce-operator-active-process.v1',
      pid: process.pid,
      startedAt: Date.now(),
    }))
    const controller = new AbortController()
    let pending
    try {
      pending = await runCommerceHeldOutEvaluatorPackage({
        evaluatorPackage,
        providerId: request.providerId,
        signal: controller.signal,
        host,
      })
    } finally {
      await unlink(join(jobDirectory, ACTIVE_FILE)).catch(() => undefined)
    }
    await publishExact(
      join(jobDirectory, COMMERCE_OPERATOR_RESULT_FILES.run),
      pending,
      'Commerce operator pending evidence',
    )
    await writeState(jobDirectory, request.jobId, 'pending-evaluator')
    return 'pending-evaluator'
  } finally {
    await release()
  }
}

export function sanitizeFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Commerce operator request failed.'
  const redacted = stripVTControlCharacters(message)
    .replace(/\b(?:authorization|api[-_ ]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/giu, '[credential]')
    .replace(/(?:\bBearer\s+|\b(?:sk|rk|pk)-)[A-Za-z0-9._~+/-]+/giu, '[redacted]')
    .replace(/(?:file:\/\/)?(?:\/(?:Users|home|private|tmp|var\/folders)\/[^\s:)]+|[A-Za-z]:\\[^\s:)]+)/gu, '[private-path]')
  const bounded = [...redacted].filter((character) => {
    const codePoint = character.codePointAt(0)!
    return codePoint > 0x1f && codePoint !== 0x7f
  }).join('')
  return bounded.slice(0, 240) || 'Commerce operator request failed.'
}

async function readStandardInput(): Promise<Uint8Array> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of process.stdin) {
    const bytes = Buffer.from(chunk)
    size += bytes.byteLength
    if (size > COMMERCE_OPERATOR_MAXIMUM_REQUEST_BYTES) {
      throw new Error('Commerce operator request exceeds the bounded standard-input contract.')
    }
    chunks.push(bytes)
  }
  return new Uint8Array(Buffer.concat(chunks))
}

async function main(): Promise<void> {
  let request: CommerceOperatorRequest | undefined
  let jobDirectory: string | undefined
  try {
    request = decodeCommerceOperatorRequestBytes(await readStandardInput())
    const appRoot = appDataRoot()
    const operatorRoot = join(appRoot, 'commerce-operator')
    const jobsRoot = join(operatorRoot, 'jobs')
    await ensurePrivateDirectory(appRoot)
    jobDirectory = join(jobsRoot, request.jobId)
    await ensurePrivateDirectory(jobDirectory, appRoot)
    const status = await dispatch(request, jobDirectory)
    const result = commerceOperatorResultSchema.parse({
      protocol: COMMERCE_OPERATOR_PROTOCOL,
      jobId: request.jobId,
      command: request.command,
      status,
      resultFile: COMMERCE_OPERATOR_RESULT_FILES[request.command],
    })
    process.stdout.write(`${canonicalJson(result)}\n`)
  } catch (error) {
    const diagnostic = sanitizeFailure(error)
    if (request && jobDirectory) {
      const current = await optionalJson(join(jobDirectory, COMMERCE_OPERATOR_RESULT_FILES.status))
      const status = current ? jobStateSchema.parse(current).status : undefined
      if (status !== 'cancelled' && status !== 'admitted') {
        await writeState(jobDirectory, request.jobId, 'failed', diagnostic).catch(() => undefined)
      }
    }
    process.stderr.write('Commerce operator request failed.\n')
    process.exitCode = 1
  }
}

if (process.env.VITEST !== 'true') void main()
