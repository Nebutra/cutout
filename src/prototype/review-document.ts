import type { PrototypeSuiteScope } from './generate-suite'
import type { PrototypePlan } from './prototype-plan'

/** Selects the model-authored artifact for the requested scope. */
export function prototypeReviewMarkdown(
  plan: PrototypePlan,
  scope: PrototypeSuiteScope,
): string {
  const base = scope === 'primary-flow'
    ? plan.reviewDocument.primaryFlow.trim()
    : plan.reviewDocument.fullPlan.trim()
  const exploration = plan.designSystem.exploration
  return [
    base,
    '',
    '## Design System directions',
    '',
    `**${exploration.count} direction${exploration.count === 1 ? '' : 's'}** · ${exploration.mode} · ${exploration.decidedBy}`,
    '',
    exploration.rationale,
    '',
    ...exploration.directions.flatMap((direction) => [
      `### ${direction.label}`,
      '',
      direction.thesis,
      '',
      `Varies: ${direction.vary.join(', ')}.`,
      '',
      `Preserves: ${direction.preserve.join(', ')}.`,
      '',
    ]),
    `Runtime bounds: up to ${exploration.bounds.maxCandidates} candidates, ${exploration.bounds.maxParallelism} concurrent.`,
  ].join('\n')
}
