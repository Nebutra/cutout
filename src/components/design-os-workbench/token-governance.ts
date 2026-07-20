/**
 * Live in-app governance data source for the Design OS workbench.
 *
 * Prototype pages are generated IMAGES (no rendered DOM to run axe against), so
 * the DOM-based `inspectWebViewGovernance` path can't produce a receipt for
 * them. But the design system carries real color TOKENS with concrete values,
 * and WCAG text contrast is computable directly from those values — no DOM
 * needed. This derives a real `GovernanceReceipt` (text-contrast findings for
 * each foreground token over the design's background) so `model.governance`
 * finally has live data and the "Request repair" UI becomes reachable.
 *
 * Reuses design-governance's public `evaluateGovernance` / `parseColor`; it
 * does not modify any `src/design-governance/` file.
 */
import {
  evaluateGovernance,
  parseColor,
  type ComputedStyleFact,
  type GovernanceReceipt,
  type GovernanceScenario,
} from '@/design-governance'
import type { DesignToken } from '@/design-ir'

interface ColorToken {
  readonly id: string
  readonly name: string
  readonly value: string
}

/** Color tokens whose value parses as a CSS color (skip unparseable/non-color). */
function colorTokens(tokens: readonly DesignToken[]): ColorToken[] {
  const out: ColorToken[] = []
  for (const token of tokens) {
    if (token.kind !== 'color') continue
    const value = typeof token.value === 'string' ? token.value : ''
    if (!value) continue
    try {
      parseColor(value)
    } catch {
      continue
    }
    out.push({ id: token.id, name: token.name, value })
  }
  return out
}

/** Heuristic: the background token is the first named background/surface, else the first color. */
function pickBackground(colors: readonly ColorToken[]): ColorToken | undefined {
  const named = colors.find((c) => /background|surface|canvas|\bbg\b|base|paper/i.test(c.name))
  return named ?? colors[0]
}

export interface TokenGovernance {
  readonly receipt: GovernanceReceipt
  readonly scenarios: readonly GovernanceScenario[]
}

/**
 * Build a text-contrast governance receipt from the design's color tokens.
 * Returns undefined when there aren't at least two usable colors to pair.
 */
export function buildTokenContrastGovernance(
  tokens: readonly DesignToken[],
  now = 0,
): TokenGovernance | undefined {
  const colors = colorTokens(tokens)
  if (colors.length < 2) return undefined
  const background = pickBackground(colors)
  if (!background) return undefined
  const foregrounds = colors.filter((c) => c.id !== background.id)
  if (foregrounds.length === 0) return undefined

  const scenarios: GovernanceScenario[] = []
  const facts: ComputedStyleFact[] = []
  for (const fg of foregrounds) {
    const scenarioId = `token:${fg.id}:on:${background.id}`
    scenarios.push({
      id: scenarioId,
      selector: `token:${fg.id}`,
      foregroundTokenId: fg.id,
      backgroundTokenId: background.id,
      kind: 'text',
      lockedTokenIds: [],
      scenarioId,
      mode: 'light',
      state: 'default',
    })
    facts.push({
      scenarioId,
      viewport: 'design-tokens',
      foreground: fg.value,
      backgroundLayers: [background.value],
      // Body-text assumption: the strictest common case (4.5:1 required).
      fontSizePx: 16,
      fontWeight: 400,
      outlineWidthPx: 0,
      nonColorCueEvidence: [],
      axeViolations: [],
    })
  }

  return { receipt: evaluateGovernance(scenarios, facts, now), scenarios }
}
