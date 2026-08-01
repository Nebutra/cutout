import { canonicalJson, sha256Bytes, sha256Json } from '@/asset-production/hash'
import type { PersistedPrototypeSuiteCandidateSet } from '@/workspace/workspace-snapshot'
import {
  designMarkdownToCssVariables,
  designMarkdownToTailwindTheme,
  designMarkdownToTokensJson,
  projectDesignMarkdownTokens,
} from './design-md-export'
import { parseEditableDesignMarkdown } from './design-md'
import {
  prototypeRouteGraphFingerprint,
  validatePrototypeSuiteCandidateSet,
} from './prototype-suite-candidates'
import type { VerifiedResourcePackArtifact } from './resource-pack-production'

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
  readonly qualityReviewStatus: 'recorded'
  readonly digests: {
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
  }
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

    const pageMedia = await Promise.all(artifact.pages.map(async (page) => ({
      pageId: page.page.id,
      mediaType: page.mediaType,
      width: page.width,
      height: page.height,
      sha256: await sha256Bytes(page.bytes),
    })))
    const provenance = {
      designSystem: artifact.designSystem.provenanceIds,
      suite: artifact.provenanceIds,
      manifest: artifact.resourcePack.manifestProvenanceId,
      assets: artifact.resourcePack.assets.map((asset) => ({
        manifestItemId: asset.manifestItemId,
        provenanceIds: asset.provenanceIds,
      })),
    }
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
      ) {
        throw new Error(`Candidate "${candidate.id}" has unverified resource bytes for "${binding.manifestItemId}".`)
      }
      return verified
    })
    if (verifiedByManifestItem.size !== resourceArtifacts.length) {
      throw new Error(`Candidate "${candidate.id}" has ambiguous resource artifact evidence.`)
    }
    const markdown = artifact.designSystem.artifact.designMarkdown
    const cssVariables = designMarkdownToCssVariables(model)
    const tailwindTheme = designMarkdownToTailwindTheme(model)
    const tokensJson = designMarkdownToTokensJson(model)

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
      qualityReviewStatus: 'recorded',
      digests: {
        designSystemImage: await sha256Bytes(artifact.designSystem.artifact.bytes),
        designMarkdown: await sha256Text(markdown),
        cssVariables: await sha256Text(cssVariables),
        tailwindTheme: await sha256Text(tailwindTheme),
        tokensJson: await sha256Text(tokensJson),
        designIrTokens: await sha256Json(designIrTokens),
        routeGraph: await sha256Text(prototypeRouteGraphFingerprint(artifact.plan)),
        pageMedia: await sha256Json(pageMedia),
        manifest: await sha256Json(artifact.resourcePack.manifest),
        bindings: await sha256Json(bindings),
        resourcePack: await sha256Json(resourcePackIdentity),
        resourceArtifacts: await sha256Json(resourceArtifacts),
        provenance: await sha256Json(provenance),
        reviewDocument: await sha256Text(canonicalJson(reviewDocument)),
      },
    })
  }
  return evidence
}

async function sha256Text(value: string): Promise<string> {
  return sha256Bytes(new TextEncoder().encode(value))
}
