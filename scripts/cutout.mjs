#!/usr/bin/env node
import process from 'node:process'
import {
  adapterError,
  closeHeadlessRuntime,
  executeControl,
  executeGovernance,
  parseTokenAssignments,
} from './cutout-headless.mjs'
import { capabilityStatus, discoveryHandshake, listSkills, readSkill } from './cutout-external-control.mjs'
import { closeRegistryRuntime, registryApplyInstall, registryGet, registryList, registryPlanInstall, registryReceipt } from './cutout-registry.mjs'
import { workflowCompatibility, workflowGet, workflowList } from './cutout-workflows.mjs'

async function main(argv) {
  const { projectRoot, args } = parseGlobalFlags(argv)
  const [command, ...rest] = args
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printUsage()
    return { ok: true }
  }

  switch (command) {
    case 'discover':
      return { ok: true, response: await discoveryHandshake(projectRoot, { name: 'cutout-cli', version: '0.1.1' }) }
    case 'capabilities':
      return { ok: true, response: await capabilityStatus() }
    case 'skills':
      if (rest.length === 0 || rest[0] === 'list') return { ok: true, response: await listSkills() }
      if (rest[0] === 'read' && rest[1]) return readSkill(rest[1], rest[2] === '--reference' ? 'reference' : 'workflow')
      throw new Error('Use: skills list | skills read <skill-id> [--reference].')
    case 'context':
      return executeControl(projectRoot, { type: 'project.context', include: parseInclude(rest) })
    case 'materials':
      return executeControl(projectRoot, { type: 'material.list', filter: parseMaterialFilter(rest) })
    case 'validate':
      return executeControl(projectRoot, { type: 'validate', scope: parseScopes(rest) })
    case 'governance':
      return governance(projectRoot, rest)
    case 'patch':
      return patch(projectRoot, rest)
    case 'ingest':
      return ingest(projectRoot, rest)
    case 'run':
      return run(projectRoot, rest)
    case 'export-kit':
      return exportKit(projectRoot, rest)
    case 'export-brand-kit':
      return exportBrandKit(projectRoot, rest)
    case 'export-starter':
      return exportStarter(projectRoot, rest)
    case 'coding':
      return coding(projectRoot, rest)
    case 'registry':
      return registry(projectRoot, rest)
    case 'workflow':
      return workflow(projectRoot, rest)
    default:
      return adapterError('invalid-command', `Unknown command "${command}". Run cutout help for the supported headless surface.`)
  }
}

async function governance(projectRoot, args) {
  const [mode, ...rest] = args
  if (!['preview', 'validate', 'report'].includes(mode)) throw new Error('Use: governance preview|validate|report --input <JSON> --policy <JSON>.')
  return executeGovernance(projectRoot, jsonFlag(rest, '--input'), jsonFlag(rest, '--policy'), mode)
}

function jsonFlag(args, name) {
  const index = args.indexOf(name)
  if (index < 0 || !args[index + 1]) throw new Error(`${name} requires a JSON object.`)
  try {
    const value = JSON.parse(args[index + 1])
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error()
    return value
  } catch {
    throw new Error(`${name} must be a valid JSON object.`)
  }
}

async function workflow(projectRoot,args){const[action,...rest]=args;if(action==='list')return{ok:true,response:{packs:await workflowList(projectRoot)}};if(action==='get'&&rest[0])return{ok:true,response:await workflowGet(projectRoot,rest[0],flag(rest,'--version'))};if(action==='compat'&&rest[0]){const pack=await workflowGet(projectRoot,rest[0],flag(rest,'--version'));return{ok:true,response:workflowCompatibility(pack,{cutoutVersion:flag(rest,'--cutout')??'0.1.1',capabilities:flag(rest,'--capabilities')?.split(',').filter(Boolean)??[]})}}throw new Error('Use: workflow list|get|compat.')}

