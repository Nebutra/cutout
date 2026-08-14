import { routeDesignScenarioIntent } from '@/design-profile-platform/scenario-routing'
import {
  gameAssetIntentRecognizer,
  type GameAssetIntent,
  type GameAssetLaunchReference,
  type GameAssetLaunchRequest,
} from '@/game-asset-profile'

export interface WorkspaceWorkbenchLaunchOptions {
  readonly gameAssetLaunch?: GameAssetLaunchRequest
}

export type WorkspaceSubmissionRoute =
  | { readonly kind: 'game-assets'; readonly intent: GameAssetIntent }
  | { readonly kind: 'agent' }

export function routeWorkspaceSubmission(input: string): WorkspaceSubmissionRoute {
  const route = routeDesignScenarioIntent(input, [gameAssetIntentRecognizer])
  return route.status === 'matched'
    ? { kind: 'game-assets', intent: route.match.intent }
    : { kind: 'agent' }
}

export function createGameAssetLaunchRequest(
  intent: GameAssetIntent,
  references: readonly GameAssetLaunchReference[],
): GameAssetLaunchRequest {
  const images = references.filter((reference) => reference.mediaType.startsWith('image/'))
  return {
    intent,
    ...(images.length === 1 ? { reference: images[0] } : {}),
  }
}
