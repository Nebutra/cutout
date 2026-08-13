import { isImageModelNominationCandidate } from './image-route-assessment'
import type { ModelAssignment } from './model-assignment-types'
import type { ProviderConfig } from './provider-types'
import {
  providerVerificationIsVerified,
  type ProviderVerification,
} from './provider-verification'

export interface VerifiedTextRouteCandidatesInput {
  readonly preferred?: ModelAssignment
  readonly providers: readonly ProviderConfig[]
  readonly verifications: Readonly<Record<string, ProviderVerification>>
  /** Packaged-E2E throughput experiment only; never set for product routing. */
  readonly preferPackagedE2eQwen?: boolean
}

const PACKAGED_E2E_QWEN_TEXT_MODEL = 'qwen-plus'
const TEXT_MODEL_NOMINATION =
  /(?:gpt|claude|gemini|qwen|deepseek|kimi|moonshot|mistral|llama|codex|chat)/i

/**
 * Project authenticated catalog rows into cold text-route candidates. Catalog
 * presence proves discovery and credential access, not generation readiness;
 * real turn health is tracked separately by TextRouteHealthRegistry.
 */
export function verifiedTextRouteCandidates(
  input: VerifiedTextRouteCandidatesInput,
): readonly ModelAssignment[] {
  const candidates: ModelAssignment[] = []
  const add = (assignment: ModelAssignment | undefined) => {
    if (
      !assignment
      || !TEXT_MODEL_NOMINATION.test(assignment.model)
      || isImageModelNominationCandidate(assignment.model)
    ) return
    const provider = input.providers.find(
      (value) => value.id === assignment.providerId && value.enabled,
    )
    if (
      !provider
      || !providerVerificationIsVerified(
        input.verifications[assignment.providerId],
        assignment.model,
      )
      || candidates.some((value) =>
        value.providerId === assignment.providerId && value.model === assignment.model)
    ) return
    candidates.push(assignment)
  }

  add(input.preferred)
  for (const provider of input.providers) {
    const verification = input.verifications[provider.id]
    if (!provider.enabled || !providerVerificationIsVerified(verification)) continue
    for (const model of verification?.models ?? [verification!.model!]) {
      add({ providerId: provider.id, model })
    }
  }

  if (!input.preferPackagedE2eQwen) return candidates
  const qwenIndex = candidates.findIndex((assignment) => {
    const provider = input.providers.find(({ id }) => id === assignment.providerId)
    return provider?.kind === 'dashscope'
      && assignment.model === PACKAGED_E2E_QWEN_TEXT_MODEL
  })
  if (qwenIndex <= 0) return candidates
  const [qwen] = candidates.splice(qwenIndex, 1)
  return [qwen!, ...candidates]
}
