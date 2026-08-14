#!/usr/bin/env node

import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { constants } from 'node:fs'
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { createServer } from 'vite'
import {
  canonicalJson,
  createChallengePayload,
  createCompletionPayload,
  createReviewTemplate,
  evaluatorKeyInfo,
  resolveAuthoritativeHostBuildVersion,
  sha256,
  validateAcceptedReview,
} from './lib/commerce-held-out-evaluator.mjs'

const root = process.cwd()
const cliArguments = process.argv[2] === '--' ? process.argv.slice(3) : process.argv.slice(2)
const command = cliArguments[0]
const values = parseFlags(cliArguments.slice(1))

function usage() {
  return [
    'Evaluator-only Commerce held-out signer',
    '',
    '  prepare --product <file> --category-catalog <file> --attribute-catalog <file> --identity-id <id> --identity-revision <revision> --output <file>',
    '  key-info --public-key <file> --output <file>',
    '  challenge --input <file> --public-key <file> --secret-key <file> --output <file> [--ttl-minutes <1..1440>]',
    '  inspect --pending <file> --output-dir <directory>',
    '  review --pending <file> --output <file>',
    '  complete --pending <file> --review <file> --public-key <file> --secret-key <file> --output <file>',
  ].join('\n')
}

function parseFlags(args) {
  const parsed = new Map()
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index]
    const value = args[index + 1]
    if (!name?.startsWith('--') || !value || value.startsWith('--') || parsed.has(name)) {
      throw new Error(`Invalid evaluator CLI arguments.\n${usage()}`)
    }
    parsed.set(name, value)
  }
  return parsed
}

function required(name) {
  const value = values.get(name)
  if (!value) throw new Error(`Missing ${name}.\n${usage()}`)
  return resolve(root, value)
}

function assertOnly(allowed) {
  for (const key of values.keys()) {
    if (!allowed.includes(key)) throw new Error(`Unsupported option ${key}.\n${usage()}`)
  }
}

async function readRegular(path, maximumBytes) {
  const stat = await lstat(path)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > maximumBytes) {
    throw new Error(`Evaluator input is not a bounded regular file: ${path}`)
  }
  return readFile(path, 'utf8')
}

async function readJson(path, maximumBytes = 384 * 1024 * 1024) {
  try {
    return JSON.parse(await readRegular(path, maximumBytes))
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`Evaluator input is not valid JSON: ${path}`)
    throw error
  }
}

async function readAuthoritativeHostBuildVersion() {
  const [packageManifest, cargoToml] = await Promise.all([
    readJson(resolve(root, 'package.json'), 1024 * 1024),
    readRegular(resolve(root, 'src-tauri/Cargo.toml'), 1024 * 1024),
  ])
  const packageBlock = cargoToml.match(/^\[package\]\s*$([\s\S]*?)(?=^\[|$(?![\s\S]))/mu)?.[1]
  const cargoVersion = packageBlock?.match(/^version\s*=\s*"([^"]+)"\s*$/mu)?.[1]
  return resolveAuthoritativeHostBuildVersion({
    packageVersion: packageManifest.version,
    cargoVersion,
  })
}

async function writeExclusive(path, value) {
  const parent = dirname(path)
  const stat = await lstat(parent)
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('Evaluator output parent must be a regular directory.')
  }
  await writeFile(path, value, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
}

function artifactExtension(mediaType) {
  switch (mediaType) {
    case 'application/json': return 'json'
    case 'image/jpeg': return 'jpg'
    case 'image/png': return 'png'
    case 'image/webp': return 'webp'
    case 'text/markdown': return 'md'
    case 'video/mp4': return 'mp4'
    default: throw new Error(`Evaluator inspection does not accept media type ${mediaType}.`)
  }
}

function exactArtifactBytes(encoded, artifact, label) {
  const bytes = Buffer.from(encoded, 'base64')
  const digest = sha256(bytes)
  if (bytes.byteLength !== artifact.byteLength
    || digest !== artifact.sha256
    || artifact.artifactId !== `artifact:sha256:${digest}`) {
    throw new Error(`${label} does not match its exact retained receipt bytes.`)
  }
  return bytes
}

