#!/usr/bin/env node

import { createHash } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { inflateSync } from 'node:zlib'

const finalizing = process.argv[2] === '--finalize'
const root = resolve(
  process.argv[finalizing ? 3 : 2]
    ?? join(homedir(), 'Library/Application Support/com.nebutra.cutout.packaged-e2e-evidence'),
)
const protocol = 'cutout.packaged-e2e-result.v1'
const harnessProtocol = 'cutout.packaged-e2e-harness.v1'
const captureIds = ['design-systems', 'prototype-suites', 'selected-delivery']
const requiredPhases = [
  'native-boot',
  'webview-loaded',
  'webview-renderable',
  'ai-native-candidate-resolved',
  'ai-native-catalog-checked',
  'provider-response',
  'planner-complete',
  'design-candidates-ready',
  'prototype-suite-ready',
  'resource-pack-ready',
]

function reject(reason) {
  throw new Error(`packaged-e2e-evidence-invalid:${reason}`)
}

function readJson(name, maximumBytes = 32 * 1024 * 1024) {
  const file = join(root, name)
  let stat
  try {
    stat = statSync(file)
  } catch {
    reject(`${name}-missing`)
  }
  if (!stat.isFile() || stat.size < 2 || stat.size > maximumBytes) reject(`${name}-size`)
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    reject(`${name}-json`)
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function isSha256(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value)
}

function isDimension(value) {
  return Number.isSafeInteger(value) && value >= 1 && value <= 16_384
}

function validatePhases(phases) {
  if (!Array.isArray(phases) || phases.length < requiredPhases.length || phases.length > 192) {
    reject('phases')
  }
  const seen = new Set()
  for (const phase of phases) {
    if (!phase || typeof phase !== 'object'
      || !/^[a-z0-9-]{1,80}$/u.test(phase.id)
      || phase.status !== 'passed'
      || !Number.isSafeInteger(phase.elapsedMs)
      || phase.elapsedMs < 0
      || phase.elapsedMs > 24 * 60 * 60 * 1_000
      || seen.has(phase.id)) {
      reject('phase-record')
    }
    seen.add(phase.id)
  }
  for (const id of requiredPhases) {
    if (!seen.has(id)) reject(`phase-${id}`)
  }
}

function validateObservedPhases(phases) {
  if (!Array.isArray(phases) || phases.length < 1 || phases.length > 192) reject('phases')
  const seen = new Set()
  for (const phase of phases) {
    if (!phase || typeof phase !== 'object'
      || Object.keys(phase).some((key) => !['id', 'status', 'elapsedMs'].includes(key))
      || !/^[a-z0-9-]{1,80}$/u.test(phase.id)
      || !['passed', 'failed', 'skipped'].includes(phase.status)
      || !Number.isSafeInteger(phase.elapsedMs)
      || phase.elapsedMs < 0
      || phase.elapsedMs > 24 * 60 * 60 * 1_000
      || seen.has(phase.id)) {
      reject('phase-record')
    }
    seen.add(phase.id)
  }
}

function validateMedia(media) {
  if (!media || typeof media !== 'object'
    || !/^image\/(?:png|jpeg|webp)$/u.test(media.mediaType)
    || !isDimension(media.width)
    || !isDimension(media.height)
    || !isSha256(media.sha256)) {
    reject('media')
  }
}

function validateSuite(suite, index) {
  const ordinal = index + 1
  if (!suite || typeof suite !== 'object'
    || suite.candidateId !== `suite-${ordinal}`
    || suite.designSystemId !== `design-${ordinal}`
    || suite.resourcePackId !== `resource-pack-${ordinal}`
    || suite.status !== 'ready'
    || !Array.isArray(suite.routes)
    || suite.routes.length < 1
    || suite.routes.length > 12
    || suite.routeCount !== suite.routes.length
    || suite.pageCount !== suite.routes.length
    || !Number.isSafeInteger(suite.resourceAssetCount)
    || suite.resourceAssetCount < 0
    || suite.resourceAssetCount > 4096
    || suite.artifactCount !== suite.resourceAssetCount
    || typeof suite.routeGraph !== 'string'
    || suite.routeGraph.length < 1
    || suite.routeGraph.length > 512_000
    || suite.qualityReviewStatus !== 'passed') {
    reject(`suite-${ordinal}`)
  }
  if (new Set(suite.routes).size !== suite.routes.length
    || suite.routes.some((route) => typeof route !== 'string'
      || !route.startsWith('/')
      || route.length > 256
      || /\s/u.test(route))) {
    reject(`suite-${ordinal}-routes`)
  }
  validateMedia(suite.designSystemMedia)
  if (!Array.isArray(suite.pageMedia) || suite.pageMedia.length !== suite.routes.length) {
    reject(`suite-${ordinal}-pages`)
  }
  if (new Set(suite.pageMedia.map((media) => media?.sha256)).size !== suite.pageMedia.length) {
    reject(`suite-${ordinal}-duplicate-page-media`)
  }
  suite.pageMedia.forEach((media, pageIndex) => {
    validateMedia(media)
    if (media.ordinal !== pageIndex + 1 || media.route !== suite.routes[pageIndex]) {
      reject(`suite-${ordinal}-page-binding`)
    }
  })
  if (!Array.isArray(suite.resourceMedia)
    || suite.resourceMedia.length !== suite.resourceAssetCount) {
    reject(`suite-${ordinal}-resources`)
  }
  if (new Set(suite.resourceMedia.map((media) => media?.sha256)).size
    !== suite.resourceMedia.length) {
    reject(`suite-${ordinal}-duplicate-resource-media`)
  }
  suite.resourceMedia.forEach((media, resourceIndex) => {
    validateMedia(media)
    if (media.ordinal !== resourceIndex + 1
      || !Number.isSafeInteger(media.byteLength)
      || media.byteLength < 1
      || media.byteLength > 128 * 1024 * 1024) {
      reject(`suite-${ordinal}-resource-binding`)
    }
  })
  const digestKeys = [
    'plan', 'designSystemImage', 'designMarkdown', 'cssVariables', 'tailwindTheme',
    'tokensJson', 'designIrTokens', 'routeGraph', 'pageMedia', 'manifest', 'bindings',
    'resourcePack', 'resourceArtifacts', 'provenance', 'reviewDocument', 'pageReviews',
    'resourceReviews',
  ]
  if (!suite.digests || Object.keys(suite.digests).length !== digestKeys.length
    || digestKeys.some((key) => !isSha256(suite.digests[key]))) {
    reject(`suite-${ordinal}-digests`)
  }
}

