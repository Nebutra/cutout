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
import { createLocalCutoutService } from './local/cutout-service.local'
import { createLocalAssetRepository } from './local/asset-repository.local'
import { createLocalSessionService } from './local/session.local'
import { createLocalProviderService } from './ai/provider-service.local'
import { createLocalGenerationService } from './ai/generation-service.local'

/** Assemble the local (v1) registry from a worker + native bridge. */
export function createLocalRegistry(
  worker: Worker,
  bridge: NativeBridge = tauriBridge,
): ServiceRegistry {
  // BYOK: the provider service resolves config for the generation service, so
  // build it first and hand it in (it satisfies the `Pick<'list'>` dependency).
  const providers = createLocalProviderService()
  return {
    cutout: createLocalCutoutService(worker),
    assets: createLocalAssetRepository(bridge),
    session: createLocalSessionService(),
    providers,
    generation: createLocalGenerationService(providers),
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
