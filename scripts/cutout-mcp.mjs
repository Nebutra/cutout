#!/usr/bin/env node
import process from 'node:process'
import { closeHeadlessRuntime, executeControl, executeGovernance } from './cutout-headless.mjs'
import { capabilityStatus, discoveryHandshake, listSkills, readSkill } from './cutout-external-control.mjs'
import { closeRegistryRuntime, registryApplyInstall, registryGet, registryList, registryPlanInstall, registryReceipt } from './cutout-registry.mjs'
import { MCP_TOOLS, runMcpServer } from './cutout-mcp-server.mjs'
import { workflowCompatibility, workflowGet, workflowList } from './cutout-workflows.mjs'
import { PRODUCT_VERSION } from './lib/product-version.mjs'

runMcpServer({
  serverVersion: PRODUCT_VERSION,
  projectRoot: process.env.CUTOUT_PROJECT_ROOT,
  closeHeadlessRuntime,
  executeControl,
  executeGovernance,
  capabilityStatus,
  discoveryHandshake,
  listSkills,
  readSkill,
  closeRegistryRuntime,
  registryApplyInstall,
  registryGet,
  registryList,
  registryPlanInstall,
  registryReceipt,
  workflowCompatibility,
  workflowGet,
  workflowList,
})

export { MCP_TOOLS }
