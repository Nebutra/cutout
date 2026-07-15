import { computedStyleFactSchema, type GovernanceScenario } from './contracts'

export interface AxeAdapter { run(root: Element): Promise<{ violations: Array<{ id: string; impact: 'minor'|'moderate'|'serious'|'critical'|null }> }> }
export async function collectComputedStyleFacts(root: ParentNode, scenarios: readonly GovernanceScenario[], viewport: string, axe?: AxeAdapter) {
  const axeResult = axe && root instanceof Element ? await axe.run(root) : { violations: [] }
  return scenarios.map((scenario) => {
    const element = root.querySelector(scenario.selector); if (!(element instanceof HTMLElement)) throw new Error(`Governance selector did not resolve: ${scenario.selector}`)
    const style = getComputedStyle(element); const layers: string[] = []; let cursor: Element | null = element
    while (cursor) { const color = getComputedStyle(cursor).backgroundColor; layers.push(color); if (!/rgba\([^)]*,\s*1\)|rgb\(/.test(color)) cursor = cursor.parentElement; else break }
    const outlineWidth = Number.parseFloat(style.outlineWidth) || 0
    return computedStyleFactSchema.parse({ scenarioId: scenario.scenarioId, viewport, foreground: style.color, backgroundLayers: layers, fontSizePx: Number.parseFloat(style.fontSize) || 0, fontWeight: Number.parseInt(style.fontWeight, 10) || 400, borderColor: style.borderColor, outlineColor: style.outlineColor, outlineWidthPx: outlineWidth, nonColorCue: Boolean(element.getAttribute('aria-label') || element.querySelector('svg, img') || element.textContent?.trim()), axeViolations: axeResult.violations })
  })
}
