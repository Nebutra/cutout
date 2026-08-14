import { canonicalJson, sha256Bytes } from '@/asset-production/hash'
import type { PersistedPrototypeSuiteCandidateSet } from '@/workspace/workspace-snapshot'
import {
  designMarkdownToCssVariables,
  designMarkdownToTailwindTheme,
  designMarkdownToTokensJson,
  projectDesignMarkdownTokens,
} from './design-md-export'
import { parseEditableDesignMarkdown } from './design-md'
import {
  validatePrototypeSuiteCandidateSet,
} from './prototype-suite-candidates'
import { prototypeRouteGraphFingerprint } from './prototype-plan'
import type { VerifiedResourcePackArtifact } from './resource-pack-production'
import {
  prototypePageReviewRecordSchema,
  prototypeResourceReviewRecordSchema,
} from './review-evidence'

export interface PrototypeDeliveryEvidence {
  readonly candidateId: `suite-${number}`
  readonly designSystemId: `design-${number}`
  readonly resourcePackId: `resource-pack-${number}`
  readonly status: 'ready'
  readonly routes: readonly string[]
  readonly routeCount: number
  readonly pageCount: number
  readonly resourceAssetCount: number
  readonly artifactCount: number
  readonly qualityReviewStatus: 'passed' | 'attention-required'
  readonly routeGraph: string
  readonly designSystemMedia: PrototypeDeliveryMediaEvidence
  readonly pageMedia: readonly PrototypeDeliveryPageMediaEvidence[]
  readonly resourceMedia: readonly PrototypeDeliveryResourceMediaEvidence[]
  /** Exact source material retained only by the packaged evidence sink. */
  readonly files: readonly PrototypeDeliveryEvidenceFile[]
  readonly digests: {
    readonly plan: string
    readonly designSystemImage: string
    readonly designMarkdown: string
    readonly cssVariables: string
    readonly tailwindTheme: string
    readonly tokensJson: string
    readonly designIrTokens: string
    readonly routeGraph: string
    readonly pageMedia: string
    readonly manifest: string
    readonly bindings: string
    readonly resourcePack: string
    readonly resourceArtifacts: string
    readonly provenance: string
    readonly reviewDocument: string
    readonly pageReviews: string
    readonly resourceReviews: string
  }
}

export type PrototypeDeliveryEvidenceFileRole =
  | keyof PrototypeDeliveryEvidence['digests']
  | 'designSystemMedia'
  | 'pageMediaObject'
  | 'resourceMediaObject'

export interface PrototypeDeliveryEvidenceFile {
  readonly role: PrototypeDeliveryEvidenceFileRole
  readonly ordinal?: number
  readonly sha256: string
  readonly byteLength: number
  readonly bytesBase64: string
  readonly mediaType?: string
  readonly width?: number
  readonly height?: number
}

export interface PrototypeDeliveryMediaEvidence {
  readonly mediaType: string
  readonly width: number
  readonly height: number
  readonly sha256: string
}

export interface PrototypeDeliveryPageMediaEvidence extends PrototypeDeliveryMediaEvidence {
  readonly ordinal: number
  readonly route: string
}

export interface PrototypeDeliveryResourceMediaEvidence extends PrototypeDeliveryMediaEvidence {
  readonly ordinal: number
  readonly byteLength: number
}

export interface PrototypeDeliveryQualitySummary {
  readonly candidateId: `suite-${number}`
  readonly pageRejectedCount: number
  readonly pageUnavailableCount: number
  readonly resourceRejectedCount: number
  readonly resourceUnavailableCount: number
  readonly resourceObservationalIssueCount: number
}

/**
 * Projects only closed quality categories and counts for packaged failure
 * diagnosis. Review text and reviewer/provider identities stay out of the DOM
 * and retained E2E evidence.
 */
