import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { deflateSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { prototypeRouteGraphFingerprint } from '../src/prototype/prototype-plan'

const roots: string[] = []
const validator = resolve('scripts/validate-packaged-e2e-evidence.mjs')

function crc32(bytes: Buffer): number {
  let crc = ~0
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return ~crc >>> 0
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, checksum])
}

function patternedPng(width: number, height: number, seed: number, solid = false): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  const stride = 1 + width * 3
  const raw = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * stride] = 0
    for (let x = 0; x < width; x += 1) {
      const offset = y * stride + 1 + x * 3
      raw[offset] = solid ? seed : (x * 31 + y * 17 + seed) & 0xff
      raw[offset + 1] = solid ? seed : (x * 11 + y * 47 + seed * 3) & 0xff
      raw[offset + 2] = solid ? seed : (x * 53 + y * 7 + seed * 5) & 0xff
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'cutout-packaged-evidence-'))
  roots.push(root)
  mkdirSync(join(root, 'captures'))
  const captureIds = ['design-systems', 'prototype-suites', 'selected-delivery']
  const captures = captureIds.map((id, index) => {
    const bytes = patternedPng(640, 480, index + 1)
    writeFileSync(join(root, 'captures', `${id}.png`), bytes)
    return { id, sha256: sha256(bytes), width: 640, height: 480, byteLength: bytes.length }
  })
  const intent = 'Build a calm travel planning app.'
  const page = {
    id: 'page:trips',
    name: 'Trips',
    route: '/trips',
    purpose: 'Plan and review trips.',
    regions: [{ id: 'region:hero', name: 'Trip overview', role: 'hero', summary: 'Trip overview.' }],
    overlays: [],
    states: [],
    interactions: [],
  }
  const plan = {
    version: 'prototype-plan.v0',
    pages: [page],
    flows: [{
      id: 'flow:plan',
      name: 'Plan a trip',
      goal: 'Review the trip workspace.',
      startPageId: page.id,
      steps: [],
    }],
  }
  const designSystemBytes = patternedPng(320, 240, 11)
  const pageBytes = patternedPng(640, 480, 17)
  const designSystemMedia = {
    mediaType: 'image/png', width: 320, height: 240, sha256: sha256(designSystemBytes),
  }
  const pageMedia = [{
    ordinal: 1, route: page.route, mediaType: 'image/png',
    width: 640, height: 480, sha256: sha256(pageBytes),
  }]
  const routeGraph = prototypeRouteGraphFingerprint(plan)
  const documents = {
    plan: canonicalJson(plan),
    designMarkdown: '# Travel system',
    cssVariables: ':root { --surface: #fff; }',
    tailwindTheme: 'export const theme = { surface: "#fff" }',
    tokensJson: '{}',
    designIrTokens: '{}',
    routeGraph,
    pageMedia: canonicalJson(pageMedia),
    manifest: canonicalJson({ assets: [] }),
    bindings: '[]',
    resourcePack: canonicalJson({
      id: 'resource-pack:fixture', manifestProvenanceId: 'provenance:fixture', bindings: [],
    }),
    resourceArtifacts: '[]',
    provenance: '{}',
    reviewDocument: '{}',
    pageReviews: canonicalJson([{ pageId: page.id, review: {} }]),
    resourceReviews: '[]',
  }
  const files: Array<Record<string, unknown>> = []
  const persistObject = (input: Record<string, unknown>, bytes: Buffer) => {
    const digest = sha256(bytes)
    mkdirSync(join(root, 'objects'), { recursive: true })
    writeFileSync(join(root, 'objects', digest), bytes)
    files.push({ ...input, path: `objects/${digest}`, sha256: digest, byteLength: bytes.length })
    return digest
  }
  const designIr = canonicalJson({ version: 'design-ir.v1', prototype: { plan } })
  persistObject({ role: 'designIr' }, Buffer.from(designIr))
  const documentDigests = Object.fromEntries(Object.entries(documents).map(([role, content]) => [
    role,
    persistObject({ role, candidateId: 'suite-1' }, Buffer.from(content)),
  ]))
  persistObject({
    role: 'designSystemMedia', candidateId: 'suite-1',
    mediaType: 'image/png', width: 320, height: 240,
  }, designSystemBytes)
  persistObject({
    role: 'pageMediaObject', candidateId: 'suite-1', ordinal: 1,
    mediaType: 'image/png', width: 640, height: 480,
  }, pageBytes)
  const phaseIds = [
    'native-boot', 'webview-loaded', 'webview-renderable',
    'ai-native-candidate-resolved', 'ai-native-catalog-checked', 'provider-response',
    'planner-complete', 'design-candidates-ready', 'prototype-suite-ready', 'resource-pack-ready',
  ]
  const phases = phaseIds.map((id, index) => ({ id, status: 'passed', elapsedMs: index }))
  const outcome = {
    intent: { text: intent, sha256: sha256(intent) },
    designSystems: [{ candidateId: 'design-1', status: 'ready' }],
    prototypeSuites: [{
      candidateId: 'suite-1',
      designSystemId: 'design-1',
      resourcePackId: 'resource-pack-1',
      status: 'ready',
      routes: ['/trips'],
      routeCount: 1,
      pageCount: 1,
      resourceAssetCount: 0,
      artifactCount: 0,
      qualityReviewStatus: 'passed',
      routeGraph,
      designSystemMedia,
      pageMedia,
      resourceMedia: [],
      digests: { ...documentDigests, designSystemImage: designSystemMedia.sha256 },
    }],
    captures,
    evidence: {
      protocol: 'cutout.packaged-e2e-evidence.v1',
      providerRoutes: [{
        purpose: 'image', kind: 'openai', model: 'gpt-image-2', classification: 'remote',
      }],
      files,
    },
    selectedSuiteId: 'suite-1',
    selectedVisibleSliceCount: 0,
    planningTurnCount: 2,
    planningRuntimeCounts: { codexSystem: 0, direct: 2 },
    plannedImageCallCount: 2,
    imageCallCount: 2,
    retryCount: 0,
    retryImageCallCount: 0,
  }
  const result = {
    protocol: 'cutout.packaged-e2e-result.v1',
    status: 'passed',
    phases,
    failure: null,
    outcome,
    completedAt: 1,
  }
  writeFileSync(join(root, 'result.json'), JSON.stringify(result))
  writeFileSync(join(root, 'progress.json'), JSON.stringify({
    protocol: result.protocol, status: result.status, phases,
  }))
  writeFileSync(join(root, 'foreground.json'), JSON.stringify({
    foregroundOwnershipPreserved: true,
    sampleCount: 5,
    changedSampleCount: 1,
    maxConsecutiveChangedSamples: 1,
    baselineBundleIdSha256: sha256('com.apple.finder'),
  }))
  return { root, result }
}

