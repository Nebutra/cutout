/**
 * Vision QA gate — accept/reject generated images with lesson feedback.
 *
 * Checklist builders are deterministic functions of the plan, the review is
 * one injected structured-output vision call, and `generateWithQa` retains the
 * verdict as observational evidence. Provider retries default to zero; a caller
 * must explicitly authorize a bounded later attempt.
 */
import { z } from 'zod'
import type { PromptPart } from '@/prompts/types'
import type { GenerationService } from '@/services/ai/types'
import type { ReasoningEffort } from '@/services/ai/reasoning'
import { isErr } from '@/services/types'
import { sanitize } from '@/agent-runtime/tool-durability'
import { createMonotonicDeadline } from '@/platform/monotonic-deadline'
import type { PrototypePage, PrototypePlan, PrototypeRegion } from './prototype-plan'

const QA_FAILURE_LIMIT = 8
const QA_FAILURE_TEXT_LIMIT = 500
export const PROTOTYPE_QA_REVIEW_TIMEOUT_MS = 180_000

/** Structured-output contract for the `ui-generation-qa` vision call. */
export const qaVerdictSchema = z.object({
  pass: z.boolean(),
  failures: z.array(z.string().min(1).max(2_000)).max(QA_FAILURE_LIMIT),
})

export interface QaVerdict {
  readonly pass: boolean
  /** Retry-ready corrections, phrased as instructions for the next attempt. */
  readonly failures: readonly string[]
  /** The reviewer could not produce a verdict. This remains an observational rejection. */
  readonly unavailable?: boolean
}

/** Keep model-authored QA lessons safe and bounded before prompt, event, or receipt use. */
export function sanitizeQaFailures(failures: readonly string[]): string[] {
  return failures
    .slice(0, QA_FAILURE_LIMIT)
    .map((failure) => [...sanitize(failure)]
      .map((character) => {
        const code = character.charCodeAt(0)
        return code < 32 || code === 127 ? ' ' : character
      })
      .join('')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, QA_FAILURE_TEXT_LIMIT))
    .filter(Boolean)
}

/** Deterministic acceptance rules for one generated prototype page. */
export function buildPageChecklist(plan: PrototypePlan, page: PrototypePage): string[] {
  const regionRules = page.regions.map(
    (region, index) =>
      `${index + 1}. The "${region.name}" region (${region.role}) is present exactly once: ${region.summary}`,
  )
  const next = regionRules.length
  return [
    ...regionRules,
    `${next + 1}. Exactly one screen is rendered: no adjacent frames, no device bezel, no annotations, no measurement lines, no asset sheet, no design-tool chrome.`,
    `${next + 2}. No garbled, melted, duplicated, or lorem/pseudo text anywhere; long copy appears as clean placeholder bars, and any real labels are short and crisply legible.`,
    `${next + 3}. The page uses one coherent visual system consistent with a ${plan.designSystem.styleSummary} direction (palette: ${plan.designSystem.palette.join(', ')}).`,
    `${next + 4}. No extra invented sections beyond the listed regions, and no region is duplicated.`,
  ]
}

/** Deterministic acceptance rules for one region's flat asset board. */
export function buildBoardChecklist(page: PrototypePage, region: PrototypeRegion): string[] {
  const assets = region.assetOpportunities
  const ownership = assets
    .map((asset, index) => `${index + 1}="${asset}"`)
    .join('; ')
  return [
    `1. The board contains exactly ${assets.length} independently reusable assets for the "${region.name}" region of the "${page.name}" page, one for each declared item in reading order: ${ownership}.`,
    `2. The background is a single flat pure-white canvas that flows continuously between all assets; nothing bleeds to or touches the canvas edge.`,
    `3. Every declared item occupies exactly one cell as one complete asset. No cell contains a collage, contact sheet, grid, adjacent variants, nested cards, or multiple unrelated subjects.`,
    `4. No two assets touch, overlap, connect, or share a bounding box; every asset has clear white margin on all four sides.`,
    `5. UI presentation masks are absent: no rounded card corners, circular avatar crop, frame, border, container shadow, or clipped photo. Photo-like media must show its complete rectangular source content.`,
    `6. No text is baked into any asset: no labels, headings, numerals, UI copy, or isolated glyphs.`,
    `7. Every white or very light asset has a visible closed non-white contour or internal contrast separating it from the canvas.`,
  ]
}

/** Append rejected-attempt lessons to a base prompt as binding corrections. */
export function qaRetryPrompt(basePrompt: string, failures: readonly string[]): string {
  const safeFailures = sanitizeQaFailures(failures)
  if (safeFailures.length === 0) return basePrompt
  return [
    basePrompt,
    '',
    'The previous attempt was REJECTED by visual QA. You MUST fix every one of these problems this time:',
    ...safeFailures.map((failure, index) => `${index + 1}. ${failure}`),
  ].join('\n')
}

