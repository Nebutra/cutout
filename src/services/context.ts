/**
 * Service registry + React context (spec §5) — the single swap point.
 *
 * `createLocalRegistry(worker)` wires the v1 local implementations. A future
 * backend adds `createRemoteRegistry(httpClient)` and flips the call in
 * `main.tsx`; every consumer keeps using `useServices()` unchanged.
 *
 * Kept as `.ts` (no JSX) so the provider can live beside the pure interfaces;
 * it builds its element via `createElement`.
 */
import { createContext, createElement, useContext } from 'react'
import type { ReactNode } from 'react'
import { tauriBridge, type NativeBridge } from '@/platform/native'
import type { ServiceRegistry } from './types'
import type { GenerationService, ProviderService } from './ai/types'
import type { PromptService } from '@/prompts/types'
import { createLocalCutoutService } from './local/cutout-service.local'
import { createLocalForegroundSegmentationService } from './local/foreground-segmentation.local'
import { createLocalAssetRepository } from './local/asset-repository.local'
import { createLocalBundleRepository } from './local/bundle-repository.local'
import { createLocalRepositorySourceService } from './local/repository-source.local'
import { createLocalVectorizeService } from './local/vectorize-service.local'
import { createLocalSessionService } from './local/session.local'
import { createLocalProviderService } from './ai/provider-service.local'
import { createLocalPromptService } from './ai/prompt-service.local'

/** Assemble the local (v1) registry from a worker + native bridge. */
export function createLocalRegistry(
  worker: Worker,
  bridge: NativeBridge = tauriBridge,
): ServiceRegistry {
  // BYOK: the provider service resolves config for the generation service, so
  // build it first and hand it in (it satisfies the `Pick<'list'>` dependency).
  const providers = createLocalProviderService()
  // Prompts are a pure, offline catalog; the generation service consumes them to
  // resolve a `promptRef` → system instruction (spec §6).
  const prompts = createLocalPromptService()
  return {
    cutout: createLocalCutoutService(worker),
    foregroundSegmentation: createLocalForegroundSegmentationService(bridge),
    assets: createLocalAssetRepository(bridge),
    bundles: createLocalBundleRepository(bridge),
    repositorySources: createLocalRepositorySourceService(bridge),
    vectorize: createLocalVectorizeService(bridge),
    session: createLocalSessionService(),
    providers,
    generation: createDeferredGenerationService(providers, prompts),
    prompts,
  }
}

/**
 * Keep the AI SDK and every provider adapter out of the application entry.
 * Generation methods are already asynchronous, so resolving the implementation
 * on the first paid/model-backed action preserves the public contract while
 * avoiding a large startup download for Home and offline editing.
 */
function createDeferredGenerationService(
  providers: Pick<ProviderService, 'list'>,
  prompts: PromptService,
): GenerationService {
  let service: Promise<GenerationService> | undefined
  const load = () => service ??= import('./ai/generation-service.local')
    .then(({ createLocalGenerationService }) => createLocalGenerationService(providers, prompts))

  return {
    async generateText(input) {
      return (await load()).generateText(input)
    },
    async *streamText(input) {
      yield* (await load()).streamText(input)
    },
    async generateImages(input) {
      return (await load()).generateImages(input)
    },
    async editImage(input) {
      return (await load()).editImage(input)
    },
    async research(input) {
      return (await load()).research(input)
    },
    async generateObject(input, schema) {
      return (await load()).generateObject(input, schema)
    },
    async generateWithTools(input) {
      return (await load()).generateWithTools(input)
    },
  }
}

const ServiceContext = createContext<ServiceRegistry | null>(null)

export interface ServiceProviderProps {
  readonly registry: ServiceRegistry
  readonly children: ReactNode
}

/** Provides the service registry to the tree (mounted once in `main.tsx`). */
export function ServiceProvider(props: ServiceProviderProps) {
  return createElement(
    ServiceContext.Provider,
    { value: props.registry },
    props.children,
  )
}

/** Access the service registry; throws if used outside a `ServiceProvider`. */
export function useServices(): ServiceRegistry {
  const registry = useContext(ServiceContext)
  if (!registry) {
    throw new Error('useServices must be used within a <ServiceProvider>')
  }
  return registry
}
