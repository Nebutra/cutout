import { describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { fingerprint } from '../src/design-ir/fingerprint'
import {
  fixtureAttributeCatalog,
  fixtureCategoryCatalog,
  fixtureProductRecord,
} from '../src/commerce-profile/commerce-profile.test-fixture'
import { commerceHeldOutEvaluatorInputSchema } from '../src/commerce-profile/held-out'
import { createCommerceRehearsalFixture } from '../src/commerce-profile/rehearsal.test-fixture'
import {
  canonicalJson,
  createChallengePayload,
  createCompletionPayload,
  createReviewTemplate,
  evaluatorKeyInfo,
  resolveAuthoritativeHostBuildVersion,
  validateAcceptedReview,
} from './lib/commerce-held-out-evaluator.mjs'

const HASH = 'a'.repeat(64)
const execFileAsync = promisify(execFile)
const evaluatorCliPath = resolve(process.cwd(), 'scripts/commerce-held-out-evaluator.mjs')

function pending() {
  const artifacts = Array.from({ length: 11 }, (_, index) => ({
    semanticRole: index === 10 ? 'strategy-document' : `role:${index}`,
    receipt: {
      receiptId: `receipt:${index}`,
      artifact: {
        artifactId: `artifact:sha256:${index.toString(16).padStart(2, '0').repeat(32)}`,
        sha256: index.toString(16).padStart(2, '0').repeat(32),
        mediaType: 'application/json',
        byteLength: 100 + index,
      },
    },
  }))
  return {
    commitment: {
      challengeSelection: { payload: { expiresAt: 2_000, hostBuildVersion: '0.1.27' } },
    },
    completionRequest: {
      protocol: 'cutout.commerce-held-out-evaluator-completion.v2',
      challengeId: 'challenge:test',
      challengeHash: HASH,
      evaluatorKeyId: 'evaluator:minisign:test',
      hostBuildVersion: '0.1.27',
      commitmentHash: HASH,
      inputManifestHash: HASH,
      runId: 'run:test',
      bundleHash: HASH,
      decision: 'accepted',
      deliverableCount: 11,
    },
    bundle: { artifacts },
  }
}

async function inspectablePending() {
  const { bundle } = await createCommerceRehearsalFixture()
  const bundleHash = await fingerprint(bundle)
  const evaluatorKeyId = 'evaluator:minisign:inspection'
  const challengeId = 'challenge:commerce-held-out:inspection'
  const inputManifestHash = 'b'.repeat(64)
  const challengeHash = 'c'.repeat(64)
  const commitmentHash = 'd'.repeat(64)
  return {
    schema: 'commerce.held-out-pending-admission.v1',
    commitment: {
      protocol: 'cutout.commerce-held-out-commitment.v2',
      commitmentId: 'commitment:commerce-held-out:inspection',
      commitmentHash,
      challengeSelection: {
        payload: {
          protocol: 'cutout.commerce-held-out-challenge-selection.v2',
          benchmark: { id: 'benchmark:commerce-profile:p1-p7', version: 2 },
          profile: { id: 'profile:commerce-materials', version: '1.1.0' },
          hostBuildVersion: '0.1.27',
          challengeId,
          challengeNonce: 'n'.repeat(32),
          inputManifestHash,
          allowedRunId: bundle.runId,
          evaluatorKeyId,
          issuedAt: 1,
          expiresAt: 86_400_001,
        },
        signature: 's'.repeat(100),
      },
      challengeHash,
      evaluatorKeyId,
      hostBuildVersion: '0.1.27',
      inputManifest: {
        schema: 'commerce.held-out-input-manifest.v1',
        rehearsalIdentity: bundle.identity,
        factsHash: 'e'.repeat(64),
        categoryCatalogHash: 'f'.repeat(64),
        attributeCatalogHash: '1'.repeat(64),
        selectedSources: bundle.sourceMaterials.map((material) => ({
          factId: material.factId,
          sourceFile: material.source.file,
          sourcePointer: material.source.pointer,
          sourceDescriptor: material.source.descriptor,
          sourceDescriptorSha256: '2'.repeat(64),
        })),
      },
      inputManifestHash,
      runId: bundle.runId,
      issuedAt: 1,
      signature: '3'.repeat(64),
    },
    bundle,
    completionRequest: {
      protocol: 'cutout.commerce-held-out-evaluator-completion.v2',
      challengeId,
      challengeHash,
      evaluatorKeyId,
      hostBuildVersion: '0.1.27',
      commitmentHash,
      inputManifestHash,
      runId: bundle.runId,
      bundleHash,
      decision: 'accepted',
      deliverableCount: 11,
    },
  }
}

describe('independent Commerce evaluator handoff (not benchmark evidence)', () => {
  it('publishes the complete evaluator-owned handoff in CLI help', async () => {
    const { stdout } = await execFileAsync(process.execPath, [evaluatorCliPath, '--help'], {
      cwd: process.cwd(),
    })
    expect(stdout).toContain('prepare --product <file>')
    expect(stdout).toContain('key-info --public-key <file>')
    expect(stdout).toContain('challenge --input <file>')
    expect(stdout).toContain('inspect --pending <file>')
    expect(stdout).toContain('review --pending <file>')
    expect(stdout).toContain('complete --pending <file>')

    const packageEntry = await execFileAsync(process.execPath, [evaluatorCliPath, '--', '--help'], {
      cwd: process.cwd(),
    })
    expect(packageEntry.stdout).toBe(stdout)
  })

  it('prepares one strict evaluator-owned input from the three raw competition files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cutout-commerce-prepare-'))
    const productPath = join(directory, 'unseen-product.json')
    const categoryPath = join(directory, 'clothing_categories.json')
    const attributePath = join(directory, 'clothing_attributes.json')
    const outputPath = join(directory, 'evaluator-input.json')
    try {
      await Promise.all([
        writeFile(productPath, JSON.stringify(fixtureProductRecord), { mode: 0o600 }),
        writeFile(categoryPath, fixtureCategoryCatalog, { mode: 0o600 }),
        writeFile(attributePath, fixtureAttributeCatalog, { mode: 0o600 }),
      ])
      await execFileAsync(process.execPath, [
        evaluatorCliPath,
        'prepare',
        '--product', productPath,
        '--category-catalog', categoryPath,
        '--attribute-catalog', attributePath,
        '--identity-id', 'rehearsal:independent:1',
        '--identity-revision', 'revision:independent:1',
        '--output', outputPath,
      ], { cwd: process.cwd() })

      const prepared = commerceHeldOutEvaluatorInputSchema.parse(
        JSON.parse(await readFile(outputPath, 'utf8')),
      )
      expect(prepared.facts.sourceFile).toBe('product/unseen-product.json')
      expect(prepared.selectedSourceFactIds).toEqual([prepared.facts.identityAnchorFactId])
      expect(prepared.categoryCatalog).toBe(fixtureCategoryCatalog)
      expect(prepared.attributeCatalog).toBe(fixtureAttributeCatalog)

      await expect(execFileAsync(process.execPath, [
        evaluatorCliPath,
        'prepare',
        '--product', productPath,
        '--category-catalog', categoryPath,
        '--attribute-catalog', attributePath,
        '--identity-id', 'rehearsal:independent:1',
        '--identity-revision', 'revision:independent:1',
        '--output', outputPath,
      ], { cwd: process.cwd() })).rejects.toThrow()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }, 20_000)

  it('rejects source-selection drift before invoking the external signer', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cutout-commerce-challenge-'))
    const productPath = join(directory, 'unseen-product.json')
    const categoryPath = join(directory, 'clothing_categories.json')
    const attributePath = join(directory, 'clothing_attributes.json')
    const preparedPath = join(directory, 'evaluator-input.json')
    const driftedPath = join(directory, 'drifted-input.json')
    const publicKeyPath = join(directory, 'evaluator.pub')
    try {
      await Promise.all([
        writeFile(productPath, JSON.stringify(fixtureProductRecord), { mode: 0o600 }),
        writeFile(categoryPath, fixtureCategoryCatalog, { mode: 0o600 }),
        writeFile(attributePath, fixtureAttributeCatalog, { mode: 0o600 }),
        writeFile(
          publicKeyPath,
          'untrusted comment: minisign public key\nRWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3\n',
          { mode: 0o600 },
        ),
      ])
      await execFileAsync(process.execPath, [
        evaluatorCliPath,
        'prepare',
        '--product', productPath,
        '--category-catalog', categoryPath,
        '--attribute-catalog', attributePath,
        '--identity-id', 'rehearsal:independent:drift',
        '--identity-revision', 'revision:independent:drift',
        '--output', preparedPath,
      ], { cwd: process.cwd() })
      const prepared = commerceHeldOutEvaluatorInputSchema.parse(
        JSON.parse(await readFile(preparedPath, 'utf8')),
      )
      await writeFile(driftedPath, JSON.stringify({
        ...prepared,
        selectedSourceFactIds: [prepared.facts.categoryFactId],
      }), { mode: 0o600 })

      await expect(execFileAsync(process.execPath, [
        evaluatorCliPath,
        'challenge',
        '--input', driftedPath,
        '--public-key', publicKeyPath,
        '--secret-key', join(directory, 'must-not-be-read.key'),
        '--output', join(directory, 'must-not-be-created.json'),
      ], { cwd: process.cwd() })).rejects.toMatchObject({
        stderr: expect.stringContaining('immutable identity anchor'),
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }, 20_000)

  it('materializes exact retained review bytes into one exclusive private directory', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cutout-commerce-inspection-'))
    const pendingPath = join(directory, 'pending.json')
    const outputDirectory = join(directory, 'inspection')
    try {
      const value = await inspectablePending()
      await writeFile(pendingPath, JSON.stringify(value), { mode: 0o600 })
      await execFileAsync(process.execPath, [
        evaluatorCliPath,
        'inspect',
        '--pending', pendingPath,
        '--output-dir', outputDirectory,
      ], { cwd: process.cwd() })

      const manifest = JSON.parse(await readFile(join(outputDirectory, 'manifest.json'), 'utf8'))
      const review = JSON.parse(await readFile(join(outputDirectory, 'review.json'), 'utf8'))
      const expectedFileCount = value.bundle.sourceMaterials.length
        + value.bundle.artifacts.length
        + value.bundle.artifacts.filter((artifact) => artifact.deliveryBytesBase64).length
        + value.bundle.artifacts.filter((artifact) => artifact.semanticQa).length
      expect(manifest).toMatchObject({
        schema: 'commerce.held-out-evaluator-inspection.v1',
        runId: value.bundle.runId,
        bundleHash: value.completionRequest.bundleHash,
        reviewFile: 'review.json',
      })
      expect(manifest.files).toHaveLength(expectedFileCount)
      expect(review.deliverables).toHaveLength(11)
      await expect(readFile(join(outputDirectory, '04-main-image.png'))).resolves.toBeInstanceOf(Buffer)
      await expect(readFile(join(outputDirectory, '10-product-video.mp4'))).resolves.toBeInstanceOf(Buffer)
      await expect(readFile(join(outputDirectory, '11-strategy-document.delivery.md'), 'utf8'))
        .resolves.toContain('# Commerce Strategy')
      if (process.platform !== 'win32') {
        expect((await lstat(outputDirectory)).mode & 0o077).toBe(0)
      }

      await expect(execFileAsync(process.execPath, [
        evaluatorCliPath,
        'inspect',
        '--pending', pendingPath,
        '--output-dir', outputDirectory,
      ], { cwd: process.cwd() })).rejects.toThrow()
      await expect(readFile(join(outputDirectory, 'review.json'), 'utf8')).resolves.toContain(
        value.completionRequest.bundleHash,
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }, 20_000)

  it('rejects receipt-byte drift and removes the incomplete inspection directory', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cutout-commerce-inspection-drift-'))
    const pendingPath = join(directory, 'pending.json')
    const outputDirectory = join(directory, 'inspection')
    try {
      const value = await inspectablePending()
      value.bundle.artifacts[0]!.artifactBytesBase64 = Buffer.from('tampered').toString('base64')
      value.completionRequest.bundleHash = await fingerprint(value.bundle)
      await writeFile(pendingPath, JSON.stringify(value), { mode: 0o600 })

      await expect(execFileAsync(process.execPath, [
        evaluatorCliPath,
        'inspect',
        '--pending', pendingPath,
        '--output-dir', outputDirectory,
      ], { cwd: process.cwd() })).rejects.toMatchObject({
        stderr: expect.stringContaining('exact retained receipt bytes'),
      })
      await expect(lstat(outputDirectory)).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('derives the exact build-pinned key id used by native admission', () => {
    const publicKey = 'RWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3'
    const info = evaluatorKeyInfo(`untrusted comment: minisign public key\n${publicKey}\n`)
    expect(info).toEqual({
      publicKey,
      keyId: 'evaluator:minisign:sha256:84115545a4e819b300a437c2fc2b630c6510dd2048cd5d13e91e28dcfcd86e4d',
      buildEnvironmentVariable: 'CUTOUT_COMMERCE_EVALUATOR_PUBKEY',
    })
  })

  it('creates a bounded unseen-input challenge with canonical protocol identities', () => {
    const payload = createChallengePayload({
      inputManifestHash: HASH,
      evaluatorKeyId: 'evaluator:minisign:test',
      hostBuildVersion: '0.1.27',
      ttlMinutes: 30,
      now: 1_000,
    })
    expect(payload).toMatchObject({
      protocol: 'cutout.commerce-held-out-challenge-selection.v2',
      inputManifestHash: HASH,
      evaluatorKeyId: 'evaluator:minisign:test',
      hostBuildVersion: '0.1.27',
      issuedAt: 1_000,
      expiresAt: 1_801_000,
    })
    expect(payload.challengeNonce).toMatch(/^[A-Za-z0-9_-]{32,128}$/)
    expect(canonicalJson(payload)).toContain('"allowedRunId":"run:commerce-held-out:')
  })

  it('derives one authoritative evaluator build version and rejects package/Cargo drift', () => {
    expect(resolveAuthoritativeHostBuildVersion({
      packageVersion: '0.1.27',
      cargoVersion: '0.1.27',
    })).toBe('0.1.27')
    expect(() => resolveAuthoritativeHostBuildVersion({
      packageVersion: '0.1.27',
      cargoVersion: '0.1.19',
    })).toThrow(/drifted/)
  })

  it('requires explicit review of the exact eleven deliverables before completion', () => {
    const value = pending()
    const template = createReviewTemplate(value)
    expect(template.deliverables).toHaveLength(11)
    const accepted = {
      ...template,
      reviewerId: 'reviewer:independent',
      decision: 'accepted',
      reviewedAt: 1_500,
    }
    expect(validateAcceptedReview(accepted, value)).toEqual(accepted)
    expect(createCompletionPayload({ pending: value, review: accepted, completedAt: 1_600 })).toMatchObject({
      challengeId: 'challenge:test',
      hostBuildVersion: '0.1.27',
      bundleHash: HASH,
      decision: 'accepted',
      deliverableCount: 11,
      completedAt: 1_600,
    })
    const drift = structuredClone(accepted)
    drift.deliverables[0]!.sha256 = 'f'.repeat(64)
    expect(() => validateAcceptedReview(drift, value)).toThrow(/exact eleven-deliverable/)
    const versionDrift = pending()
    versionDrift.completionRequest.hostBuildVersion = '0.1.19'
    expect(() => createCompletionPayload({
      pending: versionDrift,
      review: { ...accepted, reviewedAt: 1_500 },
      completedAt: 1_600,
    })).toThrow(/build version drifted/)
  })
})
