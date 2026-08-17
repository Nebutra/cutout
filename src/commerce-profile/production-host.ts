import { invoke } from '@tauri-apps/api/core'
import { createMultimodalDesktopHost, type MultimodalDesktopHost } from '@/multimodal-host'
import { providerConfigsSchema, type ProviderConfig } from '@/services/ai/provider-types'
import {
  commerceHeldOutAdmissionSchema,
  commerceHeldOutCommitmentSchema,
  type CommerceHeldOutAdmission,
  type CommerceHeldOutChallengeSelection,
  type CommerceHeldOutCommitment,
  type CommerceHeldOutEvaluatorAttestation,
  type CommerceHeldOutInputManifest,
} from './held-out'
import {
  ingestCompetitionCommerceSourceImage,
  verifyNativeCommerceSourceIngestReceipt,
  type CommerceSourceIngestArtifact,
} from './source-ingest'
import type { CommerceProductionRehearsalBundle } from './rehearsal'

export interface CommerceProductionProviderPreflight {
  readonly provider?: ProviderConfig
  readonly hasKey: boolean
}

export interface CommerceProductionCoreHost extends MultimodalDesktopHost {
  preflightProvider(providerId: string): Promise<CommerceProductionProviderPreflight>
}

export interface CommerceProductionHost extends CommerceProductionCoreHost {
  createCommitment(input: {
    readonly evaluatorChallenge: CommerceHeldOutChallengeSelection
    readonly inputManifest: CommerceHeldOutInputManifest
  }): Promise<CommerceHeldOutCommitment>
  ingestSource(input: {
    readonly requestId: string
    readonly runId: string
    readonly heldOutCommitmentHash: string
    readonly factId: string
    readonly sourceFile: string
    readonly sourcePointer: string
    readonly sourceUrl: string
    readonly signal?: AbortSignal
  }): Promise<CommerceSourceIngestArtifact>
  verifySource(input: CommerceSourceIngestArtifact): Promise<unknown>
  admit(input: {
    readonly commitment: CommerceHeldOutCommitment
    readonly evaluatorAttestation: CommerceHeldOutEvaluatorAttestation
    readonly rehearsalBundle: CommerceProductionRehearsalBundle
  }): Promise<CommerceHeldOutAdmission>
}

export function createCommerceProductionDesktopHost(): CommerceProductionHost {
  const multimodal = createMultimodalDesktopHost()
  return {
    ...multimodal,
    async preflightProvider(providerId) {
      const providers = providerConfigsSchema.parse(await invoke<unknown>('load_providers'))
      const provider = providers.find((candidate) => candidate.id === providerId)
      const hasKey = await invoke<boolean>('key_status', { providerId })
      return { provider, hasKey }
    },
    async createCommitment(input) {
      return commerceHeldOutCommitmentSchema.parse(await invoke(
        'create_commerce_held_out_commitment',
        input,
      ))
    },
    ingestSource: ingestCompetitionCommerceSourceImage,
    verifySource: verifyNativeCommerceSourceIngestReceipt,
    async admit(input) {
      return commerceHeldOutAdmissionSchema.parse(await invoke(
        'verify_commerce_held_out_attestation',
        input,
      ))
    },
  }
}