async function registry(projectRoot, args) {
  const [action, ...rest] = args
  if (action === 'list' || action === 'search') {
    const kindAt = rest.indexOf('--kind'); const frameworkAt = rest.indexOf('--framework')
    const values = rest.filter((_, index) => index !== kindAt && index !== kindAt + 1 && index !== frameworkAt && index !== frameworkAt + 1)
    if (action === 'search' && values.length !== 1) throw new Error('Use: registry search <query> [--kind <kind>] [--framework <framework>].')
    return { ok: true, response: { items: await registryList(projectRoot, { ...(action === 'search' ? { query: values[0] } : {}), ...(kindAt >= 0 ? { kind: rest[kindAt + 1] } : {}), ...(frameworkAt >= 0 ? { framework: rest[frameworkAt + 1] } : {}) }) } }
  }
  if (action === 'get' && rest[0]) return { ok: true, response: await registryGet(projectRoot, rest[0], flag(rest, '--version')) }
  if (action === 'install' && rest[0]) {
    const framework = flag(rest, '--framework'); if (!framework) throw new Error('registry install requires --framework.')
    if (rest.includes('--approval')) throw new Error('registry install no longer accepts caller-authored --approval; use a reviewed --plan with --approval-lease.')
    const approvalLeaseId = flag(rest, '--approval-lease'); const planId = flag(rest, '--plan'); const version = flag(rest, '--version')
    if (approvalLeaseId || planId) {
      if (!approvalLeaseId || !planId) throw new Error('registry install apply requires --plan and --approval-lease.')
      return { ok: true, response: await registryApplyInstall(projectRoot, rest[0], framework, planId, approvalLeaseId, version) }
    }
    return { ok: true, response: await registryPlanInstall(projectRoot, rest[0], framework, version) }
  }
  if (action === 'receipt' && rest.length === 1) { const receipt = await registryReceipt(projectRoot, rest[0]); return receipt ? { ok: true, response: receipt } : adapterError('not-found', 'Registry install receipt was not found.') }
  throw new Error('Use: registry list|search|get|install|receipt.')
}
function flag(args, name) { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : undefined }

async function coding(projectRoot, args) {
  const [action, taskJson, ...rest] = args
  if (!['execute', 'review', 'repair'].includes(action) || !taskJson) throw new Error('Use: coding <execute|review|repair> <CodingTask JSON> [--apply --approval-lease <lease-id>].')
  let task
  try { task = JSON.parse(taskJson) } catch { throw new Error('CodingTask must be valid JSON.') }
  if (rest.length === 0) return executeControl(projectRoot, { type: `coding.${action}`, task }, { mode: 'dry-run' })
  if (rest.length === 3 && rest[0] === '--apply' && rest[1] === '--approval-lease' && rest[2]) return executeControl(projectRoot, { type: `coding.${action}`, task }, { mode: 'apply', approvalLeaseId: rest[2] })
  throw new Error('Use: coding <execute|review|repair> <CodingTask JSON> [--apply --approval-lease <lease-id>].')
}

