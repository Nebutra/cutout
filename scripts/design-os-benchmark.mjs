import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { createServer } from 'vite'

const root = process.cwd()
const packagePath = resolve(root, 'package.json')
const commercePath = resolve(root, 'src/commerce-profile/benchmarks/current.json')
const snapshotPath = resolve(root, 'src/design-os-benchmark/benchmarks/current.json')
const evidencePointerPath = resolve(root, 'src/design-os-benchmark/benchmarks/current-evidence.json')
const nativeHostPath = resolve(root, 'src-tauri/target/release/cutout-commerce-native-host')
const maximumAdmittedBytes = 128 * 1024 * 1024
const maximumNativeResponseBytes = 128 * 1024 * 1024
const nativeTimeoutMilliseconds = 120_000
const nativeProtocol = 'cutout.commerce-operator-native.v1'
const evidencePointerSchema = 'design-os.benchmark-evidence-pointer.v1'
const jobIdPattern = /^[A-Za-z0-9_-]{16,80}$/u
const nativeHostMacosRequirement = 'identifier "com.nebutra.cutout.commerce-credential-owner"'
  + ' and anchor apple generic'
  + ' and certificate 1[field.1.2.840.113635.100.6.2.6] exists'
  + ' and certificate leaf[field.1.2.840.113635.100.6.1.13] exists'
  + ' and certificate leaf[subject.OU] = "2L5YC85FQ7"'
const identity = {
  id: 'benchmark-run:design-os:current',
  revision: 'benchmark-run:design-os:current:revision:1',
}

function canonical(value) {
  if (value === undefined) throw new Error('Canonical benchmark JSON cannot contain undefined.')
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
}

function parseArguments(args) {
  let write = false
  let admittedJob
  let separator = false
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--' && !separator) {
      separator = true
      continue
    }
    if (argument === '--write' && !write) {
      write = true
      continue
    }
    if (argument === '--admitted-job' && admittedJob === undefined) {
      admittedJob = args[index + 1]
      index += 1
      if (!admittedJob || !jobIdPattern.test(admittedJob)) {
        throw new Error('--admitted-job requires one opaque Commerce operator job id.')
      }
      continue
    }
    throw new Error(`Unsupported Design OS benchmark argument: ${argument ?? '<missing>'}`)
  }
  return { write, admittedJob }
}

function appDataRoot() {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'com.nebutra.cutout')
  }
  if (process.platform === 'win32') {
    const base = process.env.LOCALAPPDATA ?? process.env.APPDATA
    if (!base) throw new Error('Cutout application-data storage is unavailable.')
    return join(base, 'com.nebutra.cutout')
  }
  const base = process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share')
  return join(base, 'com.nebutra.cutout')
}

function decodeEvidencePointer(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).sort().join(',') !== [
      'admittedEvidenceSha256',
      'attestationId',
      'bundleHash',
      'hostBuildVersion',
      'jobId',
      'schema',
    ].sort().join(',')
    || input.schema !== evidencePointerSchema
    || typeof input.jobId !== 'string' || !jobIdPattern.test(input.jobId)
    || typeof input.admittedEvidenceSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(input.admittedEvidenceSha256)
    || typeof input.bundleHash !== 'string' || !/^[a-f0-9]{64}$/u.test(input.bundleHash)
    || typeof input.attestationId !== 'string' || input.attestationId.length < 1 || input.attestationId.length > 240
    || typeof input.hostBuildVersion !== 'string' || input.hostBuildVersion.length < 1 || input.hostBuildVersion.length > 40) {
    throw new Error('The current Design OS admitted-evidence pointer is invalid.')
  }
  return input
}

async function optionalEvidencePointer() {
  try {
    return decodeEvidencePointer(JSON.parse(await readFile(evidencePointerPath, 'utf8')))
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}

function assertPrivateMetadata(metadata, label, maximumBytes) {
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size < 1 || metadata.size > maximumBytes) {
    throw new Error(`${label} is not a bounded regular file.`)
  }
  if (process.geteuid && metadata.uid !== process.geteuid()) {
    throw new Error(`${label} ownership is invalid.`)
  }
  if (process.platform !== 'win32' && (metadata.mode & 0o077) !== 0) {
    throw new Error(`${label} permissions are invalid.`)
  }
}

function assertPrivateDirectoryMetadata(metadata) {
  if (!metadata.isDirectory() || metadata.isSymbolicLink()
    || (process.geteuid && metadata.uid !== process.geteuid())
    || (process.platform !== 'win32' && (metadata.mode & 0o077) !== 0)) {
    throw new Error('The admitted Commerce operator storage boundary is invalid.')
  }
}

