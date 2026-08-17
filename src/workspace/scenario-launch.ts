import {
  routeDesignScenarioIntent,
  type DesignScenarioIntentRecognizer,
} from '@/design-profile-platform/scenario-routing'
import {
  gameAssetIntentRecognizer,
  type GameAssetIntent,
  type GameAssetLaunchReference,
  type GameAssetLaunchRequest,
} from '@/game-asset-profile'
import {
  commerceMaterialIntentRecognizer,
  type CommerceMaterialIntent,
} from '@/commerce-profile/intent'

export interface WorkspaceWorkbenchLaunchOptions {
  readonly gameAssetLaunch?: GameAssetLaunchRequest
}

export type CanvasProfileLaunch =
  | {
      readonly kind: 'commerce'
      readonly sourceText: string
    }
  | {
      readonly kind: 'game-assets'
      readonly launch: GameAssetLaunchRequest
    }

export type WorkspaceSubmissionRoute =
  | { readonly kind: 'game-assets'; readonly intent: GameAssetIntent }
  | { readonly kind: 'commerce'; readonly intent: CommerceMaterialIntent }
  | { readonly kind: 'agent' }

type RoutedProfileIntent =
  | { readonly kind: 'game-assets'; readonly value: GameAssetIntent }
  | { readonly kind: 'commerce'; readonly value: CommerceMaterialIntent }

export function routeWorkspaceSubmission(input: string): WorkspaceSubmissionRoute {
  const recognizers: readonly DesignScenarioIntentRecognizer<RoutedProfileIntent>[] = [
    {
      scenarioId: gameAssetIntentRecognizer.scenarioId,
      recognize: (sourceText) => {
        const match = gameAssetIntentRecognizer.recognize(sourceText)
        return match
          ? {
              ...match,
              intent: { kind: 'game-assets' as const, value: match.intent },
            }
          : undefined
      },
    },
    {
      scenarioId: commerceMaterialIntentRecognizer.scenarioId,
      recognize: (sourceText) => {
        const match = commerceMaterialIntentRecognizer.recognize(sourceText)
        return match
          ? {
              ...match,
              intent: { kind: 'commerce' as const, value: match.intent },
            }
          : undefined
      },
    },
  ]
  const route = routeDesignScenarioIntent(input, recognizers)
  if (route.status !== 'matched') return { kind: 'agent' }
  return route.match.intent.kind === 'game-assets'
    ? { kind: 'game-assets', intent: route.match.intent.value }
    : { kind: 'commerce', intent: route.match.intent.value }
}

export function createGameAssetLaunchRequest(
  intent: GameAssetIntent,
  references: readonly GameAssetLaunchReference[],
): GameAssetLaunchRequest {
  const images = references.filter((reference) => reference.mediaType.startsWith('image/'))
  const reference = images.length === 1 ? images[0] : undefined
  if (intent.scope === 'map') return { intent, ...(reference ? { reference } : {}) }
  return { intent, ...(reference ? { reference } : {}) }
}
