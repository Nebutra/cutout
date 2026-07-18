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
  return authored?.trim() || legacyPrototypeReviewMarkdown(
    plan,
    pagesForScope(plan, scope),
  )
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