function pngDimensions(bytes) {
  const signature = '89504e470d0a1a0a'
  if (bytes.length < 33 || bytes.subarray(0, 8).toString('hex') !== signature
    || bytes.subarray(12, 16).toString('ascii') !== 'IHDR') {
    reject('capture-png')
  }
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]
}

function imageDimensions(bytes, mediaType) {
  if (mediaType === 'image/png') return pngDimensions(bytes)
  if (mediaType === 'image/jpeg') {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) reject('media-jpeg')
    let offset = 2
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) reject('media-jpeg')
      const marker = bytes[offset + 1]
      offset += 2
      if (marker === 0xd9 || marker === 0xda) break
      const length = bytes.readUInt16BE(offset)
      if (length < 2 || offset + length > bytes.length) reject('media-jpeg')
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]
        .includes(marker)) return [bytes.readUInt16BE(offset + 3), bytes.readUInt16BE(offset + 5)]
      offset += length
    }
    reject('media-jpeg')
  }
  if (mediaType === 'image/webp') {
    if (bytes.length < 30 || bytes.subarray(0, 4).toString('ascii') !== 'RIFF'
      || bytes.subarray(8, 12).toString('ascii') !== 'WEBP') reject('media-webp')
    const kind = bytes.subarray(12, 16).toString('ascii')
    if (kind === 'VP8X') {
      return [1 + bytes.readUIntLE(24, 3), 1 + bytes.readUIntLE(27, 3)]
    }
    if (kind === 'VP8L') {
      const bits = bytes.readUInt32LE(21)
      return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)]
    }
    if (kind === 'VP8 ' && bytes.subarray(23, 26).toString('hex') === '9d012a') {
      return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff]
    }
    reject('media-webp')
  }
  reject('media-type')
}

function decodePngPixels(bytes) {
  const [width, height] = pngDimensions(bytes)
  let offset = 8
  let bitDepth
  let colorType
  const idat = []
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset)
    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii')
    const end = offset + 12 + length
    if (end > bytes.length) reject('capture-png')
    if (type === 'IHDR') {
      bitDepth = bytes[offset + 16]
      colorType = bytes[offset + 17]
      if (bytes[offset + 20] !== 0) reject('capture-png')
    } else if (type === 'IDAT') {
      idat.push(bytes.subarray(offset + 8, offset + 8 + length))
    } else if (type === 'IEND') break
    offset = end
  }
  if (bitDepth !== 8 || ![0, 2, 4, 6].includes(colorType) || idat.length === 0) {
    reject('capture-png-format')
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType]
  const stride = width * channels
  const inflated = inflateSync(Buffer.concat(idat), { maxOutputLength: (stride + 1) * height })
  if (inflated.length !== (stride + 1) * height) reject('capture-png-data')
  const pixels = Buffer.alloc(stride * height)
  const paeth = (left, above, upperLeft) => {
    const estimate = left + above - upperLeft
    const leftDistance = Math.abs(estimate - left)
    const aboveDistance = Math.abs(estimate - above)
    const upperLeftDistance = Math.abs(estimate - upperLeft)
    return leftDistance <= aboveDistance && leftDistance <= upperLeftDistance
      ? left : aboveDistance <= upperLeftDistance ? above : upperLeft
  }
  for (let y = 0; y < height; y += 1) {
    const source = y * (stride + 1)
    const target = y * stride
    const filter = inflated[source]
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[source + 1 + x]
      const left = x >= channels ? pixels[target + x - channels] : 0
      const above = y > 0 ? pixels[target + x - stride] : 0
      const upperLeft = y > 0 && x >= channels ? pixels[target + x - stride - channels] : 0
      switch (filter) {
        case 0: pixels[target + x] = raw; break
        case 1: pixels[target + x] = (raw + left) & 0xff; break
        case 2: pixels[target + x] = (raw + above) & 0xff; break
        case 3: pixels[target + x] = (raw + Math.floor((left + above) / 2)) & 0xff; break
        case 4: pixels[target + x] = (raw + paeth(left, above, upperLeft)) & 0xff; break
        default: reject('capture-png-filter')
      }
    }
  }
  return { width, height, channels, pixels }
}

function validateCapturePixels(bytes) {
  const { width, height, channels, pixels } = decodePngPixels(bytes)
  if (width < 320 || height < 240) reject('capture-too-small')
  const colors = new Set()
  let minimum = 255
  let maximum = 0
  const pixelCount = width * height
  const step = Math.max(1, Math.floor(pixelCount / 100_000))
  for (let pixel = 0; pixel < pixelCount; pixel += step) {
    const offset = pixel * channels
    const red = pixels[offset]
    const green = channels === 1 ? red : pixels[offset + 1]
    const blue = channels === 1 ? red : pixels[offset + 2]
    minimum = Math.min(minimum, red, green, blue)
    maximum = Math.max(maximum, red, green, blue)
    colors.add(`${red >> 3}:${green >> 3}:${blue >> 3}`)
  }
  if (colors.size < 8 || maximum - minimum < 32) reject('capture-low-information')
  return [width, height]
}

