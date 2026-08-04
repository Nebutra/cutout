/**
 * Model assignment (design spec §5a) — which model serves each output modality.
 *
 * `ModelAssignment` is the atomic value persisted inside current capability
 * bindings. `ModelAssignments` is only the derived two-slot view still consumed
 * by primary chat/image runtime surfaces; it is not a persistence schema.
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
}).strict()