async function run(projectRoot, args) {
  const [action, ...rest] = args
  if (action === 'start') {
    const modeAt = rest.indexOf('--mode')
    const mode = modeAt >= 0 ? rest[modeAt + 1] : 'create'
    const runIdAt = rest.indexOf('--id')
    const runId = runIdAt >= 0 ? rest[runIdAt + 1] : undefined
    const intent = rest.filter((_, index) => index !== modeAt && index !== modeAt + 1 && index !== runIdAt && index !== runIdAt + 1).join(' ')
    if (!runId || (mode !== 'create' && mode !== 'repair') || !intent) throw new Error('Use: run start --id <run-id> [--mode create|repair] <intent>.')
    return executeControl(projectRoot, { type: 'run.start', runId, mode, intent })
  }
  if (action === 'get' && rest.length === 1) return executeControl(projectRoot, { type: 'run.get', runId: rest[0] })
  if (action === 'events') {
    const runId = rest[0]
    if (!runId) throw new Error('Use: run events <run-id> [--after <event-id>] [--limit <count>].')
    const afterAt = rest.indexOf('--after')
    const limitAt = rest.indexOf('--limit')
    const afterEventId = afterAt >= 0 ? rest[afterAt + 1] : undefined
    const limit = limitAt >= 0 ? Number(rest[limitAt + 1]) : undefined
    if ((afterAt >= 0 && !afterEventId) || (limitAt >= 0 && (!Number.isInteger(limit) || limit < 1 || limit > 1000))) throw new Error('Invalid run events cursor or limit.')
    return executeControl(projectRoot, { type: 'run.events', runId, ...(afterEventId ? { afterEventId } : {}), ...(limit ? { limit } : {}) })
  }
  if (action === 'cancel') {
    const runId = rest[0]
    if (!runId) throw new Error('Use: run cancel <run-id> [reason].')
    const reason = rest.slice(1).join(' ')
    return executeControl(projectRoot, { type: 'run.cancel', runId, ...(reason ? { reason } : {}) })
  }
  throw new Error('Use: run start|get|events|cancel.')
}

async function ingest(projectRoot, args) {
  const { sourceArgs, apply, approvalLeaseId } = parseApply(args, 'ingest')
  const [kind, value, ...extra] = sourceArgs
  if (!kind || !value || extra.length > 0) {
    throw new Error('Use: ingest --repo <relative-root> | --url <url> | --idea <text> | --story <text> | --file <relative-path> [--apply --approval-lease <lease-id>].')
  }
  const license = { kind: 'unknown', rationale: 'User supplied through the Cutout CLI.' }
  let input
  switch (kind) {
    case '--repo': input = { type: 'repository-scan', root: value, label: value === '.' ? 'project' : value, role: 'implementation', license }; break
    case '--url': input = { type: 'url-descriptor', url: value, role: 'reference', license }; break
    case '--idea': input = { type: 'inline-text', sourceKind: 'idea', title: 'Idea', text: value, role: 'requirement', license }; break
    case '--story': input = { type: 'inline-text', sourceKind: 'story', title: 'Story', text: value, role: 'requirement', license }; break
    case '--file': input = { type: 'local-file-scan', path: value, sourceKind: inferFileKind(value), role: 'reference', license }; break
    default: throw new Error('Use --repo, --url, --idea, --story, or --file for ingestion.')
  }
  return executeControl(projectRoot, { type: 'source.ingest', input }, {
    mode: apply ? 'apply' : 'dry-run',
    ...(apply ? { approvalLeaseId } : {}),
  })
}

function parseApply(args, command) {
  const applyAt = args.indexOf('--apply')
  if (applyAt < 0) return { sourceArgs: args, apply: false, approvalLeaseId: undefined }
  if (args.length !== applyAt + 3 || args[applyAt + 1] !== '--approval-lease' || !args[applyAt + 2]) {
    throw new Error(`Use: ${command} <descriptor> [--apply --approval-lease <lease-id>].`)
  }
  return { sourceArgs: args.slice(0, applyAt), apply: true, approvalLeaseId: args[applyAt + 2] }
}

function inferFileKind(path) {
  const extension = path.split('.').at(-1)?.toLowerCase()
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(extension)) return 'screenshot'
  if (['mp4', 'webm', 'mov'].includes(extension)) return 'video'
  if (['ts', 'tsx', 'js', 'jsx', 'vue', 'svelte', 'css', 'scss', 'sass', 'less', 'html'].includes(extension)) return 'code'
  return 'document'
}

