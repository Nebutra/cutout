#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const APP_ID = 'com.nebutra.cutout'
const DEFAULT_TIMEOUT_MS = Number(process.env.CUTOUT_AI_TIMEOUT_MS ?? 300_000)
const POLL_MS = 100

async function main() {
  const { flags, positional } = parseArgs(process.argv.slice(2))
  const command = positional[0]

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printUsage()
    return
  }

  const paths = aiNativePaths()
  if (command === 'paths') {
    printJson(paths)
    return
  }

  const action = await buildAction(command, positional.slice(1))
  const id = makeId(command)
  const envelope = {
    id,
    client: 'cutout-ai-cli',
    createdAt: new Date().toISOString(),
    action,
  }

  fs.mkdirSync(paths.inbox, { recursive: true })
  fs.mkdirSync(paths.outbox, { recursive: true })
  fs.mkdirSync(paths.failed, { recursive: true })
  writeJsonAtomic(path.join(paths.inbox, `${id}.json`), envelope)

  if (flags.noWait) {
    printJson({ id, queued: true, inbox: paths.inbox, action })
    return
  }

  const result = await waitForResult(paths, id, flags.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  printJson(result)
  if (result.result?.ok === false || result.ok === false) {
    process.exitCode = 1
  }
}

async function buildAction(command, args) {
  switch (command) {
    case 'ping':
      return { type: 'ping' }
    case 'state':
    case 'get-state':
    case 'snapshot':
      return { type: 'get-state' }
    case 'ai-config':
    case 'get-ai-config':
      return { type: 'get-ai-config' }
    case 'send':
      return readJsonAction(args)
    case 'set-model-assignment':
      requireArgs(command, args, 3)
      return {
        type: 'set-model-assignment',
        slot: args[0],
        assignment: {
          providerId: args[1],
          model: args[2],
          ...(args[3] ? { effort: args[3] } : {}),
        },
      }
    case 'clear-model-assignment':
      requireArgs(command, args, 1)
      return { type: 'clear-model-assignment', slot: args[0] }
    case 'upsert-provider':
      requireArgs(command, args, 1)
      return { type: 'upsert-provider', provider: parseJson(args.join(' ')) }
    case 'remove-provider':
      requireArgs(command, args, 1)
      return { type: 'remove-provider', id: args[0] }
    case 'set-provider-key':
      requireArgs(command, args, 2)
      return {
        type: 'set-provider-key',
        id: args[0],
        secret: args[1] === '-' ? (await readStdin()).trim() : args.slice(1).join(' '),
      }
    case 'test-provider':
      requireArgs(command, args, 1)
      return { type: 'test-provider', id: args[0] }
    case 'set-brief':
    case 'brief':
      return { type: 'set-brief', text: args.join(' ') }
    case 'import-board':
    case 'load-board':
      requireArgs(command, args, 1)
      return { type: 'import-board', path: args[0], name: args[1] }
    case 'import-mockup':
    case 'load-mockup':
      requireArgs(command, args, 1)
      return { type: 'import-mockup', path: args[0], name: args[1] }
    case 'run-cutout':
    case 'cutout':
      return {
        type: 'run-cutout',
        withSlices: true,
        waitMs: args[0] === undefined ? DEFAULT_TIMEOUT_MS : parseNumber(args[0], 'waitMs'),
      }
    case 'generate':
    case 'generate-mockup':
      return { type: 'generate-mockup' }
    case 'deconstruct':
    case 'deconstruct-mockup':
      return { type: 'deconstruct-mockup' }
    case 'compose':
    case 'compose-mockup':
      return { type: 'compose-mockup' }
    case 'plan':
    case 'plan-and-generate':
      return { type: 'plan-and-generate' }
    case 'plan-semantic-slices':
    case 'semantic-plan':
      return { type: 'plan-semantic-slices', ...parseOptionalJsonOrBrief(args, 'brief') }
    case 'run-semantic-slices':
    case 'semantic-slices':
      return { type: 'run-semantic-slices', ...parseOptionalJsonOrBrief(args, 'brief') }
    case 'rerun-subtree':
      requireArgs(command, args, 1)
      return { type: 'rerun-subtree', nodeId: args[0] }
    case 'name-slices':
      return { type: 'name-slices' }
    case 'clear-graph':
      return { type: 'clear-graph' }
    case 'set-graph':
      requireArgs(command, args, 1)
      return { type: 'set-graph', graph: parseJson(args.join(' ')) }
    case 'reset-dag-nodes':
      requireArgs(command, args, 1)
      return { type: 'reset-dag-nodes', ids: args.join(' ').split(',').filter(Boolean) }
    case 'clear-intent':
      return { type: 'clear-intent' }
    case 'set-intent':
      requireArgs(command, args, 1)
      return { type: 'set-intent', intent: parseJson(args.join(' ')) }
    case 'select-slice':
      requireArgs(command, args, 1)
      return { type: 'select-slice', id: args[0] }
    case 'rename-slice':
      requireArgs(command, args, 2)
      return { type: 'rename-slice', id: args[0], name: args.slice(1).join(' ') }
    case 'clear-selection':
      return { type: 'clear-selection' }
    default:
      throw new Error(`Unknown command: ${command}`)
  }
}

