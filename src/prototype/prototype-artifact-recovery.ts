import { bytesToBlob } from '@/lib/image'
import { readRasterDimensions } from '@/lib/raster-dimensions'
import type {
  PersistedPrototypeDesignSystem,
  PersistedPrototypeImage,
  PersistedPrototypePage,
} from '@/workspace/workspace-snapshot'
import { designSystemMarkdownValidationError } from './design-system-validation'
import type { PrototypePage } from './prototype-plan'

const MAX_PROTOTYPE_PAGE_ASPECT_RATIO_SCALE = 1.25

export interface PrototypeImageArtifact extends PersistedPrototypeImage {
  readonly blob: Blob
}

export interface PrototypeDesignSystemArtifact
  extends PrototypeImageArtifact,
    Omit<PersistedPrototypeDesignSystem, keyof PersistedPrototypeImage> {}

export interface PrototypePageArtifact
  extends PrototypeImageArtifact,
    Omit<PersistedPrototypePage, keyof PersistedPrototypeImage> {}

export type DesignSystemDocumentationHealth =
  | { readonly status: 'valid'; readonly message: null }
  | { readonly status: 'repair-required'; readonly message: string }
  | { readonly status: 'missing-artifact'; readonly message: null }

export interface PrototypeArtifactProjection {
  readonly designSystem: PrototypeDesignSystemArtifact | null
  readonly pages: readonly PrototypePageArtifact[]
  readonly designSystemMediaError: string | null
  readonly rejectedPageIds: readonly string[]
  readonly documentation: DesignSystemDocumentationHealth
  readonly hasValidDesignMarkdown: boolean
}

interface PrototypeArtifactsInput {
  readonly designSystem: PrototypeDesignSystemArtifact | null
  readonly pages: readonly PrototypePageArtifact[]
}

interface PersistedPrototypeArtifactsInput {
  readonly designSystem: PersistedPrototypeDesignSystem | null
  readonly pages: readonly PersistedPrototypePage[]
}

/** The persisted-media boundary is independent from DESIGN.md semantics. */
export function prototypeMediaValidationError(
  artifact: PersistedPrototypeImage,
): string | null {
  if (!(artifact.bytes instanceof Uint8Array) || artifact.bytes.byteLength === 0) {
    return 'Prototype image has no persisted bytes.'
  }
  if (
    !Number.isInteger(artifact.width) ||
    !Number.isInteger(artifact.height) ||
    artifact.width < 1 ||
    artifact.height < 1
  ) {
    return 'Prototype image has invalid dimensions.'
  }
  return null
}

/**
 * Validate one page against its planned canvas using intrinsic image bytes.
 * Providers may scale a requested viewport, but they may not rotate it, return
 * a materially different canvas, or rely on forged persisted dimensions.
 */
export function prototypePageViewportValidationError(
  page: Pick<PrototypePage, 'id' | 'viewport'>,
  artifact: Pick<PersistedPrototypeImage, 'bytes' | 'width' | 'height'>,
): string | null {
  const intrinsic = readRasterDimensions(artifact.bytes)
  const prefix = `Prototype page viewport contract failed for "${page.id}"`
  if (!intrinsic) {
    return `${prefix}: image bytes do not expose valid raster dimensions.`
  }
  if (intrinsic.width !== artifact.width || intrinsic.height !== artifact.height) {
    return `${prefix}: persisted ${artifact.width}x${artifact.height} metadata does not match intrinsic ${intrinsic.width}x${intrinsic.height} image bytes.`
  }

  const planned = page.viewport
  const plannedOrientation = Math.sign(planned.width - planned.height)
  const actualOrientation = Math.sign(intrinsic.width - intrinsic.height)
  if (plannedOrientation !== 0 && actualOrientation !== plannedOrientation) {
    return `${prefix}: planned ${planned.width}x${planned.height} but received ${intrinsic.width}x${intrinsic.height} with a different orientation.`
  }

  const plannedRatio = planned.width / planned.height
  const actualRatio = intrinsic.width / intrinsic.height
  const ratioScale = Math.max(actualRatio / plannedRatio, plannedRatio / actualRatio)
  if (ratioScale > MAX_PROTOTYPE_PAGE_ASPECT_RATIO_SCALE) {
    return `${prefix}: planned ${planned.width}x${planned.height} but received materially different ${intrinsic.width}x${intrinsic.height} proportions.`
  }
  return null
}

/** Restore current workspace artifacts without conflating media and docs. */
export function recoverPrototypeArtifacts(
  input: PersistedPrototypeArtifactsInput,
): PrototypeArtifactProjection {
  const designSystemMediaError = input.designSystem
    ? prototypeMediaValidationError(input.designSystem)
    : null
  const designSystem = input.designSystem && !designSystemMediaError
    ? restoreDesignSystem(input.designSystem)
    : null
  const pages: PrototypePageArtifact[] = []
  const rejectedPageIds: string[] = []

  for (const page of input.pages) {
    if (
      prototypeMediaValidationError(page)
      || prototypePageViewportValidationError(page.page, page)
    ) {
      rejectedPageIds.push(page.page.id)
      continue
    }
    pages.push(restorePage(page))
  }

  return buildProjection({ designSystem, pages }, {
    designSystemMediaError,
    rejectedPageIds,
  })
}

/** Re-project current artifacts after generation or repair; diagnostics never drift. */
export function projectPrototypeArtifacts(
  input: PrototypeArtifactsInput,
): PrototypeArtifactProjection {
  const designSystemMediaError = input.designSystem
    ? prototypeMediaValidationError(input.designSystem)
    : null
  const designSystem = designSystemMediaError ? null : input.designSystem
  const pages = input.pages.filter((page) =>
    !prototypeMediaValidationError(page)
    && !prototypePageViewportValidationError(page.page, page)
  )

  return buildProjection({ designSystem, pages }, {
    designSystemMediaError,
    rejectedPageIds: input.pages
      .filter((page) => Boolean(
        prototypeMediaValidationError(page)
        || prototypePageViewportValidationError(page.page, page),
      ))
      .map((page) => page.page.id),
  })
}

function buildProjection(
  input: PrototypeArtifactsInput,
  diagnostics: Pick<
    PrototypeArtifactProjection,
    'designSystemMediaError' | 'rejectedPageIds'
  >,
): PrototypeArtifactProjection {
  const documentationError = input.designSystem
    ? designSystemMarkdownValidationError(input.designSystem.designMarkdown)
    : null
  const documentation: DesignSystemDocumentationHealth = !input.designSystem
    ? { status: 'missing-artifact', message: null }
    : documentationError
      ? { status: 'repair-required', message: documentationError }
      : { status: 'valid', message: null }

  return {
    ...input,
    ...diagnostics,
    documentation,
    hasValidDesignMarkdown: documentation.status === 'valid',
  }
}

function restoreDesignSystem(
  artifact: PersistedPrototypeDesignSystem,
): PrototypeDesignSystemArtifact {
  return {
    ...artifact,
    blob: bytesToBlob(artifact.bytes, artifact.mediaType),
  }
}

function restorePage(artifact: PersistedPrototypePage): PrototypePageArtifact {
  return {
    ...artifact,
    blob: bytesToBlob(artifact.bytes, artifact.mediaType),
  }
}
