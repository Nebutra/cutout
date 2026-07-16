/**
 * AI-composed enhancement for demo.html. The deterministic compiler
 * (compiler.ts) always produces a valid demo.html so the specimen never
 * blocks on a model — this module only replaces it, and only when it can
 * produce something that actually reflects the product being designed
 * (its needs and declared components), not a generic dashboard template.
 */
import type { DesignDocument } from '@/design-ir'
import type { ModelAssignment } from '@/services/ai/model-assignment-types'
import type { GenerateInput, GenerationService } from '@/services/ai/types'
import { isErr } from '@/services/types'

export interface ComposeDemoHtmlInput {
  readonly document: DesignDocument
  /** The compiled tokens.css content — the only styling vocabulary the model may use. */
  readonly tokensCss: string
  readonly chat: ModelAssignment
  readonly generation: Pick<GenerationService, 'generateText'>
  readonly signal?: AbortSignal
}

export function composeDemoHtmlPrompt(document: DesignDocument, tokensCss: string): string {
  const needs = document.needs.map((need) => `- ${need.statement}`).join('\n')
    || '- (no explicit needs recorded — infer a plausible product from the title alone)'
  const components = document.components.map((component) =>
    `- ${component.name}${component.description ? `: ${component.description}` : ''}`,
  ).join('\n') || '- (no components declared yet)'

  return [
    `Compose a single self-contained demo.html for "${document.meta.title}".`,
    'This is a visual reference screen, not a working app: a realistic, on-brand mockup of what THIS specific product looks like, styled with the tokens below.',
    '',
    'Product needs:',
    needs,
    '',
    'Declared components:',
    components,
    '',
    'Design tokens (CSS custom properties — style exclusively via var(), invent nothing):',
    tokensCss,
    '',
    'Rules:',
    '1. Output exactly one complete `<!doctype html>` document and nothing else — no markdown code fences, no commentary before or after.',
    "2. Compose a screen that plausibly belongs to this product's actual domain (from the needs above) — not a generic admin dashboard unless the product genuinely is one.",
    '3. No external resources: no CDN links, no @font-face URLs, no remote images. Inline everything (SVG, inline CSS).',
    '4. Every button/link must be inert (`href="#"` or a no-op handler) — this is a static visual reference, never a functioning app.',
  ].join('\n')
}

/** Returns null (never throws) on any failure so the caller can fall back to the deterministic template. */
export async function composeDemoHtmlWithAgent(input: ComposeDemoHtmlInput): Promise<string | null> {
  const request: GenerateInput = {
    providerId: input.chat.providerId,
    model: input.chat.model,
    prompt: composeDemoHtmlPrompt(input.document, input.tokensCss),
    reasoningEffort: input.chat.effort,
    reasoningProtocol: input.chat.reasoningProtocol,
    signal: input.signal,
  }
  const result = await input.generation.generateText(request)
  if (isErr(result)) {
    console.info('[Cutout] AI demo.html composition fell back to the deterministic template:', result.error)
    return null
  }
  const html = stripCodeFence(result.data).trim()
  if (!/^<!doctype html>/i.test(html)) {
    console.info('[Cutout] AI demo.html composition returned non-HTML output; falling back to the deterministic template.')
    return null
  }
  return html
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim()
  const fenced = /^```(?:html)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)
  return (fenced?.[1] ?? trimmed).trim()
}
