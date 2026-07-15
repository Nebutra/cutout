import { INTEGRATION_SDK_PROTOCOL, type IntegrationAdapter, type IntegrationDataDomain, type IntegrationManifest } from './contracts'

interface RequiredAdapterOptions {
  readonly id: string
  readonly provider: string
  readonly product: string
  readonly domains: readonly IntegrationDataDomain[]
  readonly authModes: IntegrationManifest['auth']['modes']
}

export function adapterRequiredManifest(options: RequiredAdapterOptions): IntegrationManifest {
  return {
    protocol: INTEGRATION_SDK_PROTOCOL,
    id: options.id,
    version: '1.0.0',
    provider: { id: options.provider.toLowerCase(), name: options.provider },
    product: { id: options.product.toLowerCase(), name: options.product },
    surfaces: ['desktop', 'cli', 'mcp', 'headless'],
    capabilities: [],
    auth: { modes: options.authModes, ...(options.authModes.includes('oauth2') ? { oauth: { hostBoundary: true, scopes: [] } } : {}) },
    dataDomains: options.domains,
    syncModes: ['none'],
    eventModel: { cursor: 'none', webhooks: 'none', delivery: 'at-most-once' },
    limits: { maxBatchItems: 1, maxPayloadBytes: 1 },
    availability: 'adapter-required',
    unavailableReason: `${options.product} adapter is not installed; no remote API behavior is implemented.`,
  }
}

export function requiredAdapter(manifest: IntegrationManifest): IntegrationAdapter { return { manifest } }

export const adapterRequiredIntegrations = [
  ['notion', 'Notion', ['documents', 'pages', 'databases'], ['oauth2']],
  ['obsidian', 'Obsidian', ['documents', 'pages'], ['host-session']],
  ['framer', 'Framer', ['design-files', 'components', 'assets'], ['oauth2']],
  ['canva', 'Canva', ['design-files', 'assets'], ['oauth2']],
  ['pencil', 'Pencil', ['design-files', 'components'], ['host-session']],
  ['paper', 'Paper', ['documents', 'design-files'], ['oauth2']],
] as const satisfies readonly (readonly [string, string, readonly IntegrationDataDomain[], readonly ('oauth2' | 'host-session')[]])[]

export const builtinAdapterRequiredManifests = adapterRequiredIntegrations.map(([id, name, domains, authModes]) => adapterRequiredManifest({ id: `cutout.${id}`, provider: name, product: name, domains, authModes }))

const notionIndex = builtinAdapterRequiredManifests.findIndex((manifest) => manifest.id === 'cutout.notion')
if (notionIndex >= 0) builtinAdapterRequiredManifests[notionIndex] = {
  ...builtinAdapterRequiredManifests[notionIndex],
  availability: 'host-required',
  unavailableReason: 'Notion support requires a host that owns OAuth or internal-integration credentials; no credential or remote API client is bundled.',
}
