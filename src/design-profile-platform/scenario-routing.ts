export interface DesignScenarioIntentMatch<Intent> {
  readonly scenarioId: string
  readonly reason: 'explicit-deliverable' | 'compound-domain-intent'
  readonly intent: Intent
}

export interface DesignScenarioIntentRecognizer<Intent> {
  readonly scenarioId: string
  readonly recognize: (input: string) => DesignScenarioIntentMatch<Intent> | undefined
}

export type DesignScenarioIntentRoute<Intent> =
  | { readonly status: 'matched'; readonly match: DesignScenarioIntentMatch<Intent> }
  | { readonly status: 'ambiguous'; readonly matches: readonly DesignScenarioIntentMatch<Intent>[] }
  | { readonly status: 'unmatched' }

/**
 * Scenario routing is advisory UI projection only. It opens a workbench but
 * never installs a Profile, authorizes execution, or advances evidence.
 */
export function routeDesignScenarioIntent<Intent>(input: string, recognizers: readonly DesignScenarioIntentRecognizer<Intent>[]): DesignScenarioIntentRoute<Intent> {
  const normalized = input.trim()
  if (!normalized) return { status: 'unmatched' }

  const matches = recognizers
    .map((recognizer) => recognizer.recognize(normalized))
    .filter((match): match is DesignScenarioIntentMatch<Intent> => Boolean(match))
    .sort((left, right) => left.scenarioId.localeCompare(right.scenarioId))

  if (matches.length === 0) return { status: 'unmatched' }
  if (matches.length > 1) return { status: 'ambiguous', matches }
  return { status: 'matched', match: matches[0]! }
}
