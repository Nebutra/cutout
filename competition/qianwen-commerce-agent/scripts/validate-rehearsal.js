#!/usr/bin/env node
import { constants as fsConstants } from 'node:fs'
import { lstat, open, readdir, realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AgentError, DOCUMENT_NAMES, IMAGE_BASENAMES, LIMITS, MEDIA_INVENTORY_ROLES, VIDEO_BASENAME,
  invariant, sha256, stableJson,
} from '../lib/contracts.js'
import { inspectDocument, inspectImage, inspectVideo } from '../lib/media.js'

const REPORT_SCHEMA = 'qianwen.rehearsal-evidence.v1'
const DESCRIPTION_NAMES = DOCUMENT_NAMES.filter((name) => name !== 'strategy_document.md')
const CREDENTIAL_SHAPED = /(?:\bBearer\s+[A-Za-z0-9._~+/-]{12,}|\bsk-[A-Za-z0-9_-]{16,}|\bAKIA[A-Z0-9]{16}\b|(?:api[_-]?key|secret[_-]?key|access[_-]?token|refresh[_-]?token|authorization|credential)\s*[:=]\s*["']?[A-Za-z0-9._~+/-]{12,})/i
const SIGNED_QUERY = /https?:\/\/[^\s<>)\]`]+[?&](?:x-amz-[a-z0-9-]+|signature|sig|token|access[_-]?key|credential|expires)=/i
const HIDDEN_RUNTIME_CONTENT = /(?:qianwen\.node-checkpoint|\.qianwen-agent-work|remote[-_ ](?:task|job)[-_ ]?id|\btask[_-]?id\b)/i
const DESCRIPTION_CONTRACTS = Object.freeze({
  'product_description_en.md': Object.freeze({
    locale: 'en',
    category: 'Exact leaf category', overview: 'Product Overview', skus: 'SKU Breakdown', attributes: 'Product Attributes',
    identity: 'Source and Product Identity', media: 'Image and Video Assets', fidelity: 'Source Fidelity',
    sourceValueLabel: 'source value',
    noSkus: 'No distinct SKU records were supplied in the source product JSON.',
    noAttributes: 'No product attributes were supplied.',
    sourceLabels: Object.freeze({ productId: 'Product ID', platform: 'Source platform', url: 'Product URL', title: 'Source product title', category: 'Source category' }),
    mediaInventory: MEDIA_INVENTORY_ROLES.en,
  }),
  'product_description_ko.md': Object.freeze({
    locale: 'ko',
    category: '정확한 최하위 카테고리', overview: '상품 개요', skus: 'SKU 구성', attributes: '상품 속성',
    identity: '출처 및 상품 식별 정보', media: '이미지 및 영상 에셋', fidelity: '출처 일치성',
    sourceValueLabel: '원문 값',
    noSkus: '원본 상품 JSON에 개별 SKU 정보가 없습니다.',
    noAttributes: '제공된 상품 속성이 없습니다.',
    sourceLabels: Object.freeze({ productId: '상품 ID', platform: '원본 플랫폼', url: '상품 URL', title: '원본 상품명', category: '원본 카테고리' }),
    mediaInventory: MEDIA_INVENTORY_ROLES.ko,
  }),
  'product_description_pt.md': Object.freeze({
    locale: 'pt',
    category: 'Categoria final exata', overview: 'Visao geral do produto', skus: 'Detalhamento de SKUs', attributes: 'Atributos do produto',
    identity: 'Origem e identificacao do produto', media: 'Imagens e video', fidelity: 'Fidelidade a fonte',
    sourceValueLabel: 'valor original',
    noSkus: 'Nenhum SKU separado foi informado no JSON de origem.',
    noAttributes: 'Nenhum atributo de produto foi informado.',
    sourceLabels: Object.freeze({ productId: 'ID do produto', platform: 'Plataforma de origem', url: 'URL do produto', title: 'Titulo original do produto', category: 'Categoria original' }),
    mediaInventory: MEDIA_INVENTORY_ROLES.pt,
  }),
})

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function pathWithin(parent, child) {
  const relation = relative(parent, child)
  return relation === '' || (relation !== '..' && !relation.startsWith(`..${sep}`) && !isAbsolute(relation))
}

function validateAbsoluteNormalizedPath(path, label) {
  invariant(typeof path === 'string' && path.length > 0 && Buffer.byteLength(path) <= LIMITS.maximumPathBytes
    && isAbsolute(path) && resolve(path) === path && !path.includes('\0'),
  'unsafe-output-path', `${label} must be a normalized absolute path.`)
}

async function assertNoSymlinkComponents(path, label, includeLeaf = true) {
  const parsedRoot = resolve(path).slice(0, resolve(path).length - resolve(path).replace(/^[/\\]+/, '').length)
  const parts = resolve(path).slice(parsedRoot.length).split(sep).filter(Boolean)
  let current = parsedRoot || sep
  const maximum = includeLeaf ? parts.length : Math.max(0, parts.length - 1)
  for (const part of parts.slice(0, maximum)) {
    current = join(current, part)
    const info = await lstat(current).catch(() => undefined)
    invariant(info && !info.isSymbolicLink(), 'unsafe-output-path', `${label} contains an unavailable or symlinked path component.`)
  }
}

async function authorizeCompletedRoot(outputRoot) {
  validateAbsoluteNormalizedPath(outputRoot, 'Output root')
  invariant(dirname(outputRoot) !== outputRoot, 'unsafe-output-path', 'Filesystem root cannot be used as the completed output root.')
  await assertNoSymlinkComponents(outputRoot, 'Output root')
  const info = await lstat(outputRoot).catch(() => undefined)
  invariant(info?.isDirectory() && !info.isSymbolicLink(), 'unsafe-output-path', 'Output root must be a non-symlink directory.')
  const canonical = await realpath(outputRoot)
  invariant(canonical === outputRoot, 'unsafe-output-path', 'Output root must use its canonical path.')
  return Object.freeze({ path: outputRoot, device: info.dev, inode: info.ino })
}

async function assertRootIdentity(root) {
  const info = await lstat(root.path).catch(() => undefined)
  invariant(info?.isDirectory() && !info.isSymbolicLink() && info.dev === root.device && info.ino === root.inode,
    'path-identity-changed', 'Output root identity changed during validation.')
}

async function readBoundedFile(root, name, maximumBytes) {
  invariant(basename(name) === name && !isAbsolute(name) && !name.includes('\0'),
    'invalid-rehearsal-output', 'Output inventory contains an unsafe name.')
  const path = join(root.path, name)
  const info = await lstat(path).catch(() => undefined)
  invariant(info?.isFile() && !info.isSymbolicLink() && info.size > 0 && info.size <= maximumBytes,
    'invalid-rehearsal-output', `Output must be a bounded regular file: ${name}`)
  const handle = await open(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0))
  try {
    const before = await handle.stat()
    invariant(before.isFile() && before.dev === info.dev && before.ino === info.ino && before.size === info.size,
      'path-identity-changed', `Output changed before reading: ${name}`)
    const bytes = Buffer.alloc(before.size)
    let offset = 0
    while (offset < bytes.length) {
      const result = await handle.read(bytes, offset, bytes.length - offset, offset)
      invariant(result.bytesRead > 0, 'invalid-rehearsal-output', `Output ended unexpectedly: ${name}`)
      offset += result.bytesRead
    }
    const after = await handle.stat()
    invariant(after.dev === before.dev && after.ino === before.ino && after.size === before.size
      && after.mtimeMs === before.mtimeMs,
    'path-identity-changed', `Output changed while reading: ${name}`)
    return Object.freeze({
      bytes,
      identity: Object.freeze({ dev: after.dev, inode: after.ino, size: after.size, mtimeMs: after.mtimeMs }),
    })
  } finally {
    await handle.close()
  }
}

async function assertCompletedOutputIdentity(root, names, identities) {
  await assertRootIdentity(root)
  const entries = await readdir(root.path, { withFileTypes: true })
  const finalNames = entries.map((entry) => entry.name).sort()
  invariant(entries.every((entry) => entry.isFile() && !entry.isSymbolicLink())
    && finalNames.length === names.length && finalNames.every((name, index) => name === names[index]),
  'path-identity-changed', 'Output inventory changed during validation.')
  for (const name of names) {
    const expected = identities.get(name)
    const info = await lstat(join(root.path, name)).catch(() => undefined)
    invariant(expected && info?.isFile() && !info.isSymbolicLink()
      && info.dev === expected.dev && info.ino === expected.inode && info.size === expected.size
      && info.mtimeMs === expected.mtimeMs,
    'path-identity-changed', `Output changed after reading: ${name}`)
  }
}

function exactRoleNames(names) {
  invariant(names.length === 11 && new Set(names).size === 11,
    'invalid-rehearsal-output', 'Completed output must contain exactly 11 unique files.')
  for (const name of DOCUMENT_NAMES) invariant(names.includes(name), 'invalid-rehearsal-output', `Required document is missing: ${name}`)
  const images = IMAGE_BASENAMES.map((role) => {
    const matches = names.filter((name) => name === `${role}.png` || name === `${role}.jpeg`)
    invariant(matches.length === 1, 'invalid-rehearsal-output', `Image role must have exactly one PNG/JPEG file: ${role}`)
    return matches[0]
  })
  const videoMatches = names.filter((name) => name === `${VIDEO_BASENAME}.mp4`)
  invariant(videoMatches.length === 1, 'invalid-rehearsal-output', 'Video role must use the exact product_video.mp4 name.')
  const expected = [...DOCUMENT_NAMES, ...images, videoMatches[0]].sort()
  invariant(names.every((name, index) => name === expected[index]),
    'invalid-rehearsal-output', 'Output contains an unexpected file or unsupported extension.')
  return Object.freeze({ images: Object.freeze(images), video: videoMatches[0] })
}

function assertSafeDocumentContent(text, name) {
  invariant(!CREDENTIAL_SHAPED.test(text), 'unsafe-document', `Credential-shaped content is forbidden: ${name}`)
  invariant(!SIGNED_QUERY.test(text), 'unsafe-document', `Signed query content is forbidden: ${name}`)
  invariant(!HIDDEN_RUNTIME_CONTENT.test(text), 'unsafe-document', `Runtime checkpoint/task content is forbidden: ${name}`)
}

function sectionBody(text, heading, nextHeading) {
  const expression = new RegExp(`^## ${escapeRegExp(heading)}\\s*$([\\s\\S]*?)(?=^## ${escapeRegExp(nextHeading)}\\s*$)`, 'mu')
  return expression.exec(text)?.[1]?.trim() ?? ''
}

