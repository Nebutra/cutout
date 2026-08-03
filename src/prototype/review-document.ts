import { pagesForScope, type PrototypeSuiteScope } from './generate-suite'
import type { PrototypePage, PrototypePlan } from './prototype-plan'

/** Selects the model-authored artifact for the requested scope. Older plans
 * cross this compatibility boundary once and remain ordinary Markdown to UI. */
export function prototypeReviewMarkdown(
  plan: PrototypePlan,
  scope: PrototypeSuiteScope,
): string {
  const authored = scope === 'primary-flow'
    ? plan.reviewDocument?.primaryFlow
    : plan.reviewDocument?.fullPlan
  const base = authored?.trim() || legacyPrototypeReviewMarkdown(
    plan,
    pagesForScope(plan, scope),
  )
  const exploration = plan.designSystem.exploration
  if (!exploration) return base
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
    ...(exploration.estimate
      ? ['', `Estimated provider cost: ${exploration.estimate.amount} ${exploration.estimate.currency}.`]
      : []),
  ].join('\n')
}

function legacyPrototypeReviewMarkdown(
  plan: PrototypePlan,
  pages: readonly PrototypePage[],
): string {
  const pageSections = pages.flatMap((page) => [
    `## ${page.name}`,
    '',
    page.purpose,
    '',
    `\`${page.route}\` · ${page.viewport.platform} · ${page.viewport.width}x${page.viewport.height}`,
    '',
  ])
  return [
    `# ${plan.product.name}`,
    '',
    plan.product.summary,
    '',
    `> ${plan.product.primaryGoal}`,
    '',
    `_${plan.product.audience} · ${plan.product.platform}_`,
    '',
    ...pageSections,
    '---',
    '',
    plan.designSystem.styleSummary,
    '',
    plan.designSystem.typography,
    '',
    plan.designSystem.spacing,
    '',
    ...plan.designSystem.componentPrinciples.flatMap((principle) => [
      `- ${principle}`,
    ]),
    '',
    plan.designSystem.assetDirection,
    '',
  ].join('\n')
}
