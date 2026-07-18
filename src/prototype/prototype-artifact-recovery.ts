import { bytesToBlob } from '@/lib/image'
import { readRasterDimensions } from '@/lib/raster-dimensions'
import type {
  PersistedPrototypeDesignSystem,
  PersistedPrototypeImage,
  PersistedPrototypePage,
} from '@/workspace/workspace-snapshot'
import { designSystemMarkdownValidationError } from './design-system-validation'

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

/** Restore legacy/current workspace.v1 artifacts without conflating media and docs. */
export function recoverPrototypeArtifacts(
  input: PersistedPrototypeArtifactsInput,
): PrototypeArtifactProjection {
  const normalizedDesignSystem = input.designSystem
    ? normalizePersistedDimensions(input.designSystem)
    : null
  const designSystemMediaError = input.designSystem && !normalizedDesignSystem
    ? prototypeMediaValidationError(input.designSystem)
    : null
  const designSystem = normalizedDesignSystem
    ? restoreDesignSystem(normalizedDesignSystem)
    : null
  const pages: PrototypePageArtifact[] = []
  const rejectedPageIds: string[] = []

  for (const page of input.pages) {
    const normalized = normalizePersistedDimensions(page)
    if (!normalized) {
      rejectedPageIds.push(page.page.id)
      continue
    }
    pages.push(restorePage(normalized))
  }

  return buildProjection({ designSystem, pages }, {
    designSystemMediaError,
    rejectedPageIds,
  })
}

function normalizePersistedDimensions<T extends PersistedPrototypeImage>(
  artifact: T,
): T | null {
  if (!(artifact.bytes instanceof Uint8Array) || artifact.bytes.byteLength === 0) {
    return null
  }
  if (!prototypeMediaValidationError(artifact)) return artifact
  const recovered = readRasterDimensions(artifact.bytes)
  return recovered ? { ...artifact, ...recovered } : null
}

/** Re-project current artifacts after generation or repair; diagnostics never drift. */
export function projectPrototypeArtifacts(
  input: PrototypeArtifactsInput,
): PrototypeArtifactProjection {
  const designSystemMediaError = input.designSystem
    ? prototypeMediaValidationError(input.designSystem)
    : null
  const designSystem = designSystemMediaError ? null : input.designSystem
  const pages = input.pages.filter((page) => !prototypeMediaValidationError(page))

  return buildProjection({ designSystem, pages }, {
    designSystemMediaError,
    rejectedPageIds: input.pages
      .filter((page) => Boolean(prototypeMediaValidationError(page)))
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