async function createInspectionDirectory(outputDirectory, pending) {
  const parent = dirname(outputDirectory)
  const parentStat = await lstat(parent)
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) {
    throw new Error('Evaluator inspection parent must be a regular directory.')
  }
  await mkdir(outputDirectory, { mode: 0o700 })
  const files = []
  const writeInspectionFile = async (filename, bytes, entry) => {
    await writeFile(join(outputDirectory, filename), bytes, { mode: 0o600, flag: 'wx' })
    files.push({
      ...entry,
      filename,
      sha256: sha256(bytes),
      byteLength: bytes.byteLength,
    })
  }
  try {
    for (const [index, material] of pending.bundle.sourceMaterials.entries()) {
      const receiptArtifact = material.ingestReceipt.artifact
      if (receiptArtifact.artifactId !== material.artifactId
        || receiptArtifact.sha256 !== material.sha256
        || receiptArtifact.mediaType !== material.mediaType
        || receiptArtifact.byteLength !== material.byteLength) {
        throw new Error(`Commerce source ${index + 1} does not match its ingest receipt artifact.`)
      }
      const bytes = exactArtifactBytes(
        material.artifactBytesBase64,
        receiptArtifact,
        `Commerce source ${index + 1}`,
      )
      await writeInspectionFile(
        `source-${String(index + 1).padStart(2, '0')}.${artifactExtension(material.mediaType)}`,
        bytes,
        {
          kind: 'source',
          factId: material.factId,
          artifactId: material.artifactId,
          mediaType: material.mediaType,
          receiptId: material.ingestReceipt.receiptId,
        },
      )
    }

    for (const [index, artifact] of pending.bundle.artifacts.entries()) {
      const prefix = String(index + 1).padStart(2, '0')
      const role = artifact.semanticRole.replaceAll(':', '-')
      const receiptArtifact = artifact.receipt.artifact
      const bytes = exactArtifactBytes(
        artifact.artifactBytesBase64,
        receiptArtifact,
        `Commerce deliverable ${artifact.semanticRole}`,
      )
      if (artifact.playbackSourceReceipt) {
        exactArtifactBytes(
          artifact.artifactBytesBase64,
          artifact.playbackSourceReceipt.artifact,
          `Commerce playback source ${artifact.semanticRole}`,
        )
      }
      const providerSuffix = receiptArtifact.mediaType === 'application/json' ? '.provider' : ''
      await writeInspectionFile(
        `${prefix}-${role}${providerSuffix}.${artifactExtension(receiptArtifact.mediaType)}`,
        bytes,
        {
          kind: 'deliverable',
          semanticRole: artifact.semanticRole,
          artifactId: receiptArtifact.artifactId,
          mediaType: receiptArtifact.mediaType,
          receiptId: artifact.receipt.receiptId,
        },
      )
      if (artifact.deliveryBytesBase64) {
        const deliveryBytes = Buffer.from(artifact.deliveryBytesBase64, 'base64')
        const deliveryDigest = sha256(deliveryBytes)
        await writeInspectionFile(`${prefix}-${role}.delivery.md`, deliveryBytes, {
          kind: 'derived-delivery',
          semanticRole: artifact.semanticRole,
          artifactId: `artifact:sha256:${deliveryDigest}`,
          derivedFromArtifactId: receiptArtifact.artifactId,
          mediaType: 'text/markdown',
          receiptId: artifact.receipt.receiptId,
        })
      }
      if (artifact.semanticQa) {
        const qaArtifact = artifact.semanticQa.receipt.artifact
        const qaBytes = exactArtifactBytes(
          artifact.semanticQa.artifactBytesBase64,
          qaArtifact,
          `Commerce semantic QA ${artifact.semanticRole}`,
        )
        await writeInspectionFile(`${prefix}-${role}.qa.${artifactExtension(qaArtifact.mediaType)}`, qaBytes, {
          kind: 'semantic-qa',
          semanticRole: artifact.semanticRole,
          artifactId: qaArtifact.artifactId,
          mediaType: qaArtifact.mediaType,
          receiptId: artifact.semanticQa.receipt.receiptId,
        })
      }
    }

    const review = createReviewTemplate(pending)
    await writeFile(
      join(outputDirectory, 'review.json'),
      `${JSON.stringify(review, null, 2)}\n`,
      { encoding: 'utf8', mode: 0o600, flag: 'wx' },
    )
    await writeFile(
      join(outputDirectory, 'manifest.json'),
      `${JSON.stringify({
        schema: 'commerce.held-out-evaluator-inspection.v1',
        challengeId: pending.completionRequest.challengeId,
        runId: pending.completionRequest.runId,
        bundleHash: pending.completionRequest.bundleHash,
        reviewFile: 'review.json',
        files,
      }, null, 2)}\n`,
      { encoding: 'utf8', mode: 0o600, flag: 'wx' },
    )
  } catch (error) {
    await rm(outputDirectory, { recursive: true, force: true })
    throw error
  }
}