function parseArgs(argv) {
  const flags = { noWait: false, timeoutMs: undefined }
  const positional = []

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--no-wait') {
      flags.noWait = true
    } else if (arg === '--timeout') {
      index += 1
      flags.timeoutMs = parseNumber(argv[index], 'timeout')
    } else {
      positional.push(arg)
    }
  }

  return { flags, positional }
}

async function readJsonAction(args) {
  requireArgs('send', args, 1)
  const raw = args[0] === '-' ? await readStdin() : args.join(' ')
  return parseJson(raw)
}

async function readStdin() {
  let input = ''
  process.stdin.setEncoding('utf8')
  for await (const chunk of process.stdin) {
    input += chunk
  }
  return input
}

function aiNativePaths() {
  const appData = appDataDir()
  const root = path.join(appData, 'ai-native')
  return {
    appData,
    root,
    inbox: path.join(root, 'inbox'),
    processing: path.join(root, 'processing'),
    outbox: path.join(root, 'outbox'),
    failed: path.join(root, 'failed'),
    artifacts: path.join(root, 'artifacts'),
  }
}

function appDataDir() {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', APP_ID)
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), APP_ID)
  }
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), APP_ID)
}

async function waitForResult(paths, id, timeoutMs) {
  const started = Date.now()
  const outboxPath = path.join(paths.outbox, `${id}.json`)
  const failedPath = path.join(paths.failed, `${id}.json`)

  while (Date.now() - started <= timeoutMs) {
    if (fs.existsSync(outboxPath)) {
      return parseJson(fs.readFileSync(outboxPath, 'utf8'))
    }
    if (fs.existsSync(failedPath)) {
      const failure = parseJson(fs.readFileSync(failedPath, 'utf8'))
      return { id, ok: false, failure }
    }
    await sleep(POLL_MS)
  }

  throw new Error(`Timed out waiting for Cutout AI Native response (${timeoutMs}ms). Is the app running?`)
}

function writeJsonAtomic(filePath, value) {
  const tmp = `${filePath}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`)
  fs.renameSync(tmp, filePath)
}

function makeId(command) {
  const safeCommand = command.replace(/[^a-zA-Z0-9_-]/g, '_')
  const random = Math.random().toString(36).slice(2, 8)
  return `${Date.now()}-${process.pid}-${safeCommand}-${random}`
}

function parseJson(raw) {
  try {
    return JSON.parse(raw)
  } catch (error) {
    throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function parseOptionalJsonOrBrief(args, briefKey) {
  if (args.length === 0) return {}
  const raw = args.join(' ')
  if (raw.trimStart().startsWith('{')) return parseJson(raw)
  return { [briefKey]: raw }
}

function parseNumber(value, label) {
  const number = Number(value)
  if (!Number.isFinite(number)) {
    throw new Error(`${label} must be a finite number.`)
  }
  return number
}

function requireArgs(command, args, count) {
  if (args.length < count) {
    throw new Error(`${command} expects at least ${count} argument(s).`)
  }
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2))
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function printUsage() {
  console.log(`Cutout AI Native CLI

Usage:
  pnpm ai paths
  pnpm ai get-state
  pnpm ai get-ai-config
  pnpm ai upsert-provider '{"kind":"openai-compatible","label":"Mox","baseUrl":"https://aigw.mox.ktvsky.com","wireProtocol":"chat-completions","defaultModel":"gpt-image-1","enabled":true}'
  pnpm ai set-provider-key <providerId> <secret>
  echo "$OPENAI_API_KEY" | pnpm ai set-provider-key <providerId> -
  pnpm ai set-model-assignment image <providerId> gpt-image-1
  pnpm ai set-brief "政府官网"
  pnpm ai import-board /absolute/path/sheet.png
  pnpm ai import-mockup /absolute/path/mockup.png
  pnpm ai run-cutout [waitMs]
  pnpm ai generate-mockup
  pnpm ai deconstruct-mockup
  pnpm ai compose-mockup
  pnpm ai plan-and-generate
  pnpm ai semantic-plan "政府官网"
  pnpm ai semantic-slices '{"brief":"政府官网","maxSlices":6,"routes":["text-to-image","image-to-image"]}'
  pnpm ai name-slices
  pnpm ai send '{"type":"get-state"}'
  echo '{"type":"get-state"}' | pnpm ai send -

Flags:
  --no-wait          Queue the command and return immediately.
  --timeout <ms>     Max time to wait for the app to write outbox JSON.
`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