async function exportKit(projectRoot, args) {
  if (args.length === 0 || (args.length === 1 && args[0] === '--dry-run')) {
    return executeControl(projectRoot, { type: 'export.design-kit', format: 'directory' }, { mode: 'dry-run' })
  }
  if (args.length === 3 && args[0] === '--apply' && args[1] === '--approval-lease') {
    const approvalLeaseId = args[2]
    if (!approvalLeaseId) throw new Error('--approval-lease requires a host-issued lease id.')
    return executeControl(projectRoot, { type: 'export.design-kit', format: 'directory' }, {
      mode: 'apply', approvalLeaseId,
    })
  }
  throw new Error('Use: export-kit [--dry-run] or export-kit --apply --approval-lease <lease-id>.')
}

async function exportBrandKit(projectRoot, args) {
  const { input, apply, approvalLeaseId } = parseBrandKitExportArgs(args)
  return executeControl(projectRoot, { type: 'export.brand-kit', input }, apply
    ? { mode: 'apply', approvalLeaseId }
    : { mode: 'dry-run' })
}

function parseBrandKitExportArgs(args) {
  if (args.length < 2 || args[0] !== '--input') {
    throw new Error('Use: export-brand-kit --input <BrandKitInput JSON> [--apply --approval-lease <lease-id>].')
  }
  let input
  try {
    input = JSON.parse(args[1])
  } catch {
    throw new Error('--input must be valid BrandKitInput JSON.')
  }
  if (args.length === 2) return { input, apply: false, approvalLeaseId: undefined }
  if (args.length === 5 && args[2] === '--apply' && args[3] === '--approval-lease' && args[4]) {
    return { input, apply: true, approvalLeaseId: args[4] }
  }
  throw new Error('Use: export-brand-kit --input <BrandKitInput JSON> [--apply --approval-lease <lease-id>].')
}

async function exportStarter(projectRoot, args) {
  const framework = starterFramework(args)
  if (args.length === 2) {
    return executeControl(projectRoot, { type: 'export.starter', framework }, { mode: 'dry-run' })
  }
  return executeControl(projectRoot, { type: 'export.starter', framework }, {
    mode: 'apply', approvalLeaseId: args[4],
  })
}

function starterFramework(args) {
  const validApply = args.length === 5 && args[2] === '--apply' && args[3] === '--approval-lease' && Boolean(args[4])
  if ((args.length !== 2 && !validApply) || args[0] !== '--framework') {
    throw new Error('Use: export-starter --framework <next-app-router|vite-react|nuxt|tanstack-start> [--apply --approval-lease <lease-id>].')
  }
  const framework = args[1]
  if (!['next-app-router', 'vite-react', 'nuxt', 'tanstack-start'].includes(framework)) {
    throw new Error('Starter framework must be next-app-router, vite-react, nuxt, or tanstack-start.')
  }
  return framework
}

async function patch(projectRoot, args) {
  const [kind, ...rest] = args
  if (kind === 'design-markdown') {
    const [mode, ...value] = rest
    if (mode !== '--replace' && mode !== '--append') throw new Error('Use: patch design-markdown --replace <text> or --append <text>.')
    if (value.length === 0) throw new Error('Design markdown patch text is required.')
    return executeControl(projectRoot, {
      type: 'design.patch',
      patches: [{ op: mode === '--append' ? 'append' : 'replace', path: '/designMarkdown', value: value.join(' ') }],
    }, { mode: 'dry-run' })
  }
  if (kind === 'project-name') {
    if (rest.length === 0) throw new Error('Project name patch text is required.')
    return executeControl(projectRoot, {
      type: 'design.patch',
      patches: [{ op: 'replace', path: '/project/name', value: rest.join(' ') }],
    }, { mode: 'dry-run' })
  }
  if (kind === 'tokens') {
    return executeControl(projectRoot, { type: 'tokens.patch', changes: parseTokenAssignments(rest) }, { mode: 'dry-run' })
  }
  throw new Error('Use: patch design-markdown, patch project-name, or patch tokens.')
}

function parseGlobalFlags(argv) {
  let projectRoot = process.cwd()
  const args = []
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--project') {
      const value = argv[++index]
      if (!value) throw new Error('--project requires a directory.')
      projectRoot = value
    } else {
      args.push(argv[index])
    }
  }
  return { projectRoot, args }
}