async function assertSecretKey(path) {
  const stat = await lstat(path)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 100 || stat.size > 64 * 1024) {
    throw new Error('Evaluator secret key must be a bounded regular file.')
  }
  if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) {
    throw new Error('Evaluator secret key must not be readable or writable by group or other users.')
  }
}

async function signAndVerify(payload, secretKeyPath, publicKeyPath) {
  await assertSecretKey(secretKeyPath)
  await access(publicKeyPath, constants.R_OK)
  const directory = await mkdtemp(join(tmpdir(), 'cutout-commerce-evaluator-'))
  const messagePath = join(directory, 'payload.json')
  const signaturePath = join(directory, 'payload.minisig')
  try {
    await writeFile(messagePath, payload, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    const signed = spawnSync('minisign', [
      '-S', '-s', secretKeyPath, '-m', messagePath, '-x', signaturePath,
      '-t', 'Cutout independent Commerce evaluator',
    ], { stdio: 'inherit', shell: false })
    if (signed.error?.code === 'ENOENT') throw new Error('minisign is required on the evaluator host.')
    if (signed.status !== 0) throw new Error('Evaluator Minisign signing failed.')
    const verified = spawnSync('minisign', [
      '-V', '-p', publicKeyPath, '-m', messagePath, '-x', signaturePath,
    ], { encoding: 'utf8', shell: false })
    if (verified.error?.code === 'ENOENT') throw new Error('minisign is required on the evaluator host.')
    if (verified.status !== 0) throw new Error('Evaluator signature does not verify with the supplied public key.')
    return readRegular(signaturePath, 16 * 1024)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

async function withModules(operation) {
  const hostBuildVersion = await readAuthoritativeHostBuildVersion()
  const server = await createServer({
    root,
    configFile: false,
    appType: 'custom',
    define: { __CUTOUT_VERSION__: JSON.stringify(hostBuildVersion) },
    server: { middlewareMode: true, hmr: false },
    resolve: { alias: { '@': resolve(root, 'src') } },
    logLevel: 'error',
  })
  try {
    const heldOut = await server.ssrLoadModule('/src/commerce-profile/held-out.ts')
    const runner = await server.ssrLoadModule('/src/commerce-profile/production-runner.ts')
    const ingestion = await server.ssrLoadModule('/src/commerce-profile/ingestion.ts')
    return await operation({ heldOut, ingestion, runner })
  } finally {
    await server.close()
  }
}

async function prepareCommand() {
  assertOnly([
    '--product',
    '--category-catalog',
    '--attribute-catalog',
    '--identity-id',
    '--identity-revision',
    '--output',
  ])
  const productPath = required('--product')
  const categoryPath = required('--category-catalog')
  const attributePath = required('--attribute-catalog')
  const [product, categoryCatalog, attributeCatalog] = await Promise.all([
    readRegular(productPath, 8 * 1024 * 1024),
    readRegular(categoryPath, 8 * 1024 * 1024),
    readRegular(attributePath, 8 * 1024 * 1024),
  ])
  const output = await withModules(({ heldOut, ingestion, runner }) => {
    const result = ingestion.ingestCommerceInputs([
      {
        path: `product/${basename(productPath)}`,
        role: 'product-record',
        contents: product,
        mediaType: 'application/json',
        kind: 'regular',
      },
      {
        path: 'catalog/category.json',
        role: 'category-catalog',
        contents: categoryCatalog,
        mediaType: 'application/json',
        kind: 'regular',
      },
      {
        path: 'catalog/attribute.json',
        role: 'attribute-catalog',
        contents: attributeCatalog,
        mediaType: 'application/json',
        kind: 'regular',
      },
    ])
    if (result.products.length !== 1) {
      throw new Error('Evaluator preparation requires exactly one normalized product record.')
    }
    const facts = result.products[0]
    const selectedSourceFactIds = [facts.identityAnchorFactId]
    runner.assertCommerceProductionSourceSelection(facts, selectedSourceFactIds)
    return heldOut.commerceHeldOutEvaluatorInputSchema.parse({
      schema: heldOut.COMMERCE_HELD_OUT_EVALUATOR_INPUT_SCHEMA,
      rehearsalIdentity: {
        id: values.get('--identity-id'),
        revision: values.get('--identity-revision'),
      },
      facts,
      categoryCatalog,
      attributeCatalog,
      selectedSourceFactIds,
    })
  })
  await writeExclusive(required('--output'), `${JSON.stringify(output, null, 2)}\n`)
}

async function keyInfoCommand() {
  assertOnly(['--public-key', '--output'])
  const publicKeyPath = required('--public-key')
  const info = evaluatorKeyInfo(await readRegular(publicKeyPath, 16 * 1024))
  await writeExclusive(required('--output'), `${JSON.stringify(info, null, 2)}\n`)
}

async function challengeCommand() {
  assertOnly(['--input', '--public-key', '--secret-key', '--output', '--ttl-minutes'])
  const input = await readJson(required('--input'), 144 * 1024 * 1024)
  const publicKeyPath = required('--public-key')
  const secretKeyPath = required('--secret-key')
  const key = evaluatorKeyInfo(await readRegular(publicKeyPath, 16 * 1024))
  const hostBuildVersion = await readAuthoritativeHostBuildVersion()
  const ttlMinutes = values.has('--ttl-minutes') ? Number(values.get('--ttl-minutes')) : 240
  const output = await withModules(async ({ heldOut, runner }) => {
    const evaluatorInput = heldOut.commerceHeldOutEvaluatorInputSchema.parse(input)
    runner.assertCommerceProductionSourceSelection(
      evaluatorInput.facts,
      evaluatorInput.selectedSourceFactIds,
    )
    const inputManifest = await heldOut.createCommerceHeldOutInputManifest(evaluatorInput)
    const inputManifestHash = sha256(canonicalJson(inputManifest))
    const payload = heldOut.commerceHeldOutChallengeSelectionPayloadSchema.parse(createChallengePayload({
      inputManifestHash,
      evaluatorKeyId: key.keyId,
      hostBuildVersion,
      ttlMinutes,
    }))
    const signature = await signAndVerify(
      heldOut.encodeCommerceHeldOutChallengePayload(payload),
      secretKeyPath,
      publicKeyPath,
    )
    return heldOut.createCommerceHeldOutEvaluatorPackage({
      evaluatorInput,
      evaluatorChallenge: { payload, signature },
    })
  })
  await writeExclusive(required('--output'), `${JSON.stringify(output, null, 2)}\n`)
}

async function reviewCommand() {
  assertOnly(['--pending', '--output'])
  const pendingInput = await readJson(required('--pending'))
  const pending = await withModules(({ runner }) => runner.decodeCommerceHeldOutPendingAdmission(pendingInput))
  await writeExclusive(required('--output'), `${JSON.stringify(createReviewTemplate(pending), null, 2)}\n`)
}

async function inspectCommand() {
  assertOnly(['--pending', '--output-dir'])
  const pendingInput = await readJson(required('--pending'))
  const pending = await withModules(({ runner }) => runner.decodeCommerceHeldOutPendingAdmission(pendingInput))
  await createInspectionDirectory(required('--output-dir'), pending)
}

async function completeCommand() {
  assertOnly(['--pending', '--review', '--public-key', '--secret-key', '--output'])
  const pendingInput = await readJson(required('--pending'))
  const reviewInput = await readJson(required('--review'), 4 * 1024 * 1024)
  const publicKeyPath = required('--public-key')
  const secretKeyPath = required('--secret-key')
  const key = evaluatorKeyInfo(await readRegular(publicKeyPath, 16 * 1024))
  const output = await withModules(async ({ heldOut, runner }) => {
    const pending = await runner.decodeCommerceHeldOutPendingAdmission(pendingInput)
    if (key.keyId !== pending.completionRequest.evaluatorKeyId) {
      throw new Error('Evaluator public key does not match the committed held-out Run.')
    }
    const review = validateAcceptedReview(reviewInput, pending)
    const payload = heldOut.commerceHeldOutEvaluatorAttestationPayloadSchema.parse(
      createCompletionPayload({ pending, review }),
    )
    const signature = await signAndVerify(
      heldOut.encodeCommerceHeldOutEvaluatorPayload(payload),
      secretKeyPath,
      publicKeyPath,
    )
    return heldOut.commerceHeldOutEvaluatorAttestationSchema.parse({ payload, signature })
  })
  await writeExclusive(required('--output'), `${JSON.stringify(output, null, 2)}\n`)
}

try {
  switch (command) {
    case 'prepare': await prepareCommand(); break
    case 'key-info': await keyInfoCommand(); break
    case 'challenge': await challengeCommand(); break
    case 'inspect': await inspectCommand(); break
    case 'review': await reviewCommand(); break
    case 'complete': await completeCommand(); break
    case '--help':
    case '-h': console.log(usage()); break
    default: throw new Error(usage())
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