const deliveryDocumentRoles = [
  'plan', 'designMarkdown', 'cssVariables', 'tailwindTheme', 'tokensJson',
  'designIrTokens', 'routeGraph', 'pageMedia', 'manifest', 'bindings',
  'resourcePack', 'resourceArtifacts', 'provenance', 'reviewDocument',
  'pageReviews', 'resourceReviews',
]

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, item]) =>
      `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function normalizeGraphText(value) {
  return value.trim().replace(/\s+/gu, ' ')
}

function compareGraphValue(left, right) {
  return JSON.stringify(left).localeCompare(JSON.stringify(right))
}

function prototypeRouteGraphFingerprint(plan) {
  const pages = [...plan.pages].sort((left, right) =>
    left.route.localeCompare(right.route) || compareGraphValue(left, right))
  const pageIndexById = new Map(pages.map((page, index) => [page.id, index]))
  const interactionIndexByPageId = new Map()
  const projectedPages = pages.map((page) => {
    const regions = Array.isArray(page.regions) ? page.regions : []
    const overlays = Array.isArray(page.overlays) ? page.overlays : []
    const states = Array.isArray(page.states) ? page.states : []
    const regionIndexById = new Map(regions.map((region, index) => [region.id, index]))
    const overlayIndexById = new Map(overlays.map((overlay, index) => [overlay.id, index]))
    const stateIndexById = new Map(states.map((state, index) => [state.id, index]))
    const interactions = page.interactions.map((interaction) => ({
      id: interaction.id,
      value: {
        label: normalizeGraphText(interaction.label),
        trigger: interaction.trigger,
        sourceRegion: interaction.sourceSectionId === undefined
          ? null
          : (regionIndexById.get(interaction.sourceSectionId) ?? -1),
        sourceElement: normalizeGraphText(interaction.sourceElement),
        intent: normalizeGraphText(interaction.intent),
        action: normalizeGraphAction(
          interaction.action,
          pageIndexById,
          overlayIndexById,
          stateIndexById,
        ),
      },
    })).sort((left, right) => compareGraphValue(left.value, right.value))
    interactionIndexByPageId.set(
      page.id,
      new Map(interactions.map((interaction, index) => [interaction.id, index])),
    )
    return {
      name: normalizeGraphText(page.name),
      route: page.route.trim(),
      purpose: normalizeGraphText(page.purpose),
      regions: regions.map((region) => ({
        name: normalizeGraphText(region.name),
        role: normalizeGraphText(region.role),
        summary: normalizeGraphText(region.summary),
      })),
      overlays: overlays.map((overlay) => ({
        name: normalizeGraphText(overlay.name),
        purpose: normalizeGraphText(overlay.purpose),
      })),
      states: states.map((state) => ({
        name: normalizeGraphText(state.name),
        purpose: normalizeGraphText(state.purpose),
      })),
      interactions: interactions.map(({ value }) => value),
    }
  })
  const flows = plan.flows.map((flow) => ({
    name: normalizeGraphText(flow.name),
    goal: normalizeGraphText(flow.goal),
    startPage: pageIndexById.get(flow.startPageId) ?? -1,
    steps: flow.steps.map((step) => ({
      fromPage: pageIndexById.get(step.fromPageId) ?? -1,
      interaction: interactionIndexByPageId.get(step.fromPageId)?.get(step.interactionId) ?? -1,
      toPage: step.toPageId === undefined ? null : (pageIndexById.get(step.toPageId) ?? -1),
    })),
  })).sort(compareGraphValue)
  return JSON.stringify({ version: 'prototype-route-graph.v1', pages: projectedPages, flows })
}

function normalizeGraphAction(action, pageIndexById, overlayIndexById, stateIndexById) {
  switch (action.type) {
    case 'navigate':
      return { type: action.type, targetPage: pageIndexById.get(action.targetPageId) ?? -1 }
    case 'open-overlay':
      return { type: action.type, targetOverlay: overlayIndexById.get(action.targetOverlayId) ?? -1 }
    case 'change-state':
      return { type: action.type, targetState: stateIndexById.get(action.targetStateId) ?? -1 }
    case 'external':
      return { type: action.type, destination: normalizeGraphText(action.destination) }
    case 'none':
      return { type: action.type, reason: normalizeGraphText(action.reason) }
    default:
      reject('route-graph-action')
  }
}

function validateProviderRoutes(routes) {
  if (!Array.isArray(routes) || routes.length < 1 || routes.length > 3) reject('provider-routes')
  const purposes = new Set()
  for (const route of routes) {
    if (!route || typeof route !== 'object'
      || Object.keys(route).length !== 4
      || !['planning', 'image', 'vision'].includes(route.purpose)
      || purposes.has(route.purpose)
      || typeof route.kind !== 'string'
      || !/^[a-z0-9][a-z0-9._-]{0,119}$/u.test(route.kind)
      || typeof route.model !== 'string'
      || route.model.length < 1 || route.model.length > 256
      || [...route.model].some((character) => {
        const code = character.charCodeAt(0)
        return code < 32 || code === 127
      })
      || !['remote', 'local'].includes(route.classification)) reject('provider-route')
    purposes.add(route.purpose)
  }
  if (!routes.some((route) => route.purpose === 'image' && route.classification === 'remote')) {
    reject('provider-route-remote-image')
  }
}

function validateEvidenceManifest(outcome) {
  const evidence = outcome.evidence
  if (!evidence || typeof evidence !== 'object'
    || Object.keys(evidence).length !== 3
    || evidence.protocol !== 'cutout.packaged-e2e-evidence.v1') reject('evidence-manifest')
  validateProviderRoutes(evidence.providerRoutes)
  if (!Array.isArray(evidence.files) || evidence.files.length < 2
    || evidence.files.length > 40_000) reject('evidence-files')
  const bySemanticKey = new Map()
  const bytesByPath = new Map()
  let totalBytes = 0
  for (const file of evidence.files) {
    if (!file || typeof file !== 'object'
      || Object.keys(file).some((key) => ![
        'role', 'candidateId', 'ordinal', 'path', 'sha256', 'byteLength',
        'mediaType', 'width', 'height',
      ].includes(key))
      || typeof file.role !== 'string'
      || !isSha256(file.sha256)
      || file.path !== `objects/${file.sha256}`
      || !Number.isSafeInteger(file.byteLength)
      || file.byteLength < 1 || file.byteLength > 128 * 1024 * 1024) {
      reject('evidence-file')
    }
    const candidate = file.candidateId ?? 'global'
    if (file.role === 'designIr') {
      if (file.candidateId != null) reject('evidence-candidate')
    } else if (!/^suite-[1-8]$/u.test(candidate)) reject('evidence-candidate')
    if (file.role !== 'designIr'
      && !deliveryDocumentRoles.includes(file.role)
      && !['designSystemMedia', 'pageMediaObject', 'resourceMediaObject'].includes(file.role)) {
      reject('evidence-role')
    }
    const semanticKey = `${candidate}:${file.role}:${file.ordinal ?? 0}`
    if (bySemanticKey.has(semanticKey)) reject('evidence-duplicate-role')
    bySemanticKey.set(semanticKey, file)
    const path = join(root, file.path)
    let stat
    try {
      stat = lstatSync(path)
    } catch {
      reject('evidence-object-missing')
    }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== file.byteLength) {
      reject('evidence-object-stat')
    }
    let bytes
    try {
      bytes = readFileSync(path)
    } catch {
      reject('evidence-object-missing')
    }
    if (sha256(bytes) !== file.sha256) reject('evidence-object-hash')
    const prior = bytesByPath.get(file.path)
    if (prior && !prior.equals(bytes)) reject('evidence-object-alias')
    bytesByPath.set(file.path, bytes)
    totalBytes += bytes.length
    if (totalBytes > 512 * 1024 * 1024) reject('evidence-total-size')
    const mediaRole = ['designSystemMedia', 'pageMediaObject', 'resourceMediaObject']
      .includes(file.role)
    if (mediaRole) {
      if (!/^image\/(?:png|jpeg|webp)$/u.test(file.mediaType)
        || !isDimension(file.width) || !isDimension(file.height)
        || (file.role === 'designSystemMedia' ? file.ordinal != null
          : !Number.isSafeInteger(file.ordinal) || file.ordinal < 1)) reject('evidence-media')
      const [width, height] = imageDimensions(bytes, file.mediaType)
      if (width !== file.width || height !== file.height) reject('evidence-media-dimensions')
    } else {
      if (file.ordinal != null || file.mediaType != null || file.width != null || file.height != null) {
        reject('evidence-document-shape')
      }
      const text = bytes.toString('utf8')
      if (!Buffer.from(text, 'utf8').equals(bytes) || sensitiveEvidence(text)) {
        reject('evidence-document-content')
      }
    }
  }
  const globalDesignIr = bySemanticKey.get('global:designIr:0')
  if (!globalDesignIr) reject('design-ir-missing')
  let designIr
  try {
    designIr = JSON.parse(bytesByPath.get(globalDesignIr.path).toString('utf8'))
  } catch {
    reject('design-ir-json')
  }
  if (!designIr || designIr.version !== 'design-ir.v1') reject('design-ir-version')

  const expectedFileCount = 1 + outcome.prototypeSuites.reduce(
    (count, suite) => count + deliveryDocumentRoles.length + 1
      + suite.pageMedia.length + suite.resourceMedia.length,
    0,
  )
  if (evidence.files.length !== expectedFileCount) reject('evidence-file-count')
  for (const suite of outcome.prototypeSuites) {
    const file = (role, ordinal = 0) => {
      const value = bySemanticKey.get(`${suite.candidateId}:${role}:${ordinal}`)
      if (!value) reject(`suite-${suite.candidateId}-file-${role}`)
      return value
    }
    const text = (role) => bytesByPath.get(file(role).path).toString('utf8')
    for (const role of deliveryDocumentRoles) {
      if (file(role).sha256 !== suite.digests[role]) reject(`suite-${suite.candidateId}-digest-${role}`)
    }
    const designMedia = file('designSystemMedia')
    if (designMedia.sha256 !== suite.designSystemMedia.sha256
      || designMedia.mediaType !== suite.designSystemMedia.mediaType
      || designMedia.width !== suite.designSystemMedia.width
      || designMedia.height !== suite.designSystemMedia.height) reject('design-system-media-binding')
    suite.pageMedia.forEach((media) => {
      const object = file('pageMediaObject', media.ordinal)
      if (object.sha256 !== media.sha256 || object.mediaType !== media.mediaType
        || object.width !== media.width || object.height !== media.height) reject('page-media-binding')
    })
    suite.resourceMedia.forEach((media) => {
      const object = file('resourceMediaObject', media.ordinal)
      if (object.sha256 !== media.sha256 || object.mediaType !== media.mediaType
        || object.width !== media.width || object.height !== media.height
        || object.byteLength !== media.byteLength) reject('resource-media-binding')
    })
    let plan
    let manifest
    let bindings
    let resourcePack
    let resourceArtifacts
    let pageMediaDocument
    let pageReviews
    let resourceReviews
    try {
      plan = JSON.parse(text('plan'))
      manifest = JSON.parse(text('manifest'))
      bindings = JSON.parse(text('bindings'))
      resourcePack = JSON.parse(text('resourcePack'))
      resourceArtifacts = JSON.parse(text('resourceArtifacts'))
      pageMediaDocument = JSON.parse(text('pageMedia'))
      JSON.parse(text('tokensJson'))
      JSON.parse(text('designIrTokens'))
      JSON.parse(text('provenance'))
      JSON.parse(text('reviewDocument'))
      pageReviews = JSON.parse(text('pageReviews'))
      resourceReviews = JSON.parse(text('resourceReviews'))
    } catch {
      reject('evidence-json-document')
    }
    if (!plan || !Array.isArray(plan.pages) || !Array.isArray(plan.flows)
      || plan.pages.length !== suite.pageCount
      || plan.pages.some((page) => !page || typeof page !== 'object'
        || typeof page.id !== 'string' || typeof page.name !== 'string'
        || typeof page.route !== 'string' || typeof page.purpose !== 'string'
        || !Array.isArray(page.regions) || !Array.isArray(page.interactions))
      || canonicalJson(plan.pages.map((page) => page.route)) !== canonicalJson(suite.routes)) {
      reject('plan-page-completeness')
    }
    const routeGraph = prototypeRouteGraphFingerprint(plan)
    if (text('routeGraph') !== routeGraph
      || suite.routeGraph !== routeGraph
      || canonicalJson(pageMediaDocument) !== canonicalJson(suite.pageMedia)) {
      reject('route-or-page-media-document')
    }
    if (!manifest || !Array.isArray(manifest.assets)
      || manifest.assets.length !== suite.resourceAssetCount
      || !Array.isArray(bindings) || bindings.length !== suite.resourceAssetCount
      || !Array.isArray(resourceArtifacts)
      || resourceArtifacts.length !== suite.resourceAssetCount
      || !resourcePack || canonicalJson(resourcePack.bindings) !== canonicalJson(bindings)
      || !Array.isArray(pageReviews) || pageReviews.length !== suite.pageCount
      || !Array.isArray(resourceReviews)
      || resourceReviews.length !== suite.resourceAssetCount) reject('resource-completeness')
    const manifestIds = manifest.assets.map((asset) => asset?.id)
    const bindingIds = bindings.map((binding) => binding?.manifestItemId)
    if (manifestIds.some((id) => typeof id !== 'string' || id.length < 1)
      || new Set(manifestIds).size !== manifestIds.length
      || canonicalJson(bindingIds) !== canonicalJson(manifestIds)
      || canonicalJson(pageReviews.map((review) => review?.pageId))
        !== canonicalJson(plan.pages.map((page) => page.id))
      || canonicalJson(resourceReviews.map((review) => review?.manifestItemId))
        !== canonicalJson(manifestIds)) reject('review-or-binding-completeness')
    resourceArtifacts.forEach((artifact, index) => {
      const media = suite.resourceMedia[index]
      const binding = bindings[index]
      if (!artifact || !media || !binding
        || artifact.manifestItemId !== binding.manifestItemId
        || artifact.artifactId !== binding.artifactId
        || artifact.sha256 !== media.sha256
        || artifact.mediaType !== media.mediaType || artifact.width !== media.width
        || artifact.height !== media.height || artifact.byteLength !== media.byteLength) {
        reject('resource-artifact-binding')
      }
    })
    if (text('designMarkdown').trim().length < 1
      || text('cssVariables').trim().length < 1
      || text('tailwindTheme').trim().length < 1) reject('design-system-documents')
  }
  const selected = outcome.prototypeSuites.find((suite) => suite.candidateId === outcome.selectedSuiteId)
  const irPages = designIr.prototype?.plan?.pages
  if (!selected || !Array.isArray(irPages)
    || canonicalJson(irPages.map((page) => page?.route)) !== canonicalJson(selected.routes)) {
    reject('design-ir-selected-plan')
  }
  return [...bytesByPath.keys()].sort()
}

function sensitiveEvidence(value) {
  return /(?:authorization|bearer\s+|api[_-]?key|\bsk-[a-z0-9_-]{8,}|\/Users\/|\/home\/|\/private\/(?:tmp|var)\/|\/tmp\/|\/var\/folders\/|\/Volumes\/|[A-Za-z]:\\\\|\\\\\\\\)/iu
    .test(JSON.stringify(value))
}

function validateForeground(foreground, requireBackground = true) {
  if (!foreground || typeof foreground !== 'object'
    || Object.keys(foreground).length !== 5
    || foreground.foregroundOwnershipPreserved !== true
    || !Number.isSafeInteger(foreground.sampleCount)
    || foreground.sampleCount < (requireBackground ? 1 : 0)
    || !Number.isSafeInteger(foreground.changedSampleCount)
    || foreground.changedSampleCount < 0
    || foreground.changedSampleCount > foreground.sampleCount
    || !Number.isSafeInteger(foreground.maxConsecutiveChangedSamples)
    || foreground.maxConsecutiveChangedSamples < 0
    || foreground.maxConsecutiveChangedSamples > foreground.changedSampleCount
    || foreground.maxConsecutiveChangedSamples > 1
    || !isSha256(foreground.baselineBundleIdSha256)) {
    reject('foreground')
  }
}

function validateSuccessfulEvidence() {
  const result = readJson('result.json')
  const progress = readJson('progress.json')
  if (result.protocol !== protocol || progress.protocol !== protocol
    || result.status !== 'passed' || progress.status !== 'passed'
    || result.failure != null || !result.outcome
    || JSON.stringify(result.phases) !== JSON.stringify(progress.phases)) {
    reject('terminal-state')
  }
  validatePhases(result.phases)

  const outcome = result.outcome
  if (!outcome.intent || typeof outcome.intent.text !== 'string'
    || outcome.intent.text.length < 1 || outcome.intent.text.length > 8_192
    || sha256(Buffer.from(outcome.intent.text, 'utf8')) !== outcome.intent.sha256) {
    reject('intent')
  }
  const count = outcome.designSystems?.length
  if (!Number.isSafeInteger(count) || count < 1 || count > 8
    || outcome.prototypeSuites?.length !== count) {
    reject('candidate-count')
  }
  outcome.designSystems.forEach((candidate, index) => {
    if (!candidate || candidate.candidateId !== `design-${index + 1}`
      || candidate.status !== 'ready') reject('design-system')
  })
  outcome.prototypeSuites.forEach(validateSuite)
  const evidenceObjectPaths = validateEvidenceManifest(outcome)
  const deliveryMediaHashes = outcome.prototypeSuites.flatMap((suite) => [
    suite.designSystemMedia.sha256,
    ...suite.pageMedia.map((media) => media.sha256),
    ...suite.resourceMedia.map((media) => media.sha256),
  ])
  if (new Set(deliveryMediaHashes).size !== deliveryMediaHashes.length) {
    reject('duplicate-delivery-media')
  }
  if (count > 1
    && new Set(outcome.prototypeSuites.map((suite) => suite.routeGraph)).size !== count) {
    reject('duplicate-route-graph')
  }
  const selected = outcome.prototypeSuites.find((suite) => suite.candidateId === outcome.selectedSuiteId)
  if (!selected || selected.resourceAssetCount !== outcome.selectedVisibleSliceCount
    || !Number.isSafeInteger(outcome.planningTurnCount)
    || outcome.planningTurnCount < 2 || outcome.planningTurnCount > 256
    || !outcome.planningRuntimeCounts
    || !Number.isSafeInteger(outcome.planningRuntimeCounts.codexSystem)
    || outcome.planningRuntimeCounts.codexSystem < 0
    || !Number.isSafeInteger(outcome.planningRuntimeCounts.direct)
    || outcome.planningRuntimeCounts.direct < 0
    || outcome.planningRuntimeCounts.codexSystem
      + outcome.planningRuntimeCounts.direct !== outcome.planningTurnCount
    || !Number.isSafeInteger(outcome.plannedImageCallCount)
    || outcome.plannedImageCallCount < 1
    || outcome.plannedImageCallCount !== outcome.imageCallCount
    || !Number.isSafeInteger(outcome.retryCount)
    || outcome.retryCount < 0 || outcome.retryCount > 16
    || !Number.isSafeInteger(outcome.retryImageCallCount)
    || outcome.retryImageCallCount < 0
    || outcome.retryImageCallCount > outcome.imageCallCount) {
    reject('execution-counts')
  }

  if (!Array.isArray(outcome.captures) || outcome.captures.length !== captureIds.length) {
    reject('captures')
  }
  for (const id of captureIds) {
    const capture = outcome.captures.find((item) => item.id === id)
    if (!capture || !isSha256(capture.sha256)
      || !isDimension(capture.width) || !isDimension(capture.height)
      || !Number.isSafeInteger(capture.byteLength)
      || capture.byteLength < 1 || capture.byteLength > 32 * 1024 * 1024) {
      reject(`capture-${id}`)
    }
    const file = join(root, 'captures', `${id}.png`)
    const bytes = readFileSync(file)
    const [width, height] = validateCapturePixels(bytes)
    if (bytes.length !== capture.byteLength || width !== capture.width || height !== capture.height
      || sha256(bytes) !== capture.sha256) {
      reject(`capture-${id}-content`)
    }
  }

  const foreground = readJson('foreground.json', 4_096)
  validateForeground(foreground)
  if (sensitiveEvidence({ result, progress, foreground })) reject('secret-or-path')
  return { count, imageCallCount: outcome.imageCallCount, evidenceObjectPaths }
}

function validateProgressEvidence(value) {
  if (!value || typeof value !== 'object'
    || Object.keys(value).length !== 3
    || value.protocol !== protocol
    || !['running', 'passed', 'failed'].includes(value.status)) {
    reject('progress')
  }
  validateObservedPhases(value.phases)
}

function validateFailureResultEvidence(value) {
  const failureCodes = [
    'phase-rejected', 'element-timeout', 'journey-timeout', 'capability-missing',
    'run-failed', 'candidate-failed', 'suite-failed', 'unexpected',
  ]
  const diagnostics = new Set([
    'planner-structured-contract', 'planner-timeout', 'planner-progressive-outline',
    'planner-progressive-design-foundation', 'planner-progressive-design-exploration',
    'planner-progressive-design-bounds', 'planner-progressive-page',
    'planner-progressive-page-identity', 'planner-progressive-closure',
    'planner-progressive-merge', 'planner-progressive-graph',
    'planner-progressive-coverage', 'provider-auth', 'provider-configuration-state',
    'provider-transport',
    'provider-output', 'prototype-viewport', 'board-decode', 'board-composition',
    'board-zero-slices', 'board-slot-assignment', 'artifact-persistence',
    'generation-candidate', 'orchestration-state', 'quality-review-required',
    'planning-evidence-mismatch', 'candidate-preparation-timeout',
    'candidate-approval-timeout', 'candidate-provider-timeout',
    'candidate-post-processing-timeout', 'unknown',
  ])
  if (!value || typeof value !== 'object'
    || Object.keys(value).some((key) => ![
      'protocol', 'status', 'phases', 'failure', 'outcome', 'completedAt',
    ].includes(key))
    || value.protocol !== protocol || value.status !== 'failed'
    || value.outcome != null || !Number.isSafeInteger(value.completedAt)
    || value.completedAt < 0 || !value.failure || typeof value.failure !== 'object'
    || Object.keys(value.failure).some((key) => ![
      'phase', 'code', 'diagnostic', 'plannerProgress',
    ].includes(key))
    || !/^[a-z0-9-]{1,80}$/u.test(value.failure.phase)
    || !failureCodes.includes(value.failure.code)) {
    reject('failure-result')
  }
  validateObservedPhases(value.phases)
  if (!value.phases.some((phase) =>
    phase.id === value.failure.phase && phase.status === 'failed')) reject('failure-phase')
  if (value.failure.diagnostic != null && !diagnostics.has(value.failure.diagnostic)) {
    reject('failure-diagnostic')
  }
  if (value.failure.plannerProgress != null) {
    const planner = value.failure.plannerProgress
    if (!planner || typeof planner !== 'object'
      || Object.keys(planner).length !== 3
      || !['outline', 'design-foundation', 'design-exploration', 'page', 'closure', 'complete']
        .includes(planner.stage)
      || !Number.isSafeInteger(planner.completedPages)
      || !Number.isSafeInteger(planner.totalPages)
      || planner.completedPages < 0 || planner.totalPages < 0
      || planner.completedPages > planner.totalPages || planner.totalPages > 12) {
      reject('failure-planner-progress')
    }
  }
}

function optionalSanitizedJson(name, maximumBytes, validate) {
  try {
    const value = readJson(name, maximumBytes)
    validate(value)
    if (sensitiveEvidence(value)) reject('secret-or-path')
    return value
  } catch {
    return undefined
  }
}

function readableCapture(id) {
  try {
    const bytes = readFileSync(join(root, 'captures', `${id}.png`))
    if (bytes.length < 1 || bytes.length > 32 * 1024 * 1024) return undefined
    const [width, height] = validateCapturePixels(bytes)
    if (!isDimension(width) || !isDimension(height)) return undefined
    return bytes
  } catch {
    return undefined
  }
}

function writeTerminalPair(result, progress) {
  const resultPath = join(root, 'result.json')
  const progressPath = join(root, 'progress.json')
  const resultTemporary = join(root, `result.json.${process.pid}.tmp`)
  const progressTemporary = join(root, `progress.json.${process.pid}.tmp`)
  const priorProgress = existsSync(progressPath) ? readFileSync(progressPath) : undefined
  writeFileSync(resultTemporary, Buffer.from(`${JSON.stringify(result, null, 2)}\n`), { mode: 0o600 })
  try {
    writeFileSync(
      progressTemporary,
      Buffer.from(`${JSON.stringify(progress, null, 2)}\n`),
      { mode: 0o600 },
    )
    renameSync(progressTemporary, progressPath)
    renameSync(resultTemporary, resultPath)
  } catch (error) {
    rmSync(progressTemporary, { force: true })
    rmSync(resultTemporary, { force: true })
    if (priorProgress) {
      const restore = join(root, `progress.json.${process.pid}.restore`)
      writeFileSync(restore, priorProgress, { mode: 0o600 })
      renameSync(restore, progressPath)
    } else {
      rmSync(progressPath, { force: true })
    }
    throw error
  }
}

function existingClosedFailure() {
  try {
    const result = readJson('result.json')
    const progress = readJson('progress.json')
    validateFailureResultEvidence(result)
    validateProgressEvidence(progress)
    if (progress.status !== 'failed'
      || JSON.stringify(result.phases) !== JSON.stringify(progress.phases)
      || sensitiveEvidence({ result, progress })) return undefined
    return { result, progress }
  } catch {
    return undefined
  }
}

function observedSanitizedPhases() {
  try {
    const progress = readJson('progress.json')
    validateProgressEvidence(progress)
    if (sensitiveEvidence(progress)) return []
    return progress.phases
  } catch {
    return []
  }
}

function closeHarnessFailure(reason) {
  const existing = existingClosedFailure()
  if (existing) return existing

  const phaseIdByReason = {
    'outer-timeout': 'packaged-e2e-timeout',
    'process-exited': 'packaged-e2e-process',
    'preflight-failed': 'packaged-e2e-preflight',
    'foreground-activation': 'packaged-e2e-foreground',
    'product-failed': 'packaged-e2e-product',
    'evidence-invalid': 'packaged-e2e-evidence',
    'script-error': 'packaged-e2e-script',
    terminated: 'packaged-e2e-signal',
    interrupted: 'packaged-e2e-signal',
    hangup: 'packaged-e2e-signal',
  }
  const phases = observedSanitizedPhases().map((phase) => ({ ...phase }))
  let failurePhase = phaseIdByReason[reason] ?? 'packaged-e2e-harness'
  const elapsedMs = phases.length > 0 ? phases[phases.length - 1].elapsedMs : 0
  const existingIndex = phases.findIndex((phase) => phase.id === failurePhase)
  if (existingIndex >= 0) {
    phases[existingIndex] = { id: failurePhase, status: 'failed', elapsedMs }
  } else if (phases.length < 192) {
    phases.push({ id: failurePhase, status: 'failed', elapsedMs })
  } else {
    const replacementIndex = phases.length - 1
    failurePhase = phases[replacementIndex].id
    phases[replacementIndex] = { id: failurePhase, status: 'failed', elapsedMs }
  }
  const progress = { protocol, status: 'failed', phases }
  const result = {
    protocol,
    status: 'failed',
    phases,
    failure: {
      phase: failurePhase,
      code: reason === 'outer-timeout' ? 'journey-timeout' : 'run-failed',
      diagnostic: 'orchestration-state',
    },
    outcome: null,
    completedAt: Date.now(),
  }
  validateProgressEvidence(progress)
  validateFailureResultEvidence(result)
  writeTerminalPair(result, progress)
  return { result, progress }
}

function persistFinalEvidence(requestedExitCode, mode, requestedReason) {
  const allowedReasons = new Set([
    'passed', 'window-probe-passed', 'outer-timeout', 'process-exited',
    'preflight-failed', 'foreground-activation', 'product-failed',
    'evidence-invalid', 'script-error', 'terminated', 'interrupted', 'hangup',
  ])
  if (!Number.isSafeInteger(requestedExitCode) || requestedExitCode < 0 || requestedExitCode > 255
    || !['full', 'window-probe'].includes(mode) || !allowedReasons.has(requestedReason)) {
    reject('finalize-arguments')
  }

  let smokeExitCode = requestedExitCode
  let reason = requestedReason
  let successfulSummary
  let successfulObjectPaths = []
  if (smokeExitCode === 0 && mode === 'full') {
    try {
      const validated = validateSuccessfulEvidence()
      successfulSummary = { count: validated.count, imageCallCount: validated.imageCallCount }
      successfulObjectPaths = validated.evidenceObjectPaths
    } catch {
      smokeExitCode = 1
      reason = 'evidence-invalid'
    }
  } else if (smokeExitCode === 0) {
    try {
      const progress = readJson('progress.json')
      const foreground = readJson('foreground.json', 4_096)
      validateProgressEvidence(progress)
      validateForeground(foreground)
      if (!progress.phases.some((phase) =>
        phase.id === 'window-probe-ready' && phase.status === 'passed')
        || !readableCapture('design-systems')
        || sensitiveEvidence({ progress, foreground })) {
        reject('window-probe')
      }
    } catch {
      smokeExitCode = 1
      reason = 'evidence-invalid'
    }
  }

  if (smokeExitCode !== 0) closeHarnessFailure(reason)

  const staging = join(root, `.final-evidence-${process.pid}.tmp`)
  const destination = join(root, 'final-evidence')
  rmSync(staging, { recursive: true, force: true })
  mkdirSync(staging, { recursive: false, mode: 0o700 })
  const retainedFiles = []
  const retain = (name, bytes) => {
    const target = join(staging, name)
    const slash = name.lastIndexOf('/')
    if (slash >= 0) mkdirSync(join(staging, name.slice(0, slash)), { recursive: true, mode: 0o700 })
    writeFileSync(target, bytes, { mode: 0o600 })
    retainedFiles.push({ name, byteLength: bytes.length, sha256: sha256(bytes) })
  }

  const progress = optionalSanitizedJson('progress.json', 32 * 1024 * 1024, validateProgressEvidence)
  if (progress) retain('progress.json', Buffer.from(`${JSON.stringify(progress, null, 2)}\n`))
  const foreground = optionalSanitizedJson('foreground.json', 4_096, (value) =>
    validateForeground(value, smokeExitCode === 0))
  if (foreground) retain('foreground.json', Buffer.from(`${JSON.stringify(foreground, null, 2)}\n`))
  const result = optionalSanitizedJson(
    'result.json',
    32 * 1024 * 1024,
    smokeExitCode === 0 ? () => validateSuccessfulEvidence() : validateFailureResultEvidence,
  )
  if (reason === 'product-failed' && !result) reason = 'evidence-invalid'
  if (result) retain('result.json', Buffer.from(`${JSON.stringify(result, null, 2)}\n`))
  for (const id of captureIds) {
    const bytes = readableCapture(id)
    if (bytes) retain(`captures/${id}.png`, bytes)
  }
  if (smokeExitCode !== 0) {
    const failureCapture = readableCapture('failure')
    if (failureCapture) retain('captures/failure.png', failureCapture)
  }
  for (const path of successfulObjectPaths) {
    retain(path, readFileSync(join(root, path)))
  }

  retain('smoke.exit', Buffer.from(`${smokeExitCode}\n`))
  const harness = {
    protocol: harnessProtocol,
    status: smokeExitCode === 0 ? 'passed' : 'failed',
    mode,
    reason,
    smokeExitCode,
    completedAt: Date.now(),
    ...(successfulSummary ? { successfulSummary } : {}),
    retainedFiles,
  }
  writeFileSync(
    join(staging, 'harness.json'),
    Buffer.from(`${JSON.stringify(harness, null, 2)}\n`),
    { mode: 0o600 },
  )
  const previous = join(root, `.final-evidence-${process.pid}.previous`)
  rmSync(previous, { recursive: true, force: true })
  let movedPrevious = false
  try {
    if (existsSync(destination)) {
      renameSync(destination, previous)
      movedPrevious = true
    }
    renameSync(staging, destination)
    if (movedPrevious) rmSync(previous, { recursive: true, force: true })
  } catch (error) {
    rmSync(staging, { recursive: true, force: true })
    if (movedPrevious && !existsSync(destination)) renameSync(previous, destination)
    throw error
  }
  process.stdout.write(
    `Finalized packaged E2E evidence: ${harness.status} (${reason}), exit ${smokeExitCode}.\n`,
  )
  return smokeExitCode
}

if (finalizing) {
  const requestedExitCode = Number(process.argv[4])
  const mode = process.argv[5]
  const reason = process.argv[6]
  const recordedExitCode = persistFinalEvidence(requestedExitCode, mode, reason)
  // Finalization success is independent from the recorded journey outcome.
  // Only downgrade a caller that claimed success with invalid evidence.
  process.exitCode = requestedExitCode === 0 && recordedExitCode !== 0 ? 1 : 0
} else {
  const { count, imageCallCount } = validateSuccessfulEvidence()
  process.stdout.write(
    `Validated packaged E2E evidence: ${count} candidate suite(s), ${imageCallCount} image call(s).\n`,
  )
}