function rewriteDocument(
  root: string,
  result: ReturnType<typeof fixture>['result'],
  role: string,
  value: unknown,
): void {
  const file = result.outcome.evidence.files.find((item) => item.role === role)
  if (!file) throw new Error(`Missing fixture role: ${role}`)
  const bytes = Buffer.from(canonicalJson(value))
  const digest = sha256(bytes)
  writeFileSync(join(root, 'objects', digest), bytes)
  file.path = `objects/${digest}`
  file.sha256 = digest
  file.byteLength = bytes.length
  if (role !== 'designIr') result.outcome.prototypeSuites[0].digests[role] = digest
  writeFileSync(join(root, 'result.json'), JSON.stringify(result))
}

describe('packaged E2E external evidence validator', () => {
  it('independently verifies terminal, plan, media, capture and foreground evidence', () => {
    const { root } = fixture()
    expect(execFileSync(process.execPath, [validator, root], { encoding: 'utf8' }))
      .toContain('1 candidate suite(s)')
  })

  it('rejects a capture changed after the native terminal write', () => {
    const { root } = fixture()
    const capture = join(root, 'captures', 'selected-delivery.png')
    writeFileSync(capture, Buffer.concat([readFileSync(capture), Buffer.from([0])]))
    expect(() => execFileSync(process.execPath, [validator, root], { stdio: 'pipe' })).toThrow()
  })

  it('rejects changed or symlinked content-addressed evidence objects', () => {
    const changed = fixture()
    const file = changed.result.outcome.evidence.files.find((item) => item.role === 'plan')!
    writeFileSync(join(changed.root, String(file.path)), 'tampered')
    expect(() => execFileSync(process.execPath, [validator, changed.root], { stdio: 'pipe' }))
      .toThrow()

    const linked = fixture()
    const linkedFile = linked.result.outcome.evidence.files.find((item) => item.role === 'plan')!
    const objectPath = join(linked.root, String(linkedFile.path))
    const target = join(linked.root, 'linked-plan')
    writeFileSync(target, readFileSync(objectPath))
    rmSync(objectPath)
    symlinkSync(target, objectPath)
    expect(() => execFileSync(process.execPath, [validator, linked.root], { stdio: 'pipe' }))
      .toThrow()
  })

  it('rejects object traversal and intrinsic media dimension drift', () => {
    const traversal = fixture()
    traversal.result.outcome.evidence.files[0]!.path = '../design-ir.json'
    writeFileSync(join(traversal.root, 'result.json'), JSON.stringify(traversal.result))
    expect(() => execFileSync(process.execPath, [validator, traversal.root], { stdio: 'pipe' }))
      .toThrow()

    const dimensions = fixture()
    const media = dimensions.result.outcome.evidence.files.find(
      (item) => item.role === 'pageMediaObject',
    )!
    media.width = 641
    dimensions.result.outcome.prototypeSuites[0].pageMedia[0]!.width = 641
    writeFileSync(join(dimensions.root, 'result.json'), JSON.stringify(dimensions.result))
    expect(() => execFileSync(process.execPath, [validator, dimensions.root], { stdio: 'pipe' }))
      .toThrow()
  })

  it('rejects plan, resource manifest and Design IR completeness drift', () => {
    const plan = fixture()
    const originalPlan = JSON.parse(readFileSync(
      join(plan.root, String(plan.result.outcome.evidence.files.find((item) => item.role === 'plan')!.path)),
      'utf8',
    ))
    rewriteDocument(plan.root, plan.result, 'plan', {
      ...originalPlan,
      pages: [...originalPlan.pages, { ...originalPlan.pages[0], id: 'page:extra', route: '/extra' }],
    })
    expect(() => execFileSync(process.execPath, [validator, plan.root], { stdio: 'pipe' }))
      .toThrow()

    const manifest = fixture()
    rewriteDocument(manifest.root, manifest.result, 'manifest', {
      assets: [{ id: 'asset:unbound' }],
    })
    expect(() => execFileSync(process.execPath, [validator, manifest.root], { stdio: 'pipe' }))
      .toThrow()

    const designIr = fixture()
    rewriteDocument(designIr.root, designIr.result, 'designIr', {
      version: 'design-ir.v1',
      prototype: { plan: { pages: [{ route: '/different' }] } },
    })
    expect(() => execFileSync(process.execPath, [validator, designIr.root], { stdio: 'pipe' }))
      .toThrow()
  })

  it('requires a remote image Provider route without retaining its origin or id', () => {
    const { root, result } = fixture()
    result.outcome.evidence.providerRoutes[0]!.classification = 'local'
    writeFileSync(join(root, 'result.json'), JSON.stringify(result))
    expect(() => execFileSync(process.execPath, [validator, root], { stdio: 'pipe' })).toThrow()
  })

  it('rejects 1x1, low-information and missing contact-sheet captures', () => {
    for (const [width, height, solid] of [[1, 1, false], [640, 480, true]] as const) {
      const candidate = fixture()
      const bytes = patternedPng(width, height, 91, solid)
      writeFileSync(join(candidate.root, 'captures', 'selected-delivery.png'), bytes)
      const capture = candidate.result.outcome.captures.find(
        (item) => item.id === 'selected-delivery',
      )!
      capture.width = width
      capture.height = height
      capture.byteLength = bytes.length
      capture.sha256 = sha256(bytes)
      writeFileSync(join(candidate.root, 'result.json'), JSON.stringify(candidate.result))
      expect(() => execFileSync(process.execPath, [validator, candidate.root], { stdio: 'pipe' }))
        .toThrow()
    }

    const missing = fixture()
    rmSync(join(missing.root, 'captures', 'prototype-suites.png'))
    expect(() => execFileSync(process.execPath, [validator, missing.root], { stdio: 'pipe' }))
      .toThrow()
  })

  it('rejects retained secrets, user paths and foreground activation', () => {
    const secret = fixture()
    secret.result.outcome.intent.text = 'Authorization: Bearer sk-test-secret'
    secret.result.outcome.intent.sha256 = sha256(secret.result.outcome.intent.text)
    writeFileSync(join(secret.root, 'result.json'), JSON.stringify(secret.result))
    expect(() => execFileSync(process.execPath, [validator, secret.root], { stdio: 'pipe' }))
      .toThrow()

    const path = fixture()
    path.result.outcome.intent.text = '/Users/example/private'
    path.result.outcome.intent.sha256 = sha256(path.result.outcome.intent.text)
    writeFileSync(join(path.root, 'result.json'), JSON.stringify(path.result))
    expect(() => execFileSync(process.execPath, [validator, path.root], { stdio: 'pipe' }))
      .toThrow()

    for (const localPath of [
      '/private/tmp/cutout-private/evidence.json',
      String.raw`C:\temp\cutout-private\evidence.json`,
    ]) {
      const local = fixture()
      local.result.outcome.intent.text = localPath
      local.result.outcome.intent.sha256 = sha256(localPath)
      writeFileSync(join(local.root, 'result.json'), JSON.stringify(local.result))
      expect(() => execFileSync(process.execPath, [validator, local.root], { stdio: 'pipe' }))
        .toThrow()
    }

    const foreground = fixture()
    writeFileSync(join(foreground.root, 'foreground.json'), JSON.stringify({
      foregroundOwnershipPreserved: false,
      sampleCount: 2,
      changedSampleCount: 2,
      maxConsecutiveChangedSamples: 2,
      baselineBundleIdSha256: sha256('com.apple.finder'),
    }))
    expect(() => execFileSync(process.execPath, [validator, foreground.root], { stdio: 'pipe' }))
      .toThrow()

    const persistentForeground = fixture()
    writeFileSync(join(persistentForeground.root, 'foreground.json'), JSON.stringify({
      foregroundOwnershipPreserved: true,
      sampleCount: 8,
      changedSampleCount: 2,
      maxConsecutiveChangedSamples: 2,
      baselineBundleIdSha256: sha256('com.apple.finder'),
    }))
    expect(() => execFileSync(
      process.execPath,
      [validator, persistentForeground.root],
      { stdio: 'pipe' },
    )).toThrow()
  })

  it('rejects duplicate media across artifact roles', () => {
    const { root, result } = fixture()
    result.outcome.prototypeSuites[0].pageMedia[0].sha256 =
      result.outcome.prototypeSuites[0].designSystemMedia.sha256
    writeFileSync(join(root, 'result.json'), JSON.stringify(result))
    expect(() => execFileSync(process.execPath, [validator, root], { stdio: 'pipe' }))
      .toThrow()
  })

  it('rejects attention-required output as release-quality evidence', () => {
    const { root, result } = fixture()
    result.outcome.prototypeSuites[0].qualityReviewStatus = 'attention-required'
    writeFileSync(join(root, 'result.json'), JSON.stringify(result))
    expect(() => execFileSync(process.execPath, [validator, root], { stdio: 'pipe' }))
      .toThrow()
  })

  it('rejects a route graph outcome that does not match the retained canonical plan graph', () => {
    const { root, result } = fixture()
    const graph = JSON.parse(result.outcome.prototypeSuites[0].routeGraph)
    graph.pages[0].regions[0].summary = 'Tampered information hierarchy.'
    result.outcome.prototypeSuites[0].routeGraph = JSON.stringify(graph)
    writeFileSync(join(root, 'result.json'), JSON.stringify(result))

    expect(() => execFileSync(process.execPath, [validator, root], { stdio: 'pipe' }))
      .toThrow()
  })

  it('rejects planning runtime provenance that does not match successful turns', () => {
    const { root, result } = fixture()
    result.outcome.planningRuntimeCounts.direct = 1
    writeFileSync(join(root, 'result.json'), JSON.stringify(result))
    expect(() => execFileSync(process.execPath, [validator, root], { stdio: 'pipe' }))
      .toThrow()
  })

  it('atomically finalizes a complete release-quality bundle with its exit code', () => {
    const { root } = fixture()
    writeFileSync(join(root, 'captures', 'failure.png'), patternedPng(640, 480, 99))
    const finalized = spawnSync(
      process.execPath,
      [validator, '--finalize', root, '0', 'full', 'passed'],
      { encoding: 'utf8' },
    )

    expect(finalized.status).toBe(0)
    const evidence = join(root, 'final-evidence')
    const harness = JSON.parse(readFileSync(join(evidence, 'harness.json'), 'utf8'))
    expect(harness).toMatchObject({
      protocol: 'cutout.packaged-e2e-harness.v1',
      status: 'passed',
      mode: 'full',
      reason: 'passed',
      smokeExitCode: 0,
      successfulSummary: { count: 1, imageCallCount: 2 },
    })
    expect(readFileSync(join(evidence, 'smoke.exit'), 'utf8')).toBe('0\n')
    expect(readFileSync(join(evidence, 'result.json'), 'utf8')).toContain('"status": "passed"')
    expect(readdirSync(join(evidence, 'captures'))).not.toContain('failure.png')
    const objectPaths = harness.retainedFiles
      .map((file: { name: string }) => file.name)
      .filter((name: string) => name.startsWith('objects/'))
    expect(objectPaths).toHaveLength(new Set(objectPaths).size)
    expect(objectPaths.length).toBeGreaterThan(1)
    expect(objectPaths.every((name: string) => readFileSync(join(evidence, name)).length > 0))
      .toBe(true)
    expect(execFileSync(process.execPath, [validator, evidence], { encoding: 'utf8' }))
      .toContain('1 candidate suite(s)')
    expect(spawnSync(
      process.execPath,
      [validator, '--finalize', root, '0', 'full', 'passed'],
      { encoding: 'utf8' },
    ).status).toBe(0)
    expect(readdirSync(root).some((name) => name.startsWith('.final-evidence-'))).toBe(false)
  })

  it('closes an outer timeout into matching failed renderer and harness evidence', () => {
    const { root } = fixture()
    rmSync(join(root, 'result.json'))
    writeFileSync(join(root, 'progress.json'), JSON.stringify({
      protocol: 'cutout.packaged-e2e-result.v1',
      status: 'running',
      phases: [{ id: 'prototype-suite-ready', status: 'passed', elapsedMs: 100 }],
    }))
    const finalized = spawnSync(
      process.execPath,
      [validator, '--finalize', root, '124', 'full', 'outer-timeout'],
      { encoding: 'utf8' },
    )

    expect(finalized.status).toBe(0)
    const evidence = join(root, 'final-evidence')
    expect(JSON.parse(readFileSync(join(evidence, 'harness.json'), 'utf8'))).toMatchObject({
      status: 'failed',
      reason: 'outer-timeout',
      smokeExitCode: 124,
    })
    expect(readFileSync(join(evidence, 'smoke.exit'), 'utf8')).toBe('124\n')
    const progress = JSON.parse(readFileSync(join(root, 'progress.json'), 'utf8'))
    const result = JSON.parse(readFileSync(join(root, 'result.json'), 'utf8'))
    expect(progress).toMatchObject({
      status: 'failed',
      phases: expect.arrayContaining([
        { id: 'packaged-e2e-timeout', status: 'failed', elapsedMs: 100 },
      ]),
    })
    expect(result).toMatchObject({
      status: 'failed',
      phases: progress.phases,
      failure: {
        phase: 'packaged-e2e-timeout',
        code: 'journey-timeout',
        diagnostic: 'orchestration-state',
      },
      outcome: null,
    })
    expect(JSON.parse(readFileSync(join(evidence, 'progress.json'), 'utf8'))).toEqual(progress)
    expect(JSON.parse(readFileSync(join(evidence, 'result.json'), 'utf8'))).toEqual(result)
  })

  it('records SIGTERM as exit 143 with a closed failed terminal pair', () => {
    const { root } = fixture()
    rmSync(join(root, 'result.json'))
    rmSync(join(root, 'progress.json'))
    const finalized = spawnSync(
      process.execPath,
      [validator, '--finalize', root, '143', 'full', 'terminated'],
      { encoding: 'utf8' },
    )

    expect(finalized.status).toBe(0)
    const evidence = join(root, 'final-evidence')
    expect(JSON.parse(readFileSync(join(evidence, 'harness.json'), 'utf8'))).toMatchObject({
      status: 'failed', reason: 'terminated', smokeExitCode: 143,
    })
    expect(readFileSync(join(evidence, 'smoke.exit'), 'utf8')).toBe('143\n')
    const progress = JSON.parse(readFileSync(join(root, 'progress.json'), 'utf8'))
    const result = JSON.parse(readFileSync(join(root, 'result.json'), 'utf8'))
    expect(progress).toMatchObject({
      status: 'failed',
      phases: [{ id: 'packaged-e2e-signal', status: 'failed', elapsedMs: 0 }],
    })
    expect(result).toMatchObject({
      status: 'failed', phases: progress.phases,
      failure: { phase: 'packaged-e2e-signal', code: 'run-failed' },
    })
  })

  it('downgrades invalid claimed success and never retains sensitive result data', () => {
    const { root, result } = fixture()
    result.outcome.intent.text = 'Authorization: Bearer sk-sensitive-value'
    result.outcome.intent.sha256 = sha256(result.outcome.intent.text)
    writeFileSync(join(root, 'result.json'), JSON.stringify(result))
    const finalized = spawnSync(
      process.execPath,
      [validator, '--finalize', root, '0', 'full', 'passed'],
      { encoding: 'utf8' },
    )

    expect(finalized.status).toBe(1)
    const evidence = join(root, 'final-evidence')
    const retained = readdirSync(evidence, { recursive: true })
      .filter((name) => typeof name === 'string' && name.endsWith('.json'))
      .map((name) => readFileSync(join(evidence, name), 'utf8'))
      .join('\n')
    expect(retained).not.toContain('sk-sensitive-value')
    expect(retained).toContain('evidence-invalid')
    const retainedResult = JSON.parse(readFileSync(join(evidence, 'result.json'), 'utf8'))
    expect(retainedResult).toMatchObject({
      status: 'failed',
      failure: { phase: 'packaged-e2e-evidence', code: 'run-failed' },
      outcome: null,
    })
  })

  it('retains a closed viewport failure as a product failure', () => {
    const { root, result } = fixture()
    const failureCapture = patternedPng(640, 480, 93)
    writeFileSync(join(root, 'captures', 'failure.png'), failureCapture)
    const phases = [{
      id: 'prototype-suite-ready', status: 'failed', elapsedMs: 100,
    }]
    result.status = 'failed'
    result.phases = phases
    result.failure = {
      phase: 'prototype-suite-ready',
      code: 'suite-failed',
      diagnostic: 'prototype-viewport',
    }
    result.outcome = null
    writeFileSync(join(root, 'result.json'), JSON.stringify(result))
    writeFileSync(join(root, 'progress.json'), JSON.stringify({
      protocol: result.protocol, status: 'failed', phases,
    }))
    const finalized = spawnSync(
      process.execPath,
      [validator, '--finalize', root, '1', 'full', 'product-failed'],
      { encoding: 'utf8' },
    )

    expect(finalized.status).toBe(0)
    const evidence = join(root, 'final-evidence')
    const harness = JSON.parse(readFileSync(join(evidence, 'harness.json'), 'utf8'))
    expect(harness).toMatchObject({
      status: 'failed', reason: 'product-failed', smokeExitCode: 1,
    })
    expect(harness.retainedFiles).toContainEqual({
      name: 'captures/failure.png',
      byteLength: failureCapture.length,
      sha256: sha256(failureCapture),
    })
    expect(readFileSync(join(evidence, 'captures', 'failure.png'))).toEqual(failureCapture)
    expect(JSON.parse(readFileSync(join(evidence, 'result.json'), 'utf8'))).toMatchObject({
      status: 'failed',
      failure: { diagnostic: 'prototype-viewport' },
      outcome: null,
    })
  })
})