export function projectPrototypeDeliveryQualitySummaries(
  input: PersistedPrototypeSuiteCandidateSet,
): readonly PrototypeDeliveryQualitySummary[] {
  const validated = validatePrototypeSuiteCandidateSet(input)
  if (!validated.ok) throw new Error(validated.error)

  return validated.data.set.candidates.flatMap((candidate, candidateIndex) => {
    if (candidate.status !== 'ready') return []
    const artifact = validated.data.artifacts[candidate.id]
    if (!artifact) throw new Error(`Ready prototype suite candidate "${candidate.id}" is missing evidence.`)

    let pageRejectedCount = 0
    let pageUnavailableCount = 0
    for (const page of artifact.pages) {
      const review = prototypePageReviewRecordSchema.parse(page.review)
      if (review.verdict.unavailable === true) pageUnavailableCount += 1
      else if (!review.verdict.pass) pageRejectedCount += 1
    }

    let resourceRejectedCount = 0
    let resourceUnavailableCount = 0
    let resourceObservationalIssueCount = 0
    for (const asset of artifact.resourcePack.assets) {
      const review = prototypeResourceReviewRecordSchema.parse(asset.review)
      if (review.verdict.unavailable === true) resourceUnavailableCount += 1
      else if (!review.verdict.pass) resourceRejectedCount += 1
      resourceObservationalIssueCount += review.observationalIssues.length
    }

    return [{
      candidateId: `suite-${candidateIndex + 1}` as const,
      pageRejectedCount,
      pageUnavailableCount,
      resourceRejectedCount,
      resourceUnavailableCount,
      resourceObservationalIssueCount,
    }]
  })
}

/**
 * Projects complete persisted suites into credential-free delivery proof. The
 * candidate validator remains the authority for topology, media, bindings,
 * and provenance; this layer only derives stable identities and digests.
 */