function assertSourceIdentityClosure(text, contract, name) {
  const body = sectionBody(text, contract.identity, contract.media)
  const lines = body.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean)
  const labels = contract.sourceLabels
  const required = [labels.productId, labels.platform, labels.url, labels.title]
  for (const label of required) {
    const value = label === labels.url ? 'https:\\/\\/\\S+' : '\\S.+'
    const matches = lines.filter((line) => line.startsWith(`- ${label}: `))
    invariant(matches.length === 1
      && new RegExp(`^- ${escapeRegExp(label)}: ${value} \\x60[^\\x60\\r\\n]+\\/[^\\x60\\r\\n]+\\x60$`, 'u').test(matches[0]),
      'invalid-document', `Localized source identity closure is missing: ${name}`)
  }
  const categoryLines = lines.filter((line) => line.startsWith(`- ${labels.category}: `))
  invariant(categoryLines.length <= 1
    && categoryLines.every((line) => new RegExp(`^- ${escapeRegExp(labels.category)}: \\S.+ \\x60[^\\x60\\r\\n]+\\/[^\\x60\\r\\n]+\\x60$`, 'u').test(line)),
  'invalid-document', `Localized source category closure is invalid: ${name}`)
  invariant(lines.length === required.length + categoryLines.length,
  'invalid-document', `Localized source identity labels are invalid: ${name}`)
}

