import { createServer } from 'vite'
import { adapterError, createHeadlessAdapter, parseTokenAssignments, PROTOCOL, unsupported } from './cutout-headless-adapter.mjs'

let loaded

async function runtimeModule() {
  if (!loaded) {
    loaded = (async () => {
      const server = await createServer({ logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' })
      const runtime = await server.ssrLoadModule('/src/headless/index.ts')
      return { runtime, server }
    })()
  }
  return loaded
}

const adapter = createHeadlessAdapter(async () => (await runtimeModule()).runtime)

export async function closeHeadlessRuntime() {
  if (!loaded) return
  const { server } = await loaded
  loaded = undefined
  await server.close()
}

export const executeControl = adapter.executeControl
export const executeGovernance = adapter.executeGovernance
export { adapterError, parseTokenAssignments, PROTOCOL, unsupported }
