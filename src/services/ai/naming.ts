/**
 * Vision slice-naming (spec §8) — turn cut slices into semantic filenames.
 *
 * Sends the asset-board image + each slice's bounding box to the Settings
 * **chat** (understanding) vision model through
 * `GenerationService.generateObject`, which rides the AI SDK `generateText` +
 * `Output.object` structured-output path. The zod schema below (`{ names: {
 * index, name }[] }`) is the contract; the caller (a mutation hook) maps the
 * returned names back onto slices via `store.renameSlice`.
 *
 * Pure across the service seam: it never throws — it returns a `Result` and the
 * hook decides how to surface failures. Naming is OPTIONAL (fallback = the
 * existing numbered names), so callers gate on a chat model being assigned.
 */
import { z } from 'zod'
import type { Box } from '@/algorithm/types'
import type { PromptPart } from '@/prompts/types'
import type { Result } from '@/services/types'
import { err, isErr, ok } from '@/services/types'
import type { GenerationService } from './types'
import type { ReasoningEffort } from './reasoning'

/** One slice's identity for naming: which index, framed by which box. */
export interface SliceBox {
  readonly index: number
  readonly box: Box
}

/** A resolved name for one slice index (kebab-case, no extension). */
export interface SliceName {
  readonly index: number
  readonly name: string
}

/** Structured-output contract for the vision model (spec §8). */
export const sliceNamesSchema = z.object({
  names: z
    .array(
      z.object({
        index: z.number().int(),
        name: z.string().min(1),
      }),
    )
    .default([]),
})

/** Inputs the caller resolves (model slot + board image + boxes). */
export interface NameSlicesParams {
  readonly providerId: string
  readonly model: string
  /** PNG bytes of the asset board (the cutout source image). */
  readonly imageBytes: Uint8Array
  /** Every slice to name, as index + bounding box. */
  readonly slices: readonly SliceBox[]
  /**
   * Optional semantic grounding (the per-region breakdown supplies the plan
   * region's name/role/summary/asset types) — primes the vision model so names
   * are on-domain and consistent instead of cold-guessed.
   */
  readonly context?: string
  /** Thinking strength for the chat model (from its Settings assignment). */
  readonly effort?: ReasoningEffort
  readonly signal?: AbortSignal
}

/**
 * Ask the vision model to name each slice. Returns one {@link SliceName} per
 * index it answered for; unknown/extra indices are dropped by the caller.
 */
export async function nameSlices(
  generation: GenerationService,
  params: NameSlicesParams,
): Promise<Result<readonly SliceName[]>> {
  if (params.slices.length === 0) return ok([])

  // The boxes travel as a compact JSON text part beside the board image.
  const boxesJson = JSON.stringify(
    params.slices.map((s) => ({
      index: s.index,
      x: s.box.x,
      y: s.box.y,
      width: s.box.width,
      height: s.box.height,
    })),
  )
  const parts: PromptPart[] = [
    { type: 'image', image: params.imageBytes },
    ...(params.context
      ? [{ type: 'text' as const, text: `Context for these assets:\n${params.context}` }]
      : []),
    { type: 'text', text: `Slice bounding boxes (JSON):\n${boxesJson}` },
  ]

  const result = await generation.generateObject(
    {
      providerId: params.providerId,
      model: params.model,
      promptRef: { id: 'ui-slice-naming' },
      input: parts,
      reasoningEffort: params.effort,
      signal: params.signal,
    },
    sliceNamesSchema,
  )
  if (isErr(result)) return result

  const requested = new Set(params.slices.map((s) => s.index))
  const seen = new Set<number>()
  const names: SliceName[] = []
  for (const entry of result.data.names) {
    if (!requested.has(entry.index) || seen.has(entry.index)) continue
    seen.add(entry.index)
    names.push({ index: entry.index, name: entry.name })
  }
  if (names.length === 0) return err('The model returned no usable names.')
  return ok(names)
}
