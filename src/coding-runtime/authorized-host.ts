import type { GenerationService } from '@/services/ai/types'
import type { ModelAssignment } from '@/services/ai/model-assignment-types'
import { tauriCodingWorkspaceBridge } from '@/platform/native'
import { createNativeCodingWorkspace, type NativeCodingWorkspaceBridge } from './native-workspace'
import { createProviderCodingBackend } from './provider-backend'

export interface AuthorizedCodingHostOptions {
  readonly workspaceHandle: string
  readonly generation: Pick<GenerationService, 'generateObject'>
  readonly assignment: ModelAssignment
  readonly resolvedContext?: Readonly<Record<string, string>>
  readonly visualReferences?: readonly Uint8Array[]
  readonly bridge?: NativeCodingWorkspaceBridge
}

/** Compose the Rust-routed provider with an opaque, native-authorized workspace. */
export function createAuthorizedCodingHost(options: AuthorizedCodingHostOptions) {
  return {
    backend: createProviderCodingBackend({
      generation: options.generation,
      assignment: options.assignment,
      resolvedContext: options.resolvedContext,
      visualReferences: options.visualReferences,
    }),
    workspace: createNativeCodingWorkspace(
      options.workspaceHandle,
      options.bridge ?? tauriCodingWorkspaceBridge,
    ),
  }
}
