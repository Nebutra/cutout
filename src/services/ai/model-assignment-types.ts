/**
 * Model assignment (design spec §5a) — which model serves each output modality.
 *
 * Two slots, bucketed by output modality: `chat` (text + reasoning + vision, one
 * multimodal model) and `image` (image generation). This is the concrete landing
 * table for prompt-management's `modality → (providerId, model)` resolution:
 * `text`/`vision` prompts resolve to `chat`, `image-generation` to `image`.
 *
 * Non-secret; persisted via `@tauri-apps/plugin-store` (see `model-assignment.local`).
 */
import { z } from 'zod'
import type { ReasoningEffort } from './reasoning'

/** The two assignable slots, keyed by output modality. */
export type SlotId = 'chat' | 'image'

/** A resolved model choice: which provider connection + which model slug. */
export interface ModelAssignment {
  readonly providerId: string
  readonly model: string
  readonly fallbackModel?: string
  /**
   * Thinking strength for the chat slot (`undefined` = the model's own default).
   * Ignored for the image slot. See {@link ReasoningEffort}.
   */
  readonly effort?: ReasoningEffort
  /** Verified wire protocol for per-call reasoning controls. */
  readonly reasoningProtocol?: 'openai' | 'anthropic' | 'google'
}

/** The full assignment table (either slot may be unset). */
export interface ModelAssignments {
  readonly chat?: ModelAssignment
  readonly image?: ModelAssignment
}

export const modelAssignmentSchema = z.object({
  providerId: z.string().min(1),
  model: z.string().min(1),
  fallbackModel: z.string().min(1).optional(),
  effort: z.enum(['low', 'medium', 'high']).optional(),
  reasoningProtocol: z.enum(['openai', 'anthropic', 'google']).optional(),
})

/** Boundary schema for the persisted blob — a bad/absent value degrades to `{}`. */
export const modelAssignmentsSchema = z.object({
  chat: modelAssignmentSchema.optional(),
  image: modelAssignmentSchema.optional(),
})