function parseInclude(args) {
  if (args.length === 0) return ['summary']
  if (args.length !== 2 || args[0] !== '--include') throw new Error('Use: context [--include summary,outcome,run-events].')
  const values = args[1].split(',').filter(Boolean)
  const valid = new Set(['summary', 'outcome', 'run-events'])
  if (values.length === 0 || values.some((value) => !valid.has(value))) throw new Error('Invalid context include value.')
  return values
}

function parseMaterialFilter(args) {
  if (args.length === 0) return undefined
  if (args.length !== 2 || (args[0] !== '--kind' && args[0] !== '--page')) throw new Error('Use: materials [--kind <kind> | --page <id>].')
  return args[0] === '--kind' ? { kind: args[1] } : { pageId: args[1] }
}

function parseScopes(args) {
  const raw = args.length === 0 ? 'design,tokens,materials,outcome' : args.length === 2 && args[0] === '--scope' ? args[1] : null
  if (!raw) throw new Error('Use: validate [--scope design,tokens,materials,outcome].')
  const values = raw.split(',').filter(Boolean)
  const valid = new Set(['design', 'tokens', 'materials', 'outcome'])
  if (values.length === 0 || values.some((value) => !valid.has(value))) throw new Error('Invalid validation scope.')
  return values
}

function printUsage() {
  process.stdout.write(`Cutout headless CLI (no GUI queue, no provider access)\n\nUsage:\n  cutout [--project <dir>] context [--include summary,outcome,run-events]\n  cutout [--project <dir>] materials [--kind <kind> | --page <id>]\n  cutout [--project <dir>] validate [--scope design,tokens,materials,outcome]\n  cutout [--project <dir>] governance preview|validate|report --input <JSON> --policy <JSON>\n  cutout [--project <dir>] patch design-markdown --replace <text>\n  cutout [--project <dir>] patch design-markdown --append <text>\n  cutout [--project <dir>] patch project-name <text>\n  cutout [--project <dir>] patch tokens color.primary=#22c55e\n  cutout [--project <dir>] run start --id <run-id> [--mode create|repair] <intent>\n  cutout [--project <dir>] run get <run-id>\n  cutout [--project <dir>] run events <run-id> [--after <event-id>] [--limit <count>]\n  cutout [--project <dir>] run cancel <run-id> [reason]\n  cutout [--project <dir>] export-kit [--dry-run]\n  cutout [--project <dir>] export-kit --apply --approval-lease <lease-id>\n  cutout [--project <dir>] export-brand-kit --input <BrandKitInput JSON>\n  cutout [--project <dir>] export-brand-kit --input <BrandKitInput JSON> --apply --approval-lease <lease-id>\n  cutout [--project <dir>] export-starter --framework <next-app-router|vite-react>\n  cutout [--project <dir>] export-starter --framework <next-app-router|vite-react> --apply --approval-lease <lease-id>\n  cutout [--project <dir>] ingest --repo <relative-root> [--apply --approval-lease <lease-id>]\n  cutout [--project <dir>] ingest --url <url> [--apply --approval-lease <lease-id>]\n  cutout [--project <dir>] ingest --idea <text> [--apply --approval-lease <lease-id>]\n  cutout [--project <dir>] ingest --story <text> [--apply --approval-lease <lease-id>]\n  cutout [--project <dir>] ingest --file <relative-path> [--apply --approval-lease <lease-id>]\n`)
}

try {
  const result = await main(process.argv.slice(2))
  process.stdout.write(`${JSON.stringify(result)}\n`)
  if (!result.ok) process.exitCode = 1
} catch (error) {
  const message = error instanceof Error ? error.message : 'Invalid command.'
  process.stdout.write(`${JSON.stringify(adapterError('invalid-command', message))}\n`)
  process.exitCode = 1
} finally {
  await closeHeadlessRuntime()
  await closeRegistryRuntime()
}