function proseWithoutExplicitEvidence(text, contract) {
  const identity = new RegExp(`(^## ${escapeRegExp(contract.identity)}\\s*$)[\\s\\S]*?(?=^## ${escapeRegExp(contract.media)}\\s*$)`, 'mu')
  return text.replace(identity, '$1\n').split(/\r?\n/u).map((line) => {
    if (!/^\s*- /u.test(line) || !/`[^`\r\n]+\/[^`\r\n]+`\s*$/u.test(line)) return line
    return line
      .replace(/^(\s*-\s+)\*\*`[^`\r\n]*`\*\*/u, '$1')
      .replace(new RegExp(`\\(${escapeRegExp(contract.sourceValueLabel)}: \\x60[^\\x60\\r\\n]*\\x60\\)`, 'gu'), '')
      .replace(/\s+`[^`\r\n]+\/[^`\r\n]+`\s*$/u, '')
  }).join('\n')
}

function assertLocaleScriptClosure(text, contract, name) {
  const prose = proseWithoutExplicitEvidence(text, contract)
  if (contract.locale === 'ko') {
    invariant(!/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(prose),
      'invalid-document', `Korean localized body contains source-market script leakage: ${name}`)
    invariant((prose.match(/\p{Script=Hangul}/gu) ?? []).length >= 10,
      'invalid-document', 'Korean description lacks Hangul content.')
  } else {
    invariant(!/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(prose),
      'invalid-document', `${contract.locale} localized body contains source-market script leakage: ${name}`)
  }
}

function validateDescription(name, text, mediaNames) {
  const contract = DESCRIPTION_CONTRACTS[name]
  invariant(contract && /^# [^\r\n]{2,500}\r?$/mu.test(text), 'invalid-document', `Description title is missing: ${name}`)
  const expectedHeadings = [contract.overview, contract.skus, contract.attributes, contract.identity, contract.media, contract.fidelity]
  const actualHeadings = [...text.matchAll(/^## ([^\r\n]+?)\s*$/gmu)].map((match) => match[1])
  invariant(actualHeadings.length === expectedHeadings.length
    && actualHeadings.every((heading, index) => heading === expectedHeadings[index]),
  'invalid-document', `Description section closure or order is invalid: ${name}`)
  const categoryMatches = [...text.matchAll(new RegExp(`^\\*\\*${escapeRegExp(contract.category)}:\\*\\*\\s+(.{1,500})\\s+\\(([^()\\r\\n]{1,240})\\)\\s*$`, 'gmu'))]
  invariant(categoryMatches.length === 1, 'invalid-document', `Exact leaf category declaration is missing or duplicated: ${name}`)
  const categoryMatch = categoryMatches[0]
  const categoryName = categoryMatch?.[1]
  const categoryId = categoryMatch?.[2]
  invariant(categoryName && categoryId && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/u.test(categoryId),
    'invalid-document', `Exact leaf category declaration is invalid: ${name}`)
  if (contract.locale === 'ko') {
    invariant(/\p{Script=Hangul}/u.test(categoryName)
      && !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(categoryName),
    'invalid-document', 'Korean category name is not localized.')
  } else invariant(!/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(categoryName),
    'invalid-document', `${contract.locale} category name is not localized.`)
  const skuBody = sectionBody(text, contract.skus, contract.attributes)
  const attributeBody = sectionBody(text, contract.attributes, contract.identity)
  invariant((skuBody.length > 20 && /`[^`\r\n]+\/[^`\r\n]+`/u.test(skuBody))
    || skuBody.includes(`- ${contract.noSkus}`),
    'invalid-document', `SKU breakdown closure is missing: ${name}`)
  invariant((attributeBody.length > 20 && /`[^`\r\n]+\/[^`\r\n]+`/u.test(attributeBody))
    || attributeBody.includes(`- ${contract.noAttributes}`),
    'invalid-document', `Attribute source closure is missing: ${name}`)
  assertSourceIdentityClosure(text, contract, name)
  const roles = [...contract.mediaInventory.imageRoles, contract.mediaInventory.videoRole]
  const expectedMediaLines = mediaNames.map((mediaName, index) =>
    `- ${mediaName}: ${contract.mediaInventory.prefix}: ${roles[index]}`)
  const actualMediaLines = sectionBody(text, contract.media, contract.fidelity)
    .split(/\r?\n/u).map((line) => line.trim()).filter(Boolean)
  invariant(actualMediaLines.length === expectedMediaLines.length
    && actualMediaLines.every((line, index) => line === expectedMediaLines[index]),
  'invalid-document', `Deterministic media role closure is missing or contains free-form entries: ${name}`)
  assertLocaleScriptClosure(text, contract, name)
  if (name.endsWith('_pt.md')) invariant((text.toLocaleLowerCase('pt-BR').match(/\b(?:a|o|de|do|da|para|com|produto|tamanho|cor|material|imagem|detalhes|origem)\b/gu) ?? []).length >= 5,
    'invalid-document', 'Portuguese description lacks locale evidence.')
  return categoryId
}

function validateStrategy(text, imageArtifacts, videoArtifact) {
  for (const heading of ['Market and Merchandising Direction', 'Localization', 'Image Story', 'Video Story', 'Technical QA Appendix', 'Source References']) {
    invariant(new RegExp(`^## ${escapeRegExp(heading)}\\s*$`, 'mu').test(text), 'invalid-document', 'Strategy document closure is incomplete.')
  }
  for (const artifact of [...imageArtifacts, videoArtifact]) {
    invariant(text.includes(artifact.name) && text.includes(artifact.sha256)
      && text.includes(`${artifact.width} x ${artifact.height}px`),
    'invalid-document', `Strategy document does not bind physical evidence: ${artifact.name}`)
  }
  invariant(text.includes(`${videoArtifact.durationMs}ms`) && text.includes(videoArtifact.codec),
    'invalid-document', 'Strategy document does not bind video playability metadata.')
}

function assertSanitizedReport(report) {
  invariant(report && typeof report === 'object' && report.schema === REPORT_SCHEMA
    && report.status === 'passed' && Array.isArray(report.artifacts) && report.artifacts.length === 11,
  'invalid-evidence-report', 'Evidence report shape is invalid.')
  const serialized = JSON.stringify(report)
  invariant(!/https?:\/\//i.test(serialized) && !CREDENTIAL_SHAPED.test(serialized)
    && !/[?&](?:x-amz-[a-z0-9-]+|signature|sig|token|credential)=/i.test(serialized)
    && !HIDDEN_RUNTIME_CONTENT.test(serialized),
  'unsafe-evidence-report', 'Evidence report contains disallowed runtime or remote data.')
}

export async function validateRehearsal(outputRoot) {
  const root = await authorizeCompletedRoot(outputRoot)
  await assertRootIdentity(root)
  const entries = await readdir(root.path, { withFileTypes: true })
  const names = entries.map((entry) => entry.name).sort()
  invariant(entries.every((entry) => entry.isFile() && !entry.isSymbolicLink()),
    'invalid-rehearsal-output', 'Completed output may contain regular files only.')
  const roles = exactRoleNames(names)

  const artifacts = []
  const identities = new Map()
  const documentText = new Map()
  for (const name of DOCUMENT_NAMES) {
    const { bytes, identity } = await readBoundedFile(root, name, LIMITS.maximumDocumentBytes)
    identities.set(name, identity)
    const inspected = inspectDocument(bytes, name)
    const text = bytes.toString('utf8')
    assertSafeDocumentContent(text, name)
    documentText.set(name, text)
    artifacts.push(Object.freeze({ name, ...inspected }))
  }
  const imageArtifacts = []
  for (let index = 0; index < roles.images.length; index += 1) {
    const name = roles.images[index]
    const maximum = index === 0 ? LIMITS.maximumImageBytes : LIMITS.maximumDetailImageBytes
    const { bytes, identity } = await readBoundedFile(root, name, maximum)
    identities.set(name, identity)
    const inspected = inspectImage(bytes, index === 0 ? 'main' : IMAGE_BASENAMES[index])
    invariant(name.endsWith(`.${inspected.extension}`), 'invalid-rehearsal-output', `Image extension does not match decoded bytes: ${name}`)
    const artifact = Object.freeze({ name, ...inspected })
    imageArtifacts.push(artifact)
    artifacts.push(artifact)
  }
  const { bytes: videoBytes, identity: videoIdentity } = await readBoundedFile(root, roles.video, LIMITS.maximumVideoBytes)
  identities.set(roles.video, videoIdentity)
  const videoArtifact = Object.freeze({ name: roles.video, ...inspectVideo(videoBytes) })
  artifacts.push(videoArtifact)

  const mediaNames = [...roles.images, roles.video]
  const categoryIds = DESCRIPTION_NAMES.map((name) => validateDescription(name, documentText.get(name), mediaNames))
  invariant(new Set(categoryIds).size === 1, 'invalid-document', 'Localized descriptions disagree on exact leaf category identity.')
  validateStrategy(documentText.get('strategy_document.md'), imageArtifacts, videoArtifact)
  await assertCompletedOutputIdentity(root, names, identities)

  const sortedArtifacts = artifacts.sort((left, right) => left.name.localeCompare(right.name))
  const imagePhysicalEligibilityRatio = imageArtifacts
    .filter((artifact) => artifact.width > 260 && artifact.height > 260).length / imageArtifacts.length
  const report = Object.freeze({
    schema: REPORT_SCHEMA,
    status: 'passed',
    scope: 'offline-completed-output',
    output: Object.freeze({ expectedFileCount: 11, actualFileCount: names.length, exactClosure: true,
      sha256: sha256(stableJson(sortedArtifacts.map(({ name, sha256: hash }) => ({ name, sha256: hash })))) }),
    checks: Object.freeze({
      A1: Object.freeze({ status: 'passed', scope: 'document-structure-and-safety' }),
      A2: Object.freeze({ status: 'passed', scope: 'exact-file-and-physical-specification' }),
      A3: Object.freeze({ status: 'passed', scope: 'consistent-category-attribute-and-sku-declarations' }),
      A4: Object.freeze({ status: 'passed', scope: 'localized-document-closure' }),
      A5: Object.freeze({ status: 'passed', scope: 'source-annotation-presence' }),
      A6: Object.freeze({ status: 'passed', scope: 'decoded-image-physical-eligibility', decodedPhysicalEligibilityRatio: imagePhysicalEligibilityRatio }),
      A7: Object.freeze({ status: 'passed', scope: 'mp4-container-video-track-and-sample-table-structure' }),
    }),
    artifacts: Object.freeze(sortedArtifacts.map((artifact) => Object.freeze({ ...artifact }))),
  })
  assertSanitizedReport(report)
  return report
}

export async function writeEvidenceReport(reportPath, report, outputRoot) {
  validateAbsoluteNormalizedPath(outputRoot, 'Output root')
  validateAbsoluteNormalizedPath(reportPath, 'Report path')
  await assertNoSymlinkComponents(reportPath, 'Report path', false)
  invariant(!pathWithin(outputRoot, reportPath), 'unsafe-output-path', 'Evidence report must be outside the completed output root.')
  const parent = dirname(reportPath)
  const parentInfo = await lstat(parent).catch(() => undefined)
  invariant(parentInfo?.isDirectory() && !parentInfo.isSymbolicLink(), 'unsafe-output-path', 'Evidence report parent must be a non-symlink directory.')
  assertSanitizedReport(report)
  const handle = await open(reportPath, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | (fsConstants.O_NOFOLLOW ?? 0), 0o600)
  try { await handle.writeFile(`${JSON.stringify(report, null, 2)}\n`, 'utf8') } finally { await handle.close() }
}

function parseArguments(argv) {
  const values = {}
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index]
    invariant(option === '--output-root' || option === '--report', 'invalid-arguments', 'Only --output-root and --report are supported.')
    invariant(typeof argv[index + 1] === 'string' && !argv[index + 1].startsWith('--'), 'invalid-arguments', `Missing value for ${option}.`)
    const key = option === '--output-root' ? 'outputRoot' : 'reportPath'
    invariant(values[key] === undefined, 'invalid-arguments', `Duplicate option: ${option}`)
    values[key] = argv[index + 1]
    index += 1
  }
  invariant(values.outputRoot, 'invalid-arguments', '--output-root is required.')
  return values
}

export async function main(argv = process.argv.slice(2)) {
  const { outputRoot, reportPath } = parseArguments(argv)
  const report = await validateRehearsal(outputRoot)
  if (reportPath) await writeEvidenceReport(reportPath, report, outputRoot)
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  return 0
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const code = error instanceof AgentError ? error.code : 'validation-failed'
    process.stderr.write(`Rehearsal validation failed (${code}).\n`)
    process.exitCode = 1
  })
}
