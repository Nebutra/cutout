import { createAsyncLimiter, forEachConcurrent } from '@/lib/async-pool'

export type PrototypePageGenerationMode = 'serial' | 'anchor-parallel'
export type PrototypePageReviewMode = 'inline' | 'overlap'

/**
 * Generate a complete ordered page set while keeping one stable visual anchor.
 *
 * `anchor-parallel` first creates (or reuses) the first planned page, then
 * generates every remaining page with that same predecessor at bounded
 * concurrency. This preserves a shared visual shell without serializing the
 * entire suite. Completion is exact: a missing or wrong page identity throws
 * before downstream asset production can consume a partial prototype.
 */
export async function generatePrototypePageSet<
  Page extends { readonly id: string },
  Artifact extends { readonly page: Page },
>(input: {
  readonly pages: readonly Page[]
  readonly existingArtifacts?: readonly Artifact[]
  readonly mode: PrototypePageGenerationMode
  readonly concurrency: number
  readonly generate: (
    page: Page,
    predecessor: Artifact | undefined,
  ) => Promise<Artifact>
  /** Adds durable review evidence to newly generated artifacts; reused pages are not reviewed again. */
  readonly review?: (artifact: Artifact) => Promise<Artifact>
  /** Inline protects a shared Provider quota; overlap uses an independent bounded review lane. */
  readonly reviewMode?: PrototypePageReviewMode
  readonly reviewConcurrency?: number
  readonly onProgress?: (artifacts: readonly Artifact[]) => void
}): Promise<Artifact[]> {
  if (input.pages.length === 0) throw new Error('The prototype plan has no pages.')
  const plannedIds = new Set(input.pages.map((page) => page.id))
  if (plannedIds.size !== input.pages.length) {
    throw new Error('The prototype page set contains duplicate page ids.')
  }

  const results = new Map<string, Artifact>()
  for (const artifact of input.existingArtifacts ?? []) {
    if (!plannedIds.has(artifact.page.id)) continue
    results.set(artifact.page.id, artifact)
  }

  const ordered = (): Artifact[] => input.pages
    .map((page) => results.get(page.id))
    .filter((artifact): artifact is Artifact => Boolean(artifact))

  const pendingReviews: Promise<void>[] = []
  const reviewLimiter = createAsyncLimiter(input.reviewConcurrency ?? input.concurrency)
  let overlappingReviewFailed = false
  let overlappingReviewFailure: unknown

  const queueOverlappingReview = (page: Page, artifact: Artifact): void => {
    const review = input.review
    if (!review) return
    pendingReviews.push(
      reviewLimiter(() => review(artifact))
        .then((reviewed) => {
          if (reviewed.page.id !== page.id) {
            throw new Error(
              `Prototype reviewer returned page "${reviewed.page.id}" for planned page "${page.id}".`,
            )
          }
          results.set(page.id, reviewed)
          input.onProgress?.(ordered())
        })
        .catch((error: unknown) => {
          if (!overlappingReviewFailed) {
            overlappingReviewFailed = true
            overlappingReviewFailure = error
          }
        }),
    )
  }

  const publish = async (page: Page, artifact: Artifact): Promise<void> => {
    if (artifact.page.id !== page.id) {
      throw new Error(
        `Prototype generator returned page "${artifact.page.id}" for planned page "${page.id}".`,
      )
    }
    const reviewMode = input.reviewMode ?? 'inline'
    const published = input.review && reviewMode === 'inline'
      ? await input.review(artifact)
      : artifact
    if (published.page.id !== page.id) {
      throw new Error(
        `Prototype reviewer returned page "${published.page.id}" for planned page "${page.id}".`,
      )
    }
    results.set(page.id, published)
    input.onProgress?.(ordered())
    if (reviewMode === 'overlap') queueOverlappingReview(page, artifact)
  }

  let generationFailed = false
  let generationFailure: unknown
  try {
    if (input.mode === 'serial') {
      let predecessor: Artifact | undefined
      for (const page of input.pages) {
        const existing = results.get(page.id)
        if (existing) {
          predecessor = existing
          continue
        }
        const artifact = await input.generate(page, predecessor)
        await publish(page, artifact)
        predecessor = artifact
      }
    } else {
      const anchorPage = input.pages[0]!
      let anchor = results.get(anchorPage.id)
      if (!anchor) {
        anchor = await input.generate(anchorPage, undefined)
        await publish(anchorPage, anchor)
      }
      const missing = input.pages.slice(1).filter((page) => !results.has(page.id))
      await forEachConcurrent(missing, input.concurrency, async (page) => {
        const artifact = await input.generate(page, anchor)
        await publish(page, artifact)
      })
    }
  } catch (error) {
    generationFailed = true
    generationFailure = error
  }

  await Promise.all(pendingReviews)
  if (generationFailed) throw generationFailure
  if (overlappingReviewFailed) throw overlappingReviewFailure

  const artifacts = ordered()
  if (artifacts.length !== input.pages.length) {
    const completedIds = new Set(artifacts.map((artifact) => artifact.page.id))
    const missing = input.pages
      .filter((page) => !completedIds.has(page.id))
      .map((page) => page.id)
    throw new Error(`Prototype generation is incomplete; missing pages: ${missing.join(', ')}.`)
  }
  return artifacts
}
