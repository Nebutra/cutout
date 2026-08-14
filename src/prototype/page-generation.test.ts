import { describe, expect, it } from 'vitest'
import { generatePrototypePageSet } from './page-generation'

interface Page {
  readonly id: string
  readonly route: string
}

interface Artifact {
  readonly page: Page
  readonly bytes: Uint8Array
}

const pages: readonly Page[] = [
  { id: 'home', route: '/' },
  { id: 'catalog', route: '/catalog' },
  { id: 'account', route: '/account' },
  { id: 'settings', route: '/settings' },
]

function artifact(page: Page): Artifact {
  return { page, bytes: new TextEncoder().encode(page.id) }
}

describe('generatePrototypePageSet', () => {
  it('generates every route with one stable anchor and bounded concurrency', async () => {
    const predecessors = new Map<string, string | undefined>()
    const progress: string[][] = []
    let active = 0
    let maxActive = 0
    const result = await generatePrototypePageSet({
      pages,
      mode: 'anchor-parallel',
      concurrency: 2,
      async generate(page, predecessor) {
        predecessors.set(page.id, predecessor?.page.id)
        active += 1
        maxActive = Math.max(maxActive, active)
        await Promise.resolve()
        active -= 1
        return artifact(page)
      },
      onProgress: (artifacts) => progress.push(artifacts.map((item) => item.page.id)),
    })

    expect(result.map((item) => item.page.id)).toEqual(pages.map((page) => page.id))
    expect(predecessors).toEqual(new Map([
      ['home', undefined],
      ['catalog', 'home'],
      ['account', 'home'],
      ['settings', 'home'],
    ]))
    expect(maxActive).toBe(2)
    expect(progress[0]).toEqual(['home'])
    expect(progress.at(-1)).toEqual(['home', 'catalog', 'account', 'settings'])
  })

  it('emits generating before every initial Provider call and later settlement stage', async () => {
    const stages = new Map<string, string[]>()
    const record = (pageId: string, value: string) => {
      const pageStages = stages.get(pageId) ?? []
      pageStages.push(value)
      stages.set(pageId, pageStages)
    }

    await generatePrototypePageSet({
      pages: pages.slice(0, 3),
      mode: 'anchor-parallel',
      concurrency: 2,
      async generate(page) {
        expect(stages.get(page.id)?.at(-1)).toBe('generating:1')
        record(page.id, 'provider-call:1')
        return artifact(page)
      },
      review: async (value) => value,
      onPageStage: ({ page, stage, attempt }) => record(page.id, `${stage}:${attempt}`),
    })

    for (const page of pages.slice(0, 3)) {
      expect(stages.get(page.id)).toEqual([
        'generating:1',
        'provider-call:1',
        'generated:1',
        'reviewing:1',
        'accepted:1',
      ])
    }
  })

  it('exposes active generation while the Provider call remains unsettled', async () => {
    let settleProvider!: (value: Artifact) => void
    const provider = new Promise<Artifact>((resolve) => {
      settleProvider = resolve
    })
    const stages: string[] = []
    const published: string[][] = []
    let settled = false

    const pending = generatePrototypePageSet({
      pages: pages.slice(0, 1),
      mode: 'anchor-parallel',
      concurrency: 1,
      generate: () => provider,
      onPageStage: ({ stage, attempt }) => stages.push(`${stage}:${attempt}`),
      onProgress: (artifacts) => published.push(artifacts.map(({ page }) => page.id)),
    })
    void pending.then(() => { settled = true })

    await vi.waitFor(() => expect(stages).toEqual(['generating:1']))
    expect(published).toEqual([])
    expect(settled).toBe(false)

    settleProvider(artifact(pages[0]!))
    await expect(pending).resolves.toHaveLength(1)
  })

  it('uses the preceding planned page in serial mode', async () => {
    const predecessors: Array<string | undefined> = []
    await generatePrototypePageSet({
      pages: pages.slice(0, 3),
      mode: 'serial',
      concurrency: 2,
      async generate(page, predecessor) {
        predecessors.push(predecessor?.page.id)
        return artifact(page)
      },
    })
    expect(predecessors).toEqual([undefined, 'home', 'catalog'])
  })

  it('reuses an existing first route as the visual anchor', async () => {
    const generated: string[] = []
    const result = await generatePrototypePageSet({
      pages,
      existingArtifacts: [artifact(pages[0]!)],
      mode: 'anchor-parallel',
      concurrency: 2,
      async generate(page, predecessor) {
        expect(predecessor?.page.id).toBe('home')
        generated.push(page.id)
        return artifact(page)
      },
    })
    expect(generated).toEqual(['catalog', 'account', 'settings'])
    expect(result).toHaveLength(4)
  })

  it('overlaps bounded review with later image generation', async () => {
    let releaseAnchorReview!: () => void
    const anchorReview = new Promise<void>((resolve) => {
      releaseAnchorReview = resolve
    })
    let releaseLaterImages!: () => void
    const laterImages = new Promise<void>((resolve) => {
      releaseLaterImages = resolve
    })
    const generated: string[] = []
    let activeImages = 0
    let maximumImages = 0
    let activeReviews = 0
    let maximumReviews = 0

    const pending = generatePrototypePageSet({
      pages,
      mode: 'anchor-parallel',
      concurrency: 2,
      reviewMode: 'overlap',
      reviewConcurrency: 1,
      async generate(page) {
        generated.push(page.id)
        activeImages += 1
        maximumImages = Math.max(maximumImages, activeImages)
        if (page.id !== 'home') await laterImages
        activeImages -= 1
        return artifact(page)
      },
      async review(value) {
        activeReviews += 1
        maximumReviews = Math.max(maximumReviews, activeReviews)
        if (value.page.id === 'home') await anchorReview
        activeReviews -= 1
        return value
      },
    })

    await vi.waitFor(() => {
      expect(generated).toEqual(['home', 'catalog', 'account'])
      expect(activeReviews).toBe(1)
      expect(activeImages).toBe(2)
    })
    expect(maximumImages).toBe(2)
    expect(maximumReviews).toBe(1)

    releaseLaterImages()
    releaseAnchorReview()
    await expect(pending).resolves.toHaveLength(4)
    expect(maximumImages).toBe(2)
    expect(maximumReviews).toBe(1)
  })

  it('keeps review inline when generation and review share a provider lane', async () => {
    let releaseAnchorReview!: () => void
    const anchorReview = new Promise<void>((resolve) => {
      releaseAnchorReview = resolve
    })
    const generated: string[] = []
    const progress: string[][] = []

    const pending = generatePrototypePageSet({
      pages: pages.slice(0, 3),
      mode: 'anchor-parallel',
      concurrency: 2,
      reviewMode: 'inline',
      reviewConcurrency: 2,
      async generate(page) {
        generated.push(page.id)
        return artifact(page)
      },
      async review(value) {
        if (value.page.id === 'home') await anchorReview
        return value
      },
      onProgress: (artifacts) => progress.push(artifacts.map((value) => value.page.id)),
    })

    await vi.waitFor(() => expect(generated).toEqual(['home']))
    expect(progress).toEqual([])
    releaseAnchorReview()
    await expect(pending).resolves.toHaveLength(3)
    expect(generated).toEqual(['home', 'catalog', 'account'])
    expect(progress[0]).toEqual(['home'])
  })

  it('waits for the final overlapping review before completing', async () => {
    let releaseFinalReview!: () => void
    const finalReview = new Promise<void>((resolve) => {
      releaseFinalReview = resolve
    })
    let reviewed = 0
    let settled = false

    const pending = generatePrototypePageSet({
      pages: pages.slice(0, 2),
      mode: 'anchor-parallel',
      concurrency: 2,
      reviewMode: 'overlap',
      reviewConcurrency: 2,
      generate: async (page) => artifact(page),
      async review(value) {
        reviewed += 1
        if (value.page.id === 'catalog') await finalReview
        return value
      },
    })
    void pending.then(() => {
      settled = true
    })

    await vi.waitFor(() => expect(reviewed).toBe(2))
    expect(settled).toBe(false)
    releaseFinalReview()
    await expect(pending).resolves.toHaveLength(2)
    expect(settled).toBe(true)
  })

  it('does not review reused artifacts again', async () => {
    const reviewed: string[] = []
    await generatePrototypePageSet({
      pages: pages.slice(0, 2),
      existingArtifacts: [artifact(pages[0]!)],
      mode: 'anchor-parallel',
      concurrency: 2,
      reviewMode: 'overlap',
      reviewConcurrency: 2,
      generate: async (page) => artifact(page),
      review: async (value) => {
        reviewed.push(value.page.id)
        return value
      },
    })
    expect(reviewed).toEqual(['catalog'])
  })

  it('joins started reviews before propagating a later image failure', async () => {
    let releaseAnchorReview!: () => void
    const anchorReview = new Promise<void>((resolve) => {
      releaseAnchorReview = resolve
    })
    let settled = false

    const pending = generatePrototypePageSet({
      pages: pages.slice(0, 2),
      mode: 'anchor-parallel',
      concurrency: 1,
      reviewMode: 'overlap',
      reviewConcurrency: 1,
      async generate(page) {
        if (page.id === 'catalog') throw new Error('image failed')
        return artifact(page)
      },
      review: async (value) => {
        await anchorReview
        return value
      },
    })
    void pending.then(
      () => { settled = true },
      () => { settled = true },
    )

    await Promise.resolve()
    await Promise.resolve()
    expect(settled).toBe(false)
    releaseAnchorReview()
    await expect(pending).rejects.toThrow('image failed')
    expect(settled).toBe(true)
  })

  it('drains queued reviews before propagating the first overlapping review failure', async () => {
    let releaseAnchorReview!: () => void
    const anchorReview = new Promise<void>((resolve) => {
      releaseAnchorReview = resolve
    })
    let releaseFinalReview!: () => void
    const finalReview = new Promise<void>((resolve) => {
      releaseFinalReview = resolve
    })
    const reviewed: string[] = []
    let settled = false

    const pending = generatePrototypePageSet({
      pages: pages.slice(0, 3),
      mode: 'anchor-parallel',
      concurrency: 2,
      reviewMode: 'overlap',
      reviewConcurrency: 1,
      generate: async (page) => artifact(page),
      async review(value) {
        reviewed.push(value.page.id)
        if (value.page.id === 'home') {
          await anchorReview
          throw new Error('review failed')
        }
        if (value.page.id === 'account') await finalReview
        return value
      },
    })
    void pending.then(
      () => { settled = true },
      () => { settled = true },
    )

    await vi.waitFor(() => expect(reviewed).toEqual(['home']))
    releaseAnchorReview()
    await vi.waitFor(() => expect(reviewed).toEqual(['home', 'catalog', 'account']))
    expect(settled).toBe(false)
    releaseFinalReview()
    await expect(pending).rejects.toThrow('review failed')
    expect(settled).toBe(true)
  })

  it('fails closed when a generator returns the wrong route identity', async () => {
    await expect(generatePrototypePageSet({
      pages: pages.slice(0, 2),
      mode: 'anchor-parallel',
      concurrency: 2,
      generate: async () => artifact(pages[1]!),
    })).rejects.toThrow('returned page "catalog" for planned page "home"')
  })

  it('returns and republishes transformed overlapping review artifacts', async () => {
    const progress: Array<Array<{ id: string; reviewed: boolean }>> = []
    const result = await generatePrototypePageSet({
      pages: pages.slice(0, 2),
      mode: 'anchor-parallel',
      concurrency: 2,
      reviewMode: 'overlap',
      generate: async (page) => ({ ...artifact(page), reviewed: false }),
      review: async (value) => ({ ...value, reviewed: true }),
      onProgress: (artifacts) => progress.push(artifacts.map((value) => ({
        id: value.page.id,
        reviewed: value.reviewed,
      }))),
    })

    expect(result.every((value) => value.reviewed)).toBe(true)
    expect(progress.some((items) => items.some((item) => !item.reviewed))).toBe(true)
    expect(progress.at(-1)?.every((item) => item.reviewed)).toBe(true)
  })

  it('rerolls only rejected pages with review feedback and a bounded attempt', async () => {
    type ReviewedArtifact = Artifact & {
      readonly review?: { readonly pass: boolean; readonly failures: readonly string[] }
      readonly attempt: number
    }
    const retries: Array<{
      readonly page: string
      readonly predecessor: string | undefined
      readonly rejectedAttempt: number
      readonly attempt: number
    }> = []
    const stages: string[] = []
    const reviewedAttempts: number[] = []
    const result = await generatePrototypePageSet<Page, ReviewedArtifact>({
      pages: pages.slice(0, 3),
      mode: 'anchor-parallel',
      concurrency: 2,
      reviewMode: 'overlap',
      maxReviewRetries: 1,
      generate: async (page) => ({ ...artifact(page), attempt: 1 }),
      review: async (value, attempt) => {
        if (value.page.id === 'catalog') reviewedAttempts.push(attempt)
        return {
          ...value,
          review: {
            pass: value.page.id !== 'catalog' || value.attempt > 1,
            failures: value.attempt > 1 ? [] : ['missing product rail'],
          },
        }
      },
      isReviewAccepted: (value) => value.review?.pass === true,
      shouldRetryReview: (value) => value.review?.pass === false,
      retryAfterReview: async (page, predecessor, rejected, attempt) => {
        retries.push({
          page: page.id,
          predecessor: predecessor?.page.id,
          rejectedAttempt: rejected.attempt,
          attempt,
        })
        return { ...artifact(page), attempt }
      },
      onPageStage: ({ page, stage, attempt }) => {
        stages.push(`${page.id}:${stage}:${attempt}`)
      },
    })

    expect(retries).toEqual([{
      page: 'catalog',
      predecessor: 'home',
      rejectedAttempt: 1,
      attempt: 2,
    }])
    expect(result.find((value) => value.page.id === 'catalog')).toMatchObject({
      attempt: 2,
      review: { pass: true },
    })
    expect(stages).toContain('catalog:rejected:1')
    expect(stages).toContain('catalog:retrying:2')
    expect(stages).toContain('catalog:accepted:2')
    expect(stages.filter((stage) => stage.startsWith('catalog:'))).toEqual([
      'catalog:generating:1',
      'catalog:generated:1',
      'catalog:reviewing:1',
      'catalog:rejected:1',
      'catalog:retrying:2',
      'catalog:generating:2',
      'catalog:generated:2',
      'catalog:reviewing:2',
      'catalog:accepted:2',
    ])
    expect(reviewedAttempts).toEqual([1, 2])
  })

  it('reports unavailable review as rejected without spending an image retry', async () => {
    type ReviewedArtifact = Artifact & {
      readonly review?: { readonly pass: boolean; readonly unavailable?: boolean }
    }
    let retries = 0
    const stages: string[] = []
    const result = await generatePrototypePageSet<Page, ReviewedArtifact>({
      pages: pages.slice(0, 1),
      mode: 'anchor-parallel',
      concurrency: 1,
      reviewMode: 'overlap',
      maxReviewRetries: 1,
      generate: async (page) => artifact(page),
      review: async (value) => ({
        ...value,
        review: { pass: false, unavailable: true },
      }),
      isReviewAccepted: (value) => value.review?.pass === true,
      shouldRetryReview: (value) =>
        value.review?.pass === false && value.review.unavailable !== true,
      retryAfterReview: async (page) => {
        retries += 1
        return artifact(page)
      },
      onPageStage: ({ stage }) => stages.push(stage),
    })

    expect(retries).toBe(0)
    expect(result[0]?.review).toEqual({ pass: false, unavailable: true })
    expect(stages.at(-1)).toBe('rejected')
  })

})
