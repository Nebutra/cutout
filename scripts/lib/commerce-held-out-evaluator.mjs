import { createHash, randomBytes, randomUUID } from 'node:crypto'

export const evaluatorReviewSchema = 'commerce.held-out-evaluator-review.v1'
const semanticVersion = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u

export function resolveAuthoritativeHostBuildVersion({ packageVersion, cargoVersion }) {
  if (typeof packageVersion !== 'string'
    || typeof cargoVersion !== 'string'
    || !semanticVersion.test(packageVersion)
    || packageVersion !== cargoVersion) {
    throw new Error('Evaluator host build version drifted between package.json and Cargo.toml.')
  }
  return packageVersion
}

export function canonicalJson(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    )).join(',')}}`
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError('Canonical JSON cannot contain non-finite numbers.')
  }
  return JSON.stringify(value)
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function evaluatorKeyInfo(publicKeyText) {
  if (typeof publicKeyText !== 'string' || publicKeyText.length > 16_384) {
    throw new Error('Evaluator public key is invalid.')
  }
  const publicKey = publicKeyText.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean).at(-1)
  if (!publicKey || !/^[A-Za-z0-9+/=]{40,200}$/u.test(publicKey)) {
    throw new Error('Evaluator public key is invalid.')
  }
  return {
    publicKey,
    keyId: `evaluator:minisign:sha256:${sha256(publicKey)}`,
    buildEnvironmentVariable: 'CUTOUT_COMMERCE_EVALUATOR_PUBKEY',
  }
}

export function createChallengePayload(input) {
  const now = input.now ?? Date.now()
  const ttlMinutes = input.ttlMinutes ?? 240
  if (!Number.isSafeInteger(now) || now < 0
    || !Number.isSafeInteger(ttlMinutes) || ttlMinutes < 1 || ttlMinutes > 1_440) {
    throw new Error('Challenge time window is invalid.')
  }
  if (typeof input.hostBuildVersion !== 'string' || !semanticVersion.test(input.hostBuildVersion)) {
    throw new Error('Challenge host build version is invalid.')
  }
  return {
    protocol: 'cutout.commerce-held-out-challenge-selection.v2',
    benchmark: { id: 'benchmark:commerce-profile:p1-p7', version: 2 },
    profile: { id: 'profile:commerce-materials', version: '1.1.0' },
    hostBuildVersion: input.hostBuildVersion,
    challengeId: `challenge:commerce-held-out:${randomUUID()}`,
    challengeNonce: randomBytes(32).toString('base64url'),
    inputManifestHash: input.inputManifestHash,
    allowedRunId: `run:commerce-held-out:${randomUUID()}`,
    evaluatorKeyId: input.evaluatorKeyId,
    issuedAt: now,
    expiresAt: now + ttlMinutes * 60_000,
  }
}

export function createReviewTemplate(pending) {
  return {
    schema: evaluatorReviewSchema,
    reviewId: `review:commerce-held-out:${randomUUID()}`,
    reviewerId: '',
    challengeId: pending.completionRequest.challengeId,
    evaluatorKeyId: pending.completionRequest.evaluatorKeyId,
    runId: pending.completionRequest.runId,
    bundleHash: pending.completionRequest.bundleHash,
    decision: 'pending',
    reviewedAt: 0,
    deliverables: pending.bundle.artifacts.map((artifact) => ({
      semanticRole: artifact.semanticRole,
      artifactId: artifact.receipt.artifact.artifactId,
      sha256: artifact.receipt.artifact.sha256,
      mediaType: artifact.receipt.artifact.mediaType,
      byteLength: artifact.receipt.artifact.byteLength,
      receiptId: artifact.receipt.receiptId,
      semanticQaReceiptId: artifact.semanticQa?.receipt.receiptId ?? null,
      playbackVerified: artifact.receipt.artifact.playbackVerified ?? null,
    })),
  }
}

export function validateAcceptedReview(review, pending) {
  const expected = createReviewTemplate(pending)
  const expectedKeys = Object.keys(expected).sort()
  if (!review || typeof review !== 'object' || Array.isArray(review)
    || canonicalJson(Object.keys(review).sort()) !== canonicalJson(expectedKeys)
    || review.schema !== evaluatorReviewSchema
    || typeof review.reviewId !== 'string' || review.reviewId.length < 1 || review.reviewId.length > 240
    || typeof review.reviewerId !== 'string' || review.reviewerId.length < 1 || review.reviewerId.length > 240
    || review.challengeId !== expected.challengeId
    || review.evaluatorKeyId !== expected.evaluatorKeyId
    || review.runId !== expected.runId
    || review.bundleHash !== expected.bundleHash
    || review.decision !== 'accepted'
    || !Number.isSafeInteger(review.reviewedAt) || review.reviewedAt < 1
    || canonicalJson(review.deliverables) !== canonicalJson(expected.deliverables)) {
    throw new Error('Evaluator review does not explicitly accept the exact eleven-deliverable pending bundle.')
  }
  return review
}

export function createCompletionPayload(input) {
  const completion = input.pending.completionRequest
  const challenge = input.pending.commitment.challengeSelection.payload
  const completedAt = input.completedAt ?? Date.now()
  if (!Number.isSafeInteger(completedAt)
    || completedAt < input.review.reviewedAt
    || completedAt > challenge.expiresAt) {
    throw new Error('Evaluator completion time is outside the accepted review and challenge window.')
  }
  if (completion.hostBuildVersion !== challenge.hostBuildVersion) {
    throw new Error('Evaluator completion Host build version drifted from the signed challenge.')
  }
  return {
    protocol: completion.protocol,
    attestationId: `attestation:commerce-held-out:${randomUUID()}`,
    challengeHash: completion.challengeHash,
    challengeId: completion.challengeId,
    evaluatorKeyId: completion.evaluatorKeyId,
    hostBuildVersion: completion.hostBuildVersion,
    commitmentHash: completion.commitmentHash,
    inputManifestHash: completion.inputManifestHash,
    runId: completion.runId,
    bundleHash: completion.bundleHash,
    decision: completion.decision,
    deliverableCount: completion.deliverableCount,
    completedAt,
  }
}
