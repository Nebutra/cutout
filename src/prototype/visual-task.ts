import type { ModelAssignment } from '@/services/ai/model-assignment-types'
import type { PaidToolPreferences } from '@/agent-runtime/paid-tool-preferences'
import type { PrototypePage, PrototypePlan } from './prototype-plan'
import type { VisualGenerationTask } from '@/visual-generation'
import { parseArtifactId } from '@/services/content-addressed-desktop-artifacts'

export function createPrototypePageVisualTask(input: { readonly runId: string; readonly plan: PrototypePlan; readonly page: PrototypePage; readonly image: ModelAssignment; readonly prompt: string; readonly referenceArtifactIds: readonly string[]; readonly preferences: PaidToolPreferences }): VisualGenerationTask {
  const references = input.referenceArtifactIds.map((artifactId, index) => {
    const sha256 = parseArtifactId(artifactId)
    if (!sha256) throw new Error('Prototype visual references must be content-addressed artifacts.')
    return { referenceId: `reference:${input.page.id}:${index}`, artifactId, sha256, mediaType: 'image/png' as const, role: index === 0 ? 'identity' as const : 'composition' as const, strength: 1, immutable: true as const, provenanceId: `provenance:${sha256}` }
  })
  return { version: 'visual-generation-task.v1', taskId: `prototype:${input.runId}:${input.page.id}`, catalogItemId: `prototype.page.${input.page.id}`, kind: 'ui-screen',
    prompt: { version: 'visual-prompt.v1', objective: input.prompt, subject: input.page.name, composition: input.page.regions.map((region) => `${region.name}: ${region.summary}`).join('; ') || input.page.purpose, artDirection: input.plan.designSystem.styleSummary, constraints: ['Preserve the approved design system and page intent.', 'Return a complete production-quality page without explanatory chrome.'], negativeConstraints: ['Do not return wireframes, annotations, or isolated fragments.'], output: { size: `${input.page.viewport.width}x${input.page.viewport.height}`, mediaType: 'image/png', transparent: false }, locale: 'en' },
    references, variants: { count: 1, parallelism: 1 }, consistency: { seriesId: `prototype:${input.plan.product.name}`, serial: input.plan.pages.findIndex((candidate) => candidate.id === input.page.id), lockedTraits: [input.plan.designSystem.styleSummary] }, routing: { preferredModel: input.image.model, requiredCapabilities: ['image-generate', 'image-edit'], allowCompatibleFallback: true }, refinement: { mode: 'full-frame', instruction: 'Refine the selected page while preserving layout, brand identity, and cross-page consistency.' }, budget: { ceiling: input.preferences.budgetCeiling, approvalPolicy: input.preferences.approvalPolicy, maxAttemptsPerNode: 2 }, publication: { intendedUse: 'raster-master', requiresHumanReview: false, requiresVectorization: false } }
}
