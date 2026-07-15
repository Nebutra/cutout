import { createServer } from 'vite'
let loaded
async function service(projectRoot) { if (!loaded) loaded = createServer({ logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' }); const server = await loaded; const module = await server.ssrLoadModule('/src/registry/node.ts'); return module.createNodeRegistryService(projectRoot) }
export async function closeRegistryRuntime() { if (loaded) { const server = await loaded; loaded = undefined; await server.close() } }
export async function registryList(root, query) { return (await service(root)).list(query) }
export async function registryGet(root, id, version) { return (await service(root)).get(id, version) }
export async function registryPlanInstall(root, id, framework, version) { return (await service(root)).planInstall(id, framework, version) }
export async function registryApplyInstall(root, id, framework, approval, version) { return (await service(root)).applyInstall(id, framework, approval, version) }
export async function registryReceipt(root, planId) { return (await service(root)).receipt(planId) }
