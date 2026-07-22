import process from 'node:process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as headlessRuntime from '../src/headless/index.ts'
import { createNodeRegistryService } from '../src/registry/node.ts'
import { createExternalControl } from './cutout-external-control.mjs'
import { createHeadlessAdapter } from './cutout-headless-adapter.mjs'
import { runMcpServer } from './cutout-mcp-server.mjs'
import { createRegistryAdapter } from './cutout-registry-adapter.mjs'
import { workflowCompatibility, workflowGet, workflowList } from './cutout-workflows.mjs'

const dataRoot = resolve(import.meta.dirname, '..', 'runtime-data')
const serverVersion = JSON.parse(readFileSync(resolve(dataRoot, 'cutout.agent-capabilities.json'), 'utf8')).product.packageVersion
const externalControl = createExternalControl(dataRoot)
const headless = createHeadlessAdapter(async () => headlessRuntime)
const registry = createRegistryAdapter(async (projectRoot) => createNodeRegistryService(projectRoot))

runMcpServer({
  serverVersion,
  projectRoot: process.env.CUTOUT_PROJECT_ROOT,
  closeHeadlessRuntime: async () => undefined,
  executeControl: headless.executeControl,
  executeGovernance: headless.executeGovernance,
  capabilityStatus: externalControl.capabilityStatus,
  discoveryHandshake: externalControl.discoveryHandshake,
  listSkills: externalControl.listSkills,
  readSkill: externalControl.readSkill,
  closeRegistryRuntime: async () => undefined,
  registryApplyInstall: registry.registryApplyInstall,
  registryGet: registry.registryGet,
  registryList: registry.registryList,
  registryPlanInstall: registry.registryPlanInstall,
  registryReceipt: registry.registryReceipt,
  workflowCompatibility,
  workflowGet,
  workflowList,
})
