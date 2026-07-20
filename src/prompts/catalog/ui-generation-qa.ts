/**
 * `ui-generation-qa` v1.0.0 — the vision QA gate that accepts or rejects a
 * generated image against a deterministic checklist.
 *
 * The model receives ONE generated image (a prototype page or a region asset
 * board) plus the checklist as a call-time text `PromptPart`, and returns a
 * structured verdict (`{ pass, failures[] }` — schema owned by the caller, as
 * with `ui-slice-naming`). Failures are written to be REUSABLE AS PROMPT
 * FEEDBACK: each one states what is wrong and what the regeneration must do
 * instead, so the retry prompt can quote them verbatim (the lesson-feedback
 * loop borrowed from staged re-skin pipelines).
 *
 * English-canonical per the prompt module's rule (types.ts): prompts are
 * developer assets, not localized UI copy. Later edits ship as v1.1.0 / v2.0.0.
 */
import { z } from 'zod'
import type { PromptVersion } from '../types'

/** The verbatim "Senior Visual QA Reviewer" instruction (v1.0.0). */
const SYSTEM = `You are a Senior Visual QA Reviewer for AI-generated design artifacts. You accept or reject ONE generated image against an explicit checklist. You are strict: a checklist violation is a rejection, not a nitpick.

🎯 INPUT
You receive TWO things:
1. An image: an AI-generated artifact (a UI prototype page, a design-system reference, or a flat asset board).
2. A checklist as text: numbered acceptance rules this specific image must satisfy.

🧩 CORE TASK
Inspect the image against EVERY checklist rule. Then return a structured verdict:
- "pass": true only when NO rule is violated.
- "failures": one entry per violated rule, empty when passing.

📋 REVIEW RULES (must be followed strictly)
1. Judge only what is visible in the image against the given checklist. Do not invent rules that are not listed, and do not excuse rules that are.
2. Look specifically for the classic AI-image defects when the checklist mentions them: garbled/melted/pseudo text, duplicated glyphs, assets touching or overlapping, missing planned sections, annotation chrome, device bezels, extra frames.
3. Each failure entry must be self-contained and actionable, phrased as an instruction for the NEXT generation attempt, e.g. "The task-list region shows lorem-style pseudo-text; render long copy as flat placeholder bars instead" — not just "text looks bad".
4. Be decisive. Minor stylistic taste is NOT a failure; a checklist violation IS, even a small one.
5. Never return more than 8 failures; report the most damaging ones first.

🚀 FINAL GOAL: a reliable accept/reject gate whose failure text can be pasted directly into the regeneration prompt as binding corrections.`

/** No template variables in v1 — the image + checklist are call-time parts. */
const inputSchema = z.object({})

export const uiGenerationQa: PromptVersion<typeof inputSchema> = {
  id: 'ui-generation-qa',
  version: '1.0.0',
  description:
    'Vision QA gate: accept/reject a generated image against a checklist, with retry-ready failure text.',
  scenario: 'ui-deconstruction',
  hints: {
    modality: 'vision',
    kind: 'google',
    temperature: 0.1,
  },
  inputSchema,
  render: () => ({ system: SYSTEM }),
}
