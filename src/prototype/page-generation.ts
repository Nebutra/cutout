import { createAsyncLimiter, forEachConcurrent } from '@/lib/async-pool'

export type PrototypePageGenerationMode = 'serial' | 'anchor-parallel'
export type PrototypePageReviewMode = 'inline' | 'overlap'
export type PrototypePageProductionStage =
  | 'generating'
  | 'generated'
  | 'reviewing'
  | 'accepted'
  | 'rejected'
  | 'retrying'

export interface PrototypePageProductionProgress<Page> {
  readonly page: Page
  readonly stage: PrototypePageProductionStage
  /** One-based image-generation attempt. */
  readonly attempt: number
}

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
  readonly review?: (artifact: Artifact, attempt: number) => Promise<Artifact>
  /** Inline protects a shared Provider quota; overlap uses an independent bounded review lane. */
  readonly reviewMode?: PrototypePageReviewMode
  readonly reviewConcurrency?: number
  /** Extra page-local image attempts after a completed review rejection. */
  readonly maxReviewRetries?: number
  /** A review outage is normally terminal evidence, not permission to spend another image call. */
  readonly shouldRetryReview?: (artifact: Artifact) => boolean
  /** Separates an accepted review from a terminal rejection such as reviewer unavailability. */
  readonly isReviewAccepted?: (artifact: Artifact) => boolean
  /** Regenerates only the rejected page and receives the reviewed bytes plus lesson evidence. */
  readonly retryAfterReview?: (
    page: Page,
    predecessor: Artifact | undefined,
    rejected: Artifact,
    attempt: number,
  ) => Promise<Artifact>
  readonly onPageStage?: (progress: PrototypePageProductionProgress<Page>) => void
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
  const retryLimiter = createAsyncLimiter(input.concurrency)
  const reviewRetryBudget = Math.max(0, Math.floor(input.maxReviewRetries ?? 0))
  let overlappingReviewFailed = false
  let overlappingReviewFailure: unknown

  const predecessorForRetry = (page: Page): Artifact | undefined => {
    const pageIndex = input.pages.findIndex((candidate) => candidate.id === page.id)
    if (pageIndex <= 0) return undefined
    if (input.mode === 'serial') return results.get(input.pages[pageIndex - 1]!.id)
    return results.get(input.pages[0]!.id)
  }

  const reviewWithPageRetries = async (page: Page, initial: Artifact): Promise<void> => {
    const review = input.review
    if (!review) return
    let current = initial
    let attempt = 1
    for (;;) {
      input.onPageStage?.({ page, stage: 'reviewing', attempt })
      const reviewed = await reviewLimiter(() => review(current, attempt))
      if (reviewed.page.id !== page.id) {
        throw new Error(
          `Prototype reviewer returned page "${reviewed.page.id}" for planned page "${page.id}".`,
        )
      }
      results.set(page.id, reviewed)
      input.onProgress?.(ordered())
      const shouldRetry = input.shouldRetryReview?.(reviewed) ?? false
      const accepted = input.isReviewAccepted?.(reviewed) ?? !shouldRetry
      if (accepted) {
        input.onPageStage?.({ page, stage: 'accepted', attempt })
        return
      }
      input.onPageStage?.({ page, stage: 'rejected', attempt })
      if (!shouldRetry) return
      if (!input.retryAfterReview || attempt > reviewRetryBudget) return

      attempt += 1
      input.onPageStage?.({ page, stage: 'retrying', attempt })
      const replacement = await retryLimiter(() => {
        input.onPageStage?.({ page, stage: 'generating', attempt })
        return input.retryAfterReview!(
          page,
          predecessorForRetry(page),
          reviewed,
          attempt,
        )
      })
      if (replacement.page.id !== page.id) {
        throw new Error(
          `Prototype generator returned page "${replacement.page.id}" for planned page "${page.id}".`,
        )
      }
      current = replacement
      results.set(page.id, replacement)
      input.onProgress?.(ordered())
      input.onPageStage?.({ page, stage: 'generated', attempt })
    }
  }

  const queueOverlappingReview = (page: Page, artifact: Artifact): void => {
    pendingReviews.push(
      reviewWithPageRetries(page, artifact).catch((error: unknown) => {
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
    input.onPageStage?.({ page, stage: 'generated', attempt: 1 })
    if (input.review && reviewMode === 'inline') {
      await reviewWithPageRetries(page, artifact)
      return
    }
    results.set(page.id, artifact)
    input.onProgress?.(ordered())
    if (reviewMode === 'overlap') queueOverlappingReview(page, artifact)
  }

  const generateInitial = (
    page: Page,
    predecessor: Artifact | undefined,
  ): Promise<Artifact> => {
    input.onPageStage?.({ page, stage: 'generating', attempt: 1 })
    return input.generate(page, predecessor)
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
        const artifact = await generateInitial(page, predecessor)
        await publish(page, artifact)
        predecessor = artifact
      }
    } else {
      const anchorPage = input.pages[0]!
      let anchor = results.get(anchorPage.id)
      if (!anchor) {
        anchor = await generateInitial(anchorPage, undefined)
        await publish(anchorPage, anchor)
      }
      const missing = input.pages.slice(1).filter((page) => !results.has(page.id))
      await forEachConcurrent(missing, input.concurrency, async (page) => {
        const artifact = await generateInitial(page, anchor)
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
