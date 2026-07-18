import { createServer } from 'vite'
import { createRegistryAdapter } from './cutout-registry-adapter.mjs'

let loaded

async function service(projectRoot) {
  if (!loaded) loaded = createServer({ logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' })
  const server = await loaded
  const module = await server.ssrLoadModule('/src/registry/node.ts')
  return module.createNodeRegistryService(projectRoot)
}

const adapter = createRegistryAdapter(service)

export async function closeRegistryRuntime() {
  if (!loaded) return
  const server = await loaded
  loaded = undefined
  await server.close()
}

export const {
  registryApplyInstall,
  registryGet,
  registryList,
  registryPlanInstall,
  registryReceipt,
} = adapter
