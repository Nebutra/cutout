import { describe, expect, it } from 'vitest'
import { routeDesignScenarioIntent, type DesignScenarioIntentRecognizer } from './scenario-routing'

function recognizer(scenarioId: string, token: string): DesignScenarioIntentRecognizer<string> {
  return {
    scenarioId,
    recognize: (input) => input.includes(token)
      ? { scenarioId, reason: 'explicit-deliverable', intent: input }
      : undefined,
  }
}

describe('Design scenario intent routing', () => {
  it('routes one explicit match without granting execution authority', () => {
    expect(routeDesignScenarioIntent('make a sprite', [recognizer('profile:game', 'sprite')])).toEqual({
      status: 'matched',
      match: {
        scenarioId: 'profile:game',
        reason: 'explicit-deliverable',
        intent: 'make a sprite',
      },
    })
  })

  it('keeps zero or multiple matches out of automatic execution routing', () => {
    const recognizers = [recognizer('profile:a', 'asset'), recognizer('profile:b', 'asset')]
    expect(routeDesignScenarioIntent('write release notes', recognizers)).toEqual({ status: 'unmatched' })
    expect(routeDesignScenarioIntent('create an asset', recognizers)).toMatchObject({ status: 'ambiguous' })
  })
})
