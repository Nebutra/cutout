#!/usr/bin/env node
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { AgentError, LIMITS, VERSION, invariant, sha256, stableJson } from './lib/contracts.js'
import { buildAttributeIndex, buildCategoryIndex, normalizeProduct } from './lib/data.js'
import {
  assertOutputAvailable, authorizeRoots, createLogger, createWorkspace, inventoryInputs, parsePromptPaths,
} from './lib/filesystem.js'
import { runProduction } from './lib/orchestrator.js'
import { DashScopeClient } from './lib/provider.js'

function argumentsFor(argv) {
  if (argv.length === 1 && argv[0] === '--version') return { mode: 'version' }
  invariant(argv.length === 2 && argv[0] === '--prompt' && argv[1], 'invalid-arguments', 'Usage: node agent.js --prompt "<official task prompt>" or --version')
  return { mode: 'run', prompt: argv[1] }
}

export async function main(argv = process.argv.slice(2), environment = process.env, options = {}) {
  const args = argumentsFor(argv)
  if (args.mode === 'version') {
    process.stdout.write(`${VERSION}\n`)
    return 0
  }
  const startedAt = Date.now()
  const deadline = startedAt + LIMITS.runMs
  const apiKey = environment.DASHSCOPE_API_KEY
  invariant(typeof apiKey === 'string' && apiKey.trim() && apiKey.length <= 8_192
    && !apiKey.includes('\r') && !apiKey.includes('\n') && !apiKey.includes('\0'),
    'credential-missing', 'DASHSCOPE_API_KEY is required and must be a bounded single-line value.')
  const logRoot = environment.AGENT_LOG_DIR
  invariant(typeof logRoot === 'string' && logRoot.trim(), 'invalid-log-path', 'AGENT_LOG_DIR is required.')
  const baseUrl = environment.DASHSCOPE_BASE_URL || environment.OPENAI_BASE_URL || undefined
  const { inputRoot, outputRoot } = parsePromptPaths(args.prompt)
  const roots = await authorizeRoots({ inputRoot, outputRoot, logRoot: resolve(logRoot) })
  const logger = createLogger(roots.logs, apiKey)
  try {
    await logger.write('run_started', { version: VERSION, inputRootHash: sha256(roots.input.canonical), outputRootHash: sha256(roots.output.canonical) })
    await assertOutputAvailable(roots.output)
    const inventory = await inventoryInputs(roots.input)
    const facts = normalizeProduct(inventory.product)
    const categoryIndex = buildCategoryIndex(inventory.categories)
    const attributeIndex = buildAttributeIndex(inventory.attributes, categoryIndex)
    const planHash = sha256(stableJson({
      schema: 'qianwen.commerce-plan-binding.v1', version: VERSION,
      inventoryDigest: inventory.digest, factsDigest: facts.digest,
      models: ['qwen3.8-max', 'qwen3-vl-plus', 'qwen-image-3.0-pro', 'wan2.7-i2v-2026-04-25'],
      outputs: 11,
    }))
    const workspace = await createWorkspace(roots.output, planHash, apiKey)
    const provider = new DashScopeClient({
      apiKey, baseUrl, deadline, workspace, planHash, logger,
      fetchImpl: options.fetchImpl, allowedResultOrigins: options.allowedResultOrigins,
      allowTestOrigin: options.allowTestOrigin, timing: options.timing,
    })
    const result = await runProduction({
      provider, workspace, outputRoot: roots.output, facts, categoryIndex, attributeIndex,
      inputDigest: inventory.digest, logger,
    })
    await logger.write('run_succeeded', { elapsedMs: Date.now() - startedAt, outputCount: result.names.length, gates: JSON.stringify(result.checks) })
    await logger.flush()
    return 0
  } catch (error) {
    const code = error instanceof AgentError ? error.code : 'internal-error'
    await logger.write('run_failed', { code, message: error instanceof Error ? error.message : 'Unexpected failure' }).catch(() => {})
    await logger.flush().catch(() => {})
    throw error
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined
if (invokedPath === import.meta.url) {
  main().then((code) => { process.exitCode = code }).catch((error) => {
    const code = error instanceof AgentError ? error.code : 'internal-error'
    process.stderr.write(`Agent failed (${code}). See AGENT_LOG_DIR/agent.log for details.\n`)
    process.exitCode = 1
  })
}