async function readAdmittedEvidence(jobId, expectedHash) {
  const appRoot = appDataRoot()
  const operatorRoot = join(appRoot, 'commerce-operator')
  const jobsRoot = join(operatorRoot, 'jobs')
  const jobDirectory = join(jobsRoot, jobId)
  for (const directory of [appRoot, operatorRoot, jobsRoot, jobDirectory]) {
    assertPrivateDirectoryMetadata(await lstat(directory))
  }
  const path = join(jobDirectory, 'admitted.json')
  assertPrivateMetadata(await lstat(path), 'Admitted Commerce evidence', maximumAdmittedBytes)
  const bytes = await readFile(path)
  const contentHash = createHash('sha256').update(bytes).digest('hex')
  if (expectedHash && contentHash !== expectedHash) {
    throw new Error('Admitted Commerce evidence drifted from the durable benchmark pointer.')
  }
  return { input: JSON.parse(bytes.toString('utf8')), contentHash }
}

function nativeEnvironment() {
  return Object.fromEntries([
    'HOME', 'LOCALAPPDATA', 'APPDATA', 'USERPROFILE', 'XDG_CONFIG_HOME',
    'XDG_DATA_HOME', 'TMPDIR', 'TEMP', 'TMP', 'CUTOUT_COMMERCE_EVALUATOR_PUBKEY',
  ].flatMap((name) => {
    const value = process.env[name]
    return value === undefined ? [] : [[name, value]]
  }))
}

async function assertNativeHost() {
  const metadata = await lstat(nativeHostPath)
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error('The fixed Commerce benchmark native Host is unavailable.')
  }
  if (process.geteuid && metadata.uid !== process.geteuid()) {
    throw new Error('The fixed Commerce benchmark native Host ownership is invalid.')
  }
  if (process.platform !== 'darwin') {
    throw new Error('Admitted Commerce benchmark verification requires the signed macOS native Host.')
  }
  const verification = spawnSync('/usr/bin/codesign', [
    '--verify', '--strict', '--verbose=2', `-R=${nativeHostMacosRequirement}`, nativeHostPath,
  ], {
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'ignore', 'ignore'],
  })
  if (verification.error || verification.status !== 0) {
    throw new Error('The fixed Commerce benchmark native Host signature is invalid.')
  }
}

function invokeNative(input) {
  const requestBytes = Buffer.from(canonical(input))
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(nativeHostPath, [], {
      env: nativeEnvironment(),
      shell: false,
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    const chunks = []
    let size = 0
    let settled = false
    const timer = setTimeout(() => fail('Native Commerce benchmark verification timed out.'), nativeTimeoutMilliseconds)
    timer.unref()
    const fail = (message) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.kill('SIGTERM')
      rejectPromise(new Error(message))
    }
    child.on('error', () => fail('The fixed Commerce benchmark native Host could not start.'))
    child.stdout.on('data', (chunk) => {
      size += chunk.byteLength
      if (size > maximumNativeResponseBytes) {
        fail('Native Commerce benchmark verification exceeded its response limit.')
        return
      }
      chunks.push(Buffer.from(chunk))
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code !== 0) {
        rejectPromise(new Error('Native Commerce benchmark verification failed.'))
        return
      }
      try {
        const response = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        if (!response || typeof response !== 'object' || Array.isArray(response)
          || response.protocol !== nativeProtocol || response.ok !== true
          || !Object.hasOwn(response, 'result')) {
          rejectPromise(new Error('Native Commerce benchmark verification returned an invalid response.'))
          return
        }
        resolvePromise(response.result)
      } catch {
        rejectPromise(new Error('Native Commerce benchmark verification returned invalid JSON.'))
      }
    })
    child.stdin.on('error', () => fail('Native Commerce benchmark verification input failed.'))
    child.stdin.end(requestBytes)
  })
}

const argumentsValue = parseArguments(process.argv.slice(2))
const retainedPointer = await optionalEvidencePointer()
if (retainedPointer && argumentsValue.admittedJob && !argumentsValue.write
  && retainedPointer.jobId !== argumentsValue.admittedJob) {
  throw new Error('The requested admitted job differs from the durable benchmark pointer.')
}
const admittedJob = argumentsValue.admittedJob ?? retainedPointer?.jobId

const packageManifest = JSON.parse(await readFile(packagePath, 'utf8'))
if (typeof packageManifest.version !== 'string' || packageManifest.version.length === 0) {
  throw new Error('Cutout package version is invalid.')
}

const server = await createServer({
  root,
  configFile: false,
  appType: 'custom',
  define: { __CUTOUT_VERSION__: JSON.stringify(packageManifest.version) },
  server: { middlewareMode: true, hmr: false },
  resolve: { alias: { '@': resolve(root, 'src') } },
  logLevel: 'error',
})