/** The model slot used for review (the Settings chat/vision assignment). */
export interface QaReviewSlot {
  readonly providerId: string
  readonly model: string
  readonly effort?: ReasoningEffort
}

/**
 * One structured-output vision review of a generated image against a
 * checklist. A transport/model failure is returned as an unavailable rejection
 * so callers can persist a warning without discarding generated bytes.
 */
export async function reviewGeneratedImage(
  generation: Pick<GenerationService, 'generateObject'>,
  slot: QaReviewSlot,
  imageBytes: Uint8Array,
  checklist: readonly string[],
  signal?: AbortSignal,
  onReviewError?: (message: string) => void,
): Promise<QaVerdict> {
  const unavailableVerdict = (message: string): QaVerdict => {
    onReviewError?.(message)
    return {
      pass: false,
      failures: sanitizeQaFailures([`Visual QA unavailable: ${message}`]),
      unavailable: true,
    }
  }
  const parts: PromptPart[] = [
    { type: 'image', image: imageBytes },
    { type: 'text', text: `Checklist:\n${checklist.join('\n')}` },
  ]
  const controller = new AbortController()
  let settleInterruption: (reason: 'parent' | 'timeout') => void = () => {}
  const interruption = new Promise<'parent' | 'timeout'>((resolve) => {
    settleInterruption = resolve
  })
  const abortFromParent = () => {
    settleInterruption('parent')
    controller.abort()
  }
  if (signal?.aborted) abortFromParent()
  else signal?.addEventListener('abort', abortFromParent, { once: true })
  const deadline = createMonotonicDeadline(PROTOTYPE_QA_REVIEW_TIMEOUT_MS)
  void deadline.elapsed.then((elapsed) => {
    if (!elapsed) return
    settleInterruption('timeout')
    controller.abort()
  })
  const settled = await Promise.race([
    Promise.resolve().then(() => generation.generateObject(
      {
        providerId: slot.providerId,
        model: slot.model,
        promptRef: { id: 'ui-generation-qa' },
        input: parts,
        reasoningEffort: slot.effort,
        signal: controller.signal,
      },
      qaVerdictSchema,
    )).then(
      (result) => ({ kind: 'result' as const, result }),
      (error: unknown) => ({ kind: 'error' as const, error }),
    ),
    interruption.then((reason) => ({ kind: 'interrupted' as const, reason })),
  ]).finally(() => {
    deadline.cancel()
    signal?.removeEventListener('abort', abortFromParent)
  })
  if (settled.kind === 'interrupted') {
    return unavailableVerdict(
      settled.reason === 'timeout'
        ? 'review deadline exceeded'
        : 'AbortError: operation aborted',
    )
  }
  if (settled.kind === 'error') {
    return unavailableVerdict(
      settled.error instanceof Error ? settled.error.message : String(settled.error),
    )
  }
  const result = settled.result
  if (isErr(result)) {
    return unavailableVerdict(result.error)
  }
  // A pass with leftover failure text (or vice versa) is normalized to the
  // stricter reading: any reported failure means rejection.
  const failures = sanitizeQaFailures(result.data.failures)
  return { pass: result.data.pass && failures.length === 0, failures }
}

export interface GenerateWithQaParams {
  readonly basePrompt: string
  /** Generation attempt: prompt in, image bytes out (throws on failure). */
  readonly generate: (prompt: string, signal?: AbortSignal) => Promise<Uint8Array>
  /** Review attempt: image in, verdict out. */
  readonly review: (bytes: Uint8Array, signal?: AbortSignal) => Promise<QaVerdict>
  /** Explicit extra Provider attempts after the first attempt. Default 0, clamp >= 0. */
  readonly maxRetries?: number
  /** Observability: called once per attempt with its verdict. */
  readonly onVerdict?: (attempt: number, verdict: QaVerdict) => void
  readonly signal?: AbortSignal
}

export interface GenerateWithQaResult {
  readonly bytes: Uint8Array
  /** Verdict of the LAST attempt; `pass: false` means it shipped rejected. */
  readonly verdict: QaVerdict
  readonly attempts: number
}

/**
 * Bounded reject/re-roll loop: generate → review → on rejection, regenerate
 * with the failures appended as corrections. Returns the first passing
 * attempt, or the final attempt (verdict attached) once the budget is spent.
 */
export async function generateWithQa(
  params: GenerateWithQaParams,
): Promise<GenerateWithQaResult> {
  const budget = Math.max(0, params.maxRetries ?? 0)
  let prompt = params.basePrompt
  let attempt = 0
  for (;;) {
    params.signal?.throwIfAborted()
    attempt += 1
    const bytes = await params.generate(prompt, params.signal)
    const verdict = await params.review(bytes, params.signal)
    params.onVerdict?.(attempt, verdict)
    if (verdict.pass || verdict.unavailable || attempt > budget) {
      return { bytes, verdict, attempts: attempt }
    }
    prompt = qaRetryPrompt(params.basePrompt, verdict.failures)
  }
}
