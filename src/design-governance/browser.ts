import { computedStyleFactSchema, nonColorCueEvidenceSchema, type GovernanceScenario, type NonColorCueEvidence } from './contracts'

type AxeImpact = 'minor'|'moderate'|'serious'|'critical'|null
interface AxeNode { readonly target: readonly (string | readonly string[])[] }
interface AxeViolation { readonly id: string; readonly impact: AxeImpact; readonly nodes?: readonly AxeNode[] }

export interface AxeAdapter { run(root: Document | Element): Promise<{ violations: readonly AxeViolation[] }> }
export type NonColorCueEvidenceByScenario = Readonly<Record<string, readonly NonColorCueEvidence[]>>

function resolvesInsideScenario(root: Document | Element, element: Element, target: string | readonly string[]): boolean {
  const selector = typeof target === 'string' ? target : target.at(-1)
  if (!selector) return false
  try {
    const targetElement = root.querySelector(selector)
    return Boolean(targetElement && (targetElement === element || element.contains(targetElement)))
  } catch {
    return false
  }
}

function violationsForScenario(root: Document | Element, element: Element, violations: readonly AxeViolation[]) {
  return violations.filter((violation) => violation.nodes?.some((node) => node.target.some((target) => resolvesInsideScenario(root, element, target))))
    .map(({ id, impact }) => ({ id, impact }))
}

export async function collectComputedStyleFacts(root: Document | Element, scenarios: readonly GovernanceScenario[], viewport: string, axe?: AxeAdapter, cueEvidence: NonColorCueEvidenceByScenario = {}) {
  const axeResult = axe ? await axe.run(root) : { violations: [] }
  return scenarios.map((scenario) => {
    const element = root.querySelector(scenario.selector); if (!(element instanceof HTMLElement)) throw new Error(`Governance selector did not resolve: ${scenario.selector}`)
    const style = getComputedStyle(element); const layers: string[] = []; let cursor: Element | null = element
    while (cursor) { const color = getComputedStyle(cursor).backgroundColor; layers.push(color); if (!/rgba\([^)]*,\s*1\)|rgb\(/.test(color)) cursor = cursor.parentElement; else break }
    const outlineWidth = Number.parseFloat(style.outlineWidth) || 0
    const relevantCueEvidence = (cueEvidence[scenario.scenarioId] ?? [])
      .map((evidence) => nonColorCueEvidenceSchema.parse(evidence))
      .filter((evidence) => evidence.state === scenario.state)
    return computedStyleFactSchema.parse({ scenarioId: scenario.scenarioId, viewport, foreground: style.color, backgroundLayers: layers, fontSizePx: Number.parseFloat(style.fontSize) || 0, fontWeight: Number.parseInt(style.fontWeight, 10) || 400, borderColor: style.borderColor, outlineColor: style.outlineColor, outlineWidthPx: outlineWidth, nonColorCueEvidence: relevantCueEvidence, axeViolations: violationsForScenario(root, element, axeResult.violations) })
  })
}
