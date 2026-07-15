import type { SourceKind } from '@/design-ir'
import {
  CONNECTOR_PROTOCOL,
  type Connector,
  type ConnectorAuthKind,
  type ConnectorAvailability,
  type ConnectorInput,
  type ConnectorManifest,
  type ConnectorPreview,
  type ConnectorResult,
  type ConnectorContext,
} from './contracts'

interface DescriptorOptions {
  readonly id: string
  readonly name: string
  readonly sourceKind: Extract<SourceKind, 'url' | 'video' | 'figma' | 'repository'>
  readonly availability: ConnectorAvailability
  readonly auth: ConnectorAuthKind
  readonly reason?: string
}

export function createDescriptorConnector(options: DescriptorOptions): Connector {
  const manifest: ConnectorManifest = {
    protocol: CONNECTOR_PROTOCOL,
    id: options.id,
    name: options.name,
    version: '1.0.0',
    availability: options.availability,
    capabilities: [{ operation: 'preview', sourceKinds: [options.sourceKind] }],
    auth: { kind: options.auth },
    ...(options.reason ? { unavailableReason: options.reason } : {}),
  }
  return {
    manifest,
    async preview(input: ConnectorInput, context: ConnectorContext): Promise<ConnectorResult<ConnectorPreview>> {
      context.signal.throwIfAborted()
      const recordedAt = context.now()
      return {
        ok: true,
        data: {
          kind: 'connector-preview', connectorId: manifest.id, base: context.base,
          sourceKind: input.sourceKind,
          summary: `Descriptor only: ${input.locator}`,
          warnings: ['No remote content was fetched or semantically analyzed.'],
          provenance: {
            connectorId: manifest.id, connectorVersion: manifest.version, operation: 'preview',
            sourceKind: input.sourceKind, recordedAt, externalRef: input.locator,
          },
        },
      }
    },
  }
}

export const builtinDescriptorConnectors: readonly Connector[] = [
  createDescriptorConnector({ id: 'cutout.url-descriptor', name: 'URL descriptor', sourceKind: 'url', availability: 'available', auth: 'none' }),
  createDescriptorConnector({ id: 'cutout.video-descriptor', name: 'Video descriptor', sourceKind: 'video', availability: 'unavailable', auth: 'none', reason: 'Video capture adapter is not installed.' }),
  createDescriptorConnector({ id: 'cutout.figma-descriptor', name: 'Figma descriptor', sourceKind: 'figma', availability: 'authorization-required', auth: 'oauth2' }),
]

export function registerBuiltinDescriptorConnectors(registry: { register(connector: Connector): unknown }): void {
  for (const connector of builtinDescriptorConnectors) registry.register(connector)
}