export async function projectPrototypeDeliveryEvidence(
  input: PersistedPrototypeSuiteCandidateSet,
  verifiedResourceArtifacts: Readonly<
    Record<string, readonly VerifiedResourcePackArtifact[]>
  >,
): Promise<readonly PrototypeDeliveryEvidence[]> {
  const validated = validatePrototypeSuiteCandidateSet(input)
  if (!validated.ok) throw new Error(validated.error)

  const evidence: PrototypeDeliveryEvidence[] = []
  for (const [candidateIndex, candidate] of validated.data.set.candidates.entries()) {
    if (candidate.status !== 'ready') continue
    const artifact = validated.data.artifacts[candidate.id]
    if (!artifact) throw new Error(`Ready prototype suite candidate "${candidate.id}" is missing evidence.`)
    const reviewDocument = artifact.plan.reviewDocument
    if (!reviewDocument) {
      throw new Error(`Candidate "${candidate.id}" requires a recorded review document.`)
    }

    const model = parseEditableDesignMarkdown(artifact.designSystem.artifact.designMarkdown)
    const designIrTokens = projectDesignMarkdownTokens(model, {
      provenanceId: artifact.designSystem.provenanceIds[0]!,
    })
    const designIndex = validated.data.set.proposal.directions.findIndex(
      (direction) => direction.id === candidate.directionId,
    )
    if (designIndex < 0) {
      throw new Error(`Candidate "${candidate.id}" has no matching Design System direction.`)
    }

    let attentionRequired = false
    const pageReviews = []
    const pageMedia: PrototypeDeliveryPageMediaEvidence[] = []
    for (const [pageIndex, page] of artifact.pages.entries()) {
      const digest = await sha256Bytes(page.bytes)
      const parsedReview = prototypePageReviewRecordSchema.safeParse(page.review)
      if (!parsedReview.success || parsedReview.data.artifactSha256 !== digest) {
        throw new Error(`Candidate "${candidate.id}" has missing or stale page review evidence for "${page.page.id}".`)
      }
      attentionRequired ||= !parsedReview.data.verdict.pass || parsedReview.data.verdict.unavailable === true
      pageReviews.push({ pageId: page.page.id, review: parsedReview.data })
      pageMedia.push({
        ordinal: pageIndex + 1,
        route: page.page.route,
        mediaType: page.mediaType,
        width: page.width,
        height: page.height,
        sha256: digest,
      })
    }
    const provenance = {
      designSystem: artifact.designSystem.provenanceIds,
      suite: artifact.provenanceIds,
      manifest: artifact.resourcePack.manifestProvenanceId,
      assets: artifact.resourcePack.assets.map((asset) => ({
        manifestItemId: asset.manifestItemId,
        provenanceIds: asset.provenanceIds,
      })),
    }
    const resourceReviews = artifact.resourcePack.assets.map((asset) => {
      const parsed = prototypeResourceReviewRecordSchema.safeParse(asset.review)
      if (!parsed.success || parsed.data.artifactId !== asset.artifactId) {
        throw new Error(`Candidate "${candidate.id}" has missing or stale resource review evidence for "${asset.manifestItemId}".`)
      }
      attentionRequired ||= !parsed.data.verdict.pass
        || parsed.data.verdict.unavailable === true
        || parsed.data.observationalIssues.length > 0
      return { manifestItemId: asset.manifestItemId, review: parsed.data }
    })
    const bindings = artifact.resourcePack.assets.map((asset) => ({
      manifestItemId: asset.manifestItemId,
      artifactId: asset.artifactId,
    }))
    const resourcePackIdentity = {
      id: artifact.resourcePack.id,
      manifestProvenanceId: artifact.resourcePack.manifestProvenanceId,
      bindings,
    }
    const verifiedArtifacts = verifiedResourceArtifacts[candidate.id]
    if (!verifiedArtifacts || verifiedArtifacts.length !== artifact.resourcePack.assets.length) {
      throw new Error(`Candidate "${candidate.id}" requires verified local resource artifacts.`)
    }
    const verifiedByManifestItem = new Map(
      verifiedArtifacts.map((item) => [item.manifestItemId, item]),
    )
    const resourceArtifacts = artifact.resourcePack.assets.map((binding) => {
      const verified = verifiedByManifestItem.get(binding.manifestItemId)
      if (
        !verified
        || verified.artifactId !== binding.artifactId
        || !/^[a-f0-9]{64}$/.test(verified.sha256)
        || verified.byteLength < 1
        || typeof verified.bytesBase64 !== 'string'
        || verified.bytesBase64.length < 1
      ) {
        throw new Error(`Candidate "${candidate.id}" has unverified resource bytes for "${binding.manifestItemId}".`)
      }
      return verified
    })
    if (verifiedByManifestItem.size !== resourceArtifacts.length) {
      throw new Error(`Candidate "${candidate.id}" has ambiguous resource artifact evidence.`)
    }
    const markdown = artifact.designSystem.artifact.designMarkdown
    const designSystemImageDigest = await sha256Bytes(artifact.designSystem.artifact.bytes)
    const resourceMedia: PrototypeDeliveryResourceMediaEvidence[] = resourceArtifacts.map(
      (resource, index) => ({
        ordinal: index + 1,
        mediaType: resource.mediaType,
        width: resource.width,
        height: resource.height,
        byteLength: resource.byteLength,
        sha256: resource.sha256,
      }),
    )
    const cssVariables = designMarkdownToCssVariables(model)
    const tailwindTheme = designMarkdownToTailwindTheme(model)
    const tokensJson = designMarkdownToTokensJson(model)
    const plan = canonicalJson(artifact.plan)
    const designIrTokenProjection = canonicalJson(designIrTokens)
    const routeGraph = prototypeRouteGraphFingerprint(artifact.plan)
    const pageMediaDocument = canonicalJson(pageMedia)
    const manifest = canonicalJson(artifact.resourcePack.manifest)
    const bindingsDocument = canonicalJson(bindings)
    const resourcePack = canonicalJson(resourcePackIdentity)
    const resourceArtifactsDocument = canonicalJson(resourceArtifacts.map((resource) => ({
      manifestItemId: resource.manifestItemId,
      artifactId: resource.artifactId,
      sha256: resource.sha256,
      mediaType: resource.mediaType,
      width: resource.width,
      height: resource.height,
      byteLength: resource.byteLength,
    })))
    const provenanceDocument = canonicalJson(provenance)
    const reviewDocumentText = canonicalJson(reviewDocument)
    const pageReviewsDocument = canonicalJson(pageReviews)
    const resourceReviewsDocument = canonicalJson(resourceReviews)
    const textFiles = await Promise.all(([
      ['plan', plan],
      ['designMarkdown', markdown],
      ['cssVariables', cssVariables],
      ['tailwindTheme', tailwindTheme],
      ['tokensJson', tokensJson],
      ['designIrTokens', designIrTokenProjection],
      ['routeGraph', routeGraph],
      ['pageMedia', pageMediaDocument],
      ['manifest', manifest],
      ['bindings', bindingsDocument],
      ['resourcePack', resourcePack],
      ['resourceArtifacts', resourceArtifactsDocument],
      ['provenance', provenanceDocument],
      ['reviewDocument', reviewDocumentText],
      ['pageReviews', pageReviewsDocument],
      ['resourceReviews', resourceReviewsDocument],
    ] as const).map(async ([role, content]) => evidenceTextFile(role, content)))
    const files: PrototypeDeliveryEvidenceFile[] = [
      ...textFiles,
      evidenceBinaryFile({
        role: 'designSystemMedia',
        bytes: artifact.designSystem.artifact.bytes,
        sha256: designSystemImageDigest,
        mediaType: artifact.designSystem.artifact.mediaType,
        width: artifact.designSystem.artifact.width,
        height: artifact.designSystem.artifact.height,
      }),
      ...artifact.pages.map((page, index) => evidenceBinaryFile({
        role: 'pageMediaObject',
        ordinal: index + 1,
        bytes: page.bytes,
        sha256: pageMedia[index]!.sha256,
        mediaType: page.mediaType,
        width: page.width,
        height: page.height,
      })),
      ...resourceArtifacts.map((resource, index) => ({
        role: 'resourceMediaObject' as const,
        ordinal: index + 1,
        sha256: resource.sha256,
        byteLength: resource.byteLength,
        bytesBase64: resource.bytesBase64,
        mediaType: resource.mediaType,
        width: resource.width,
        height: resource.height,
      })),
    ]

    evidence.push({
      candidateId: `suite-${candidateIndex + 1}`,
      designSystemId: `design-${designIndex + 1}`,
      resourcePackId: `resource-pack-${candidateIndex + 1}`,
      status: 'ready',
      routes: artifact.plan.pages.map((page) => page.route),
      routeCount: artifact.plan.pages.length,
      pageCount: artifact.pages.length,
      resourceAssetCount: artifact.resourcePack.assets.length,
      artifactCount: artifact.resourcePack.assets.length,
      qualityReviewStatus: attentionRequired ? 'attention-required' : 'passed',
      routeGraph,
      designSystemMedia: {
        mediaType: artifact.designSystem.artifact.mediaType,
        width: artifact.designSystem.artifact.width,
        height: artifact.designSystem.artifact.height,
        sha256: designSystemImageDigest,
      },
      pageMedia,
      resourceMedia,
      files,
      digests: {
        plan: await sha256Text(plan),
        designSystemImage: designSystemImageDigest,
        designMarkdown: await sha256Text(markdown),
        cssVariables: await sha256Text(cssVariables),
        tailwindTheme: await sha256Text(tailwindTheme),
        tokensJson: await sha256Text(tokensJson),
        designIrTokens: await sha256Text(designIrTokenProjection),
        routeGraph: await sha256Text(routeGraph),
        pageMedia: await sha256Text(pageMediaDocument),
        manifest: await sha256Text(manifest),
        bindings: await sha256Text(bindingsDocument),
        resourcePack: await sha256Text(resourcePack),
        resourceArtifacts: await sha256Text(resourceArtifactsDocument),
        provenance: await sha256Text(provenanceDocument),
        reviewDocument: await sha256Text(reviewDocumentText),
        pageReviews: await sha256Text(pageReviewsDocument),
        resourceReviews: await sha256Text(resourceReviewsDocument),
      },
    })
  }
  return evidence
}

async function evidenceTextFile(
  role: keyof PrototypeDeliveryEvidence['digests'],
  content: string,
): Promise<PrototypeDeliveryEvidenceFile> {
  const bytes = new TextEncoder().encode(content)
  return {
    role,
    sha256: await sha256Bytes(bytes),
    byteLength: bytes.byteLength,
    bytesBase64: bytesToBase64(bytes),
  }
}

function evidenceBinaryFile(input: {
  readonly role: 'designSystemMedia' | 'pageMediaObject'
  readonly ordinal?: number
  readonly bytes: Uint8Array
  readonly sha256: string
  readonly mediaType: string
  readonly width: number
  readonly height: number
}): PrototypeDeliveryEvidenceFile {
  return {
    role: input.role,
    ...(input.ordinal === undefined ? {} : { ordinal: input.ordinal }),
    sha256: input.sha256,
    byteLength: input.bytes.byteLength,
    bytesBase64: bytesToBase64(input.bytes),
    mediaType: input.mediaType,
    width: input.width,
    height: input.height,
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

async function sha256Text(value: string): Promise<string> {
  return sha256Bytes(new TextEncoder().encode(value))
}