try {
  const { createDesignOsBenchmarkFromCommerce } = await server.ssrLoadModule('/src/design-os-benchmark/commerce.ts')
  const {
    decodeDesignOsBenchmarkReport,
    designOsBenchmarkReportSchema,
  } = await server.ssrLoadModule('/src/design-os-benchmark/contracts.ts')
  const {
    commerceProfileBenchmarkReportSchema,
    createCommerceProfileBenchmarkReportFromHeldOutRehearsal,
  } = await server.ssrLoadModule('/src/commerce-profile/benchmark.ts')
  const { createCommerceProductionOperatorHost } = await server.ssrLoadModule('/src/commerce-profile/operator-host.ts')
  const { decodeCommerceHeldOutAdmittedEvidence } = await server.ssrLoadModule('/src/commerce-profile/production-session.ts')
  const commerceReport = JSON.parse(await readFile(commercePath, 'utf8'))
  let generated
  let generatedCommerce
  let generatedPointer

  if (admittedJob) {
    await assertNativeHost()
    const retained = await readAdmittedEvidence(
      admittedJob,
      retainedPointer?.jobId === admittedJob ? retainedPointer.admittedEvidenceSha256 : undefined,
    )
    const host = createCommerceProductionOperatorHost({
      jobId: admittedJob,
      transport: { request: invokeNative },
    })
    const admitted = await decodeCommerceHeldOutAdmittedEvidence(retained.input, host)
    const verifiedCommerce = await createCommerceProfileBenchmarkReportFromHeldOutRehearsal({
      baselineReport: commerceReport,
      rehearsalBundle: admitted.pending.bundle,
      commitment: admitted.pending.commitment,
      evaluatorAttestation: admitted.evaluatorAttestation,
      host,
    })
    generatedCommerce = verifiedCommerce.report
    generated = admitted.benchmarkReport
    generatedPointer = decodeEvidencePointer({
      schema: evidencePointerSchema,
      jobId: admittedJob,
      admittedEvidenceSha256: retained.contentHash,
      bundleHash: admitted.pending.completionRequest.bundleHash,
      attestationId: admitted.evaluatorAttestation.payload.attestationId,
      hostBuildVersion: admitted.evaluatorAttestation.payload.hostBuildVersion,
    })
  } else {
    generatedCommerce = commerceReport
    generated = await createDesignOsBenchmarkFromCommerce({ commerceReport, identity })
  }

  const rendered = `${JSON.stringify(generated, null, 2)}\n`
  const renderedCommerce = `${JSON.stringify(generatedCommerce, null, 2)}\n`

  if (argumentsValue.write) {
    await mkdir(dirname(snapshotPath), { recursive: true })
    await Promise.all([
      writeFile(commercePath, renderedCommerce),
      writeFile(snapshotPath, rendered),
      ...(generatedPointer
        ? [writeFile(evidencePointerPath, `${JSON.stringify(generatedPointer, null, 2)}\n`)]
        : []),
    ])
  } else {
    const persisted = admittedJob
      ? designOsBenchmarkReportSchema.parse(JSON.parse(await readFile(snapshotPath, 'utf8')))
      : decodeDesignOsBenchmarkReport(JSON.parse(await readFile(snapshotPath, 'utf8')))
    if (canonical(persisted) !== canonical(generated)) {
      throw new Error('The current Design OS benchmark snapshot is stale. Run pnpm benchmark:design-os:update.')
    }
    if (admittedJob) {
      const persistedCommerce = commerceProfileBenchmarkReportSchema.parse(
        JSON.parse(await readFile(commercePath, 'utf8')),
      )
      if (canonical(persistedCommerce) !== canonical(generatedCommerce)) {
        throw new Error('The current Commerce benchmark snapshot drifted from its admitted evidence.')
      }
    }
  }

  const stages = generated.summary.stages.map((stage) => (
    `${stage.stage} ${stage.passed}/${stage.total}`
  )).join(' | ')
  const coverage = (generated.summary.coverage.basisPoints / 100).toFixed(2)
  const frontier = generated.summary.criticalFrontier.map((metric) => metric.metricId).join(', ') || 'none'
  console.log(`Design OS maturity: ${generated.summary.maturity}`)
  console.log(`Coverage: ${generated.summary.coverage.passed}/${generated.summary.coverage.total} (${coverage}%)`)
  console.log(stages)
  console.log(`Critical frontier: ${frontier}`)
  console.log(`Production ready: ${generated.summary.productionReady ? 'yes' : 'no'}`)
} finally {
  await server.close()
}
