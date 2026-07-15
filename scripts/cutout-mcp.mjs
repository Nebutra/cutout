#!/usr/bin/env node
import process from 'node:process'
import { closeHeadlessRuntime, executeControl, executeGovernance } from './cutout-headless.mjs'
import { capabilityStatus, discoveryHandshake, listSkills, readSkill } from './cutout-external-control.mjs'
import { closeRegistryRuntime, registryApplyInstall, registryGet, registryList, registryPlanInstall, registryReceipt } from './cutout-registry.mjs'
import { workflowCompatibility, workflowGet, workflowList } from './cutout-workflows.mjs'

const SERVER_INFO = { name: 'cutout-headless', version: '0.1.0' }
const PROJECT_ROOT = process.env.CUTOUT_PROJECT_ROOT || process.cwd()

const TOOLS = [
  {
    name: 'cutout_controller_handshake',
    description: 'Discover Cutout and bind this MCP process to its host-owned project. The calling Coding Agent remains external and owns its coding sandbox.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { clientName: { type: 'string', maxLength: 80 }, clientVersion: { type: 'string', maxLength: 80 } } },
  },
  {
    name: 'cutout_capabilities_status',
    description: 'Read authoritative controller, operation, integration, approval, and limitation status.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
  },
  {
    name: 'cutout_skills_list',
    description: 'List Cutout product Skills using progressive disclosure.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
  },
  {
    name: 'cutout_skill_read',
    description: 'Read one selected Cutout Skill workflow or deeper reference contract.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['skillId'], properties: { skillId: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' }, section: { type: 'string', enum: ['workflow', 'reference'] } } },
  },
  {
    name: 'cutout_outcome_submit',
    description: 'Submit a user outcome to a durable Cutout run. Attachments are existing material/source ids, never bytes or host paths.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['runId', 'intent'], properties: { runId: { type: 'string', minLength: 1, maxLength: 160 }, mode: { type: 'string', enum: ['create', 'repair'] }, intent: { type: 'string', minLength: 1, maxLength: 20000 }, materialRefs: { type: 'array', maxItems: 100, items: { type: 'string', minLength: 1, maxLength: 160 } }, sourceRefs: { type: 'array', maxItems: 100, items: { type: 'string', minLength: 1, maxLength: 160 } } } },
  },
  {
    name: 'cutout_deliverables_read',
    description: 'Read verified deliverable metadata and hashes without binary payloads or arbitrary files.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { kind: { type: 'string', enum: ['design-system', 'prototype-page', 'cutout-slice', 'design-markdown'] }, pageId: { type: 'string', maxLength: 160 } } },
  },
  {
    name: 'cutout_run_start',
    description: 'Start and durably persist a provider-free Cutout run lifecycle. This records intent and observable events but does not execute a model or paid tool.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['runId', 'mode', 'intent'], properties: { runId: { type: 'string', minLength: 1, maxLength: 160 }, mode: { type: 'string', enum: ['create', 'repair'] }, intent: { type: 'string', minLength: 1, maxLength: 20000 } } },
  },
  {
    name: 'cutout_run_get',
    description: 'Replay and return the authoritative projection for a durable Cutout run.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['runId'], properties: { runId: { type: 'string', minLength: 1, maxLength: 160 } } },
  },
  {
    name: 'cutout_run_events',
    description: 'Read observable run events with a stable event cursor. Hidden reasoning and credentials are never included.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['runId'], properties: { runId: { type: 'string', minLength: 1, maxLength: 160 }, afterEventId: { type: 'string', minLength: 1, maxLength: 160 }, limit: { type: 'integer', minimum: 1, maximum: 1000 } } },
  },
  {
    name: 'cutout_run_cancel',
    description: 'Cooperatively cancel a running Cutout lifecycle and durably record the cancellation.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['runId'], properties: { runId: { type: 'string', minLength: 1, maxLength: 160 }, reason: { type: 'string', minLength: 1, maxLength: 1000 } } },
  },
  {
    name: 'cutout_project_context',
    description: 'Read the sanitized Cutout Design IR summary. This tool never reads arbitrary files, secrets, provider configuration, or the GUI store.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { include: { type: 'array', items: { type: 'string', enum: ['summary', 'outcome', 'run-events'] }, maxItems: 3 } } },
  },
  {
    name: 'cutout_list_materials',
    description: 'List durable design materials and content-addressed artifact metadata without returning binary bytes.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { kind: { type: 'string', enum: ['design-system', 'prototype-page', 'cutout-slice', 'design-markdown'] }, pageId: { type: 'string', maxLength: 160 } } },
  },
  {
    name: 'cutout_validate',
    description: 'Validate Design IR, tokens, material references, and the currently supported outcome checks.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { scope: { type: 'array', items: { type: 'string', enum: ['design', 'tokens', 'materials', 'outcome'] }, minItems: 1, maxItems: 4 } } },
  },
  { name: 'cutout_governance_preview', description: 'Preview deterministic Design Governance coverage and blocking counts for evidence bound to the current Design IR revision.', inputSchema: governanceInputSchema() },
  { name: 'cutout_governance_validate', description: 'Validate project-bound Design Governance evidence and return structured findings without verbose evidence payloads.', inputSchema: governanceInputSchema() },
  { name: 'cutout_governance_report', description: 'Return the full deterministic Design Governance report, measured evidence, and repair suggestions. This is read-only.', inputSchema: governanceInputSchema() },
  {
    name: 'cutout_dry_run_patch',
    description: 'Preview a safe Design IR markdown, project name, or existing token change. This never writes project state.',
    inputSchema: {
      type: 'object', additionalProperties: false,
      required: ['operation'],
      properties: {
        operation: {
          type: 'object', additionalProperties: false, required: ['type'],
          properties: {
            type: { type: 'string', enum: ['design.patch', 'tokens.patch'] },
            patches: { type: 'array', maxItems: 100 },
            changes: { type: 'array', maxItems: 200 },
          },
        },
      },
    },
  },
  {
    name: 'cutout_plan_source_ingest',
    description: 'Preview a controlled Everything Inbox import. Accepts only inline text, a credential-free HTTP(S) URL descriptor, or a relative file/repository scan below the configured project root. It never accepts bytes, absolute paths, commands, or secrets and never writes state.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['input'],
      properties: {
        input: {
          type: 'object', additionalProperties: true,
          description: 'A source.ingest descriptor: inline-text, url-descriptor, local-file-scan, or repository-scan. Include role and license. Scan paths must be relative to the Cutout project root.',
        },
      },
    },
  },
  {
    name: 'cutout_apply_source_ingest',
    description: 'Apply a previously reviewed controlled source import after explicit approval. The host resolves scans below its project root, records source/provenance, and never receives arbitrary file bytes or absolute paths.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['input', 'approvalId'],
      properties: {
        input: { type: 'object', additionalProperties: true },
        approvalId: { type: 'string', minLength: 1, maxLength: 160 },
      },
    },
  },
  {
    name: 'cutout_plan_design_kit_export',
    description: 'Compile a complete, hash-addressed Design Kit file plan. This is dry-run only and never writes files.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
  },
  {
    name: 'cutout_export_design_kit',
    description: 'Write the planned Design Kit only to .cutout/exports/design-kit after explicit approval. No destination path is accepted.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['approvalId'],
      properties: { approvalId: { type: 'string', minLength: 1, maxLength: 160 } },
    },
  },
  {
    name: 'cutout_plan_brand_kit_export',
    description: 'Compile a Brand/VI Kit only from an explicit BrandKitInput whose DesignDocument exactly matches this project. This dry run never writes files or infers brand facts.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['input'],
      properties: { input: { type: 'object', description: 'Complete BrandKitInput: { document, brand }. The document must match the current project DesignDocument.' } },
    },
  },
  {
    name: 'cutout_export_brand_kit',
    description: 'Write the planned Brand/VI Kit only to .cutout/exports/brand-kit after explicit approval. It accepts no destination and rejects inferred or mismatched evidence.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['input', 'approvalId'],
      properties: {
        input: { type: 'object', description: 'Complete BrandKitInput: { document, brand }.' },
        approvalId: { type: 'string', minLength: 1, maxLength: 160 },
      },
    },
  },
  {
    name: 'cutout_plan_starter_export',
    description: 'Compile a hash-addressed StarterPlan from verified Design IR. This dry run never writes files or runs package tools.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['framework'],
      properties: { framework: { type: 'string', enum: ['next-app-router', 'vite-react', 'nuxt', 'tanstack-start'] } },
    },
  },
  {
    name: 'cutout_export_starter',
    description: 'Write a hash-verified StarterPlan only to .cutout/exports/starter after explicit approval. No destination or command is accepted.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['framework', 'approvalId'],
      properties: {
        framework: { type: 'string', enum: ['next-app-router', 'vite-react', 'nuxt', 'tanstack-start'] },
        approvalId: { type: 'string', minLength: 1, maxLength: 160 },
      },
    },
  },
  {
    name: 'cutout_plan_coding_task',
    description: 'Preview a versioned, path-scoped CodingTask through an injected controlled coding backend. The bundled provider-free host returns capability-required instead of simulating code generation.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['operation', 'task'], properties: { operation: { type: 'string', enum: ['coding.execute', 'coding.review', 'coding.repair'] }, task: { type: 'object' } } },
  },
  {
    name: 'cutout_apply_coding_task',
    description: 'Apply a reviewed CodingTask after explicit approval. Only an injected controlled workspace/backend may write allowlisted paths or run named checks.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['operation', 'task', 'approvalId'], properties: { operation: { type: 'string', enum: ['coding.execute', 'coding.review', 'coding.repair'] }, task: { type: 'object' }, approvalId: { type: 'string', minLength: 1, maxLength: 160 } } },
  },
  { name: 'cutout_registry_list', description: 'List verified project registry items without reading arbitrary paths or contacting the network.', inputSchema: { type: 'object', additionalProperties: false, properties: { kind: { type: 'string', enum: ['component','pattern','template','starter','skill','integration-adapter'] }, framework: { type: 'string', maxLength: 80 } } } },
  { name: 'cutout_registry_search', description: 'Search verified project registry metadata by text and exact filters.', inputSchema: { type: 'object', additionalProperties: false, required: ['query'], properties: { query: { type: 'string', minLength: 1, maxLength: 200 }, kind: { type: 'string', enum: ['component','pattern','template','starter','skill','integration-adapter'] }, framework: { type: 'string', maxLength: 80 } } } },
  { name: 'cutout_registry_get', description: 'Read one verified registry item manifest; file bytes and credentials are not returned.', inputSchema: { type: 'object', additionalProperties: false, required: ['itemId'], properties: { itemId: { type: 'string', minLength: 1, maxLength: 160 }, version: { type: 'string', maxLength: 80 } } } },
  { name: 'cutout_registry_plan_install', description: 'Resolve and preview an open-code install diff, including three-way conflicts. This does not write.', inputSchema: { type: 'object', additionalProperties: false, required: ['itemId','framework'], properties: { itemId: { type: 'string', minLength: 1, maxLength: 160 }, version: { type: 'string', maxLength: 80 }, framework: { type: 'string', minLength: 1, maxLength: 80 } } } },
  { name: 'cutout_registry_apply_install', description: 'Re-resolve and apply an approved conflict-free install to controlled project paths, then record installed origins.', inputSchema: { type: 'object', additionalProperties: false, required: ['itemId','framework','approvalId'], properties: { itemId: { type: 'string', minLength: 1, maxLength: 160 }, version: { type: 'string', maxLength: 80 }, framework: { type: 'string', minLength: 1, maxLength: 80 }, approvalId: { type: 'string', minLength: 1, maxLength: 160 } } } },
  { name: 'cutout_registry_install_receipt', description: 'Read a durable install receipt by its opaque plan id.', inputSchema: { type: 'object', additionalProperties: false, required: ['planId'], properties: { planId: { type: 'string', minLength: 1, maxLength: 160 } } } },
  { name: 'cutout_workflow_pack_list', description: 'List repo-native workflow packs without network access.', inputSchema: { type: 'object', additionalProperties: false, properties: {} } },
  { name: 'cutout_workflow_pack_get', description: 'Read one versioned repo-native workflow pack.', inputSchema: { type: 'object', additionalProperties: false, required: ['id'], properties: { id: { type: 'string', minLength: 1, maxLength: 160 }, version: { type: 'string', maxLength: 80 } } } },
  { name: 'cutout_workflow_pack_compatibility', description: 'Check a workflow pack against Cutout version and supplied capabilities.', inputSchema: { type: 'object', additionalProperties: false, required: ['id','cutoutVersion','capabilities'], properties: { id: { type: 'string', minLength: 1, maxLength: 160 }, version: { type: 'string', maxLength: 80 }, cutoutVersion: { type: 'string' }, capabilities: { type: 'array', items: { type: 'string' }, maxItems: 200 } } } },
]

async function handle(method, params) {
  switch (method) {
    case 'initialize':
      return { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: SERVER_INFO }
    case 'notifications/initialized':
      return null
    case 'tools/list':
      return { tools: TOOLS }
    case 'tools/call':
      return callTool(params)
    default:
      throw rpcError(-32601, `Unsupported MCP method: ${method}`)
  }
}

async function callTool(params) {
  if (!params || typeof params !== 'object' || typeof params.name !== 'string') throw rpcError(-32602, 'tools/call requires a tool name.')
  const input = params.arguments ?? {}
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw rpcError(-32602, 'Tool arguments must be an object.')

  let result
  switch (params.name) {
    case 'cutout_controller_handshake':
      result = { ok: true, response: await discoveryHandshake(PROJECT_ROOT, { name: input.clientName, version: input.clientVersion }) }
      break
    case 'cutout_capabilities_status':
      result = { ok: true, response: await capabilityStatus() }
      break
    case 'cutout_skills_list':
      result = { ok: true, response: await listSkills() }
      break
    case 'cutout_skill_read':
      result = await readSkill(input.skillId, input.section ?? 'workflow')
      break
    case 'cutout_outcome_submit': {
      const refs = [...(input.materialRefs ?? []).map((id) => `material:${id}`), ...(input.sourceRefs ?? []).map((id) => `source:${id}`)]
      const intent = refs.length ? `${input.intent}\n\nReferenced Cutout evidence: ${refs.join(', ')}` : input.intent
      result = await executeControl(PROJECT_ROOT, { type: 'run.start', runId: input.runId, mode: input.mode ?? 'create', intent })
      break
    }
    case 'cutout_deliverables_read':
      result = await executeControl(PROJECT_ROOT, { type: 'material.list', filter: materialFilter(input) })
      break
    case 'cutout_run_start':
      result = await executeControl(PROJECT_ROOT, { type: 'run.start', runId: input.runId, mode: input.mode, intent: input.intent })
      break
    case 'cutout_run_get':
      result = await executeControl(PROJECT_ROOT, { type: 'run.get', runId: input.runId })
      break
    case 'cutout_run_events':
      result = await executeControl(PROJECT_ROOT, { type: 'run.events', runId: input.runId, ...(input.afterEventId ? { afterEventId: input.afterEventId } : {}), ...(input.limit ? { limit: input.limit } : {}) })
      break
    case 'cutout_run_cancel':
      result = await executeControl(PROJECT_ROOT, { type: 'run.cancel', runId: input.runId, ...(input.reason ? { reason: input.reason } : {}) })
      break
    case 'cutout_project_context':
      result = await executeControl(PROJECT_ROOT, { type: 'project.context', include: input.include ?? ['summary'] })
      break
    case 'cutout_list_materials':
      result = await executeControl(PROJECT_ROOT, { type: 'material.list', filter: materialFilter(input) })
      break
    case 'cutout_validate':
      result = await executeControl(PROJECT_ROOT, { type: 'validate', scope: input.scope ?? ['design', 'tokens', 'materials', 'outcome'] })
      break
    case 'cutout_governance_preview':
    case 'cutout_governance_validate':
    case 'cutout_governance_report':
      result = await executeGovernance(PROJECT_ROOT, input.input, input.policy, params.name.slice('cutout_governance_'.length))
      break
    case 'cutout_dry_run_patch':
      result = await executeControl(PROJECT_ROOT, input.operation, { mode: 'dry-run' })
      break
    case 'cutout_plan_source_ingest':
      assertSourceDescriptor(input.input)
      result = await executeControl(PROJECT_ROOT, { type: 'source.ingest', input: input.input }, { mode: 'dry-run' })
      break
    case 'cutout_apply_source_ingest':
      assertSourceDescriptor(input.input)
      if (typeof input.approvalId !== 'string' || input.approvalId.length === 0 || input.approvalId.length > 160) {
        throw rpcError(-32602, 'approvalId is required.')
      }
      result = await executeControl(PROJECT_ROOT, { type: 'source.ingest', input: input.input }, {
        mode: 'apply', approval: { id: input.approvalId, grantedAt: Date.now() },
      })
      break
    case 'cutout_plan_design_kit_export':
      result = await executeControl(PROJECT_ROOT, { type: 'export.design-kit', format: 'directory' }, { mode: 'dry-run' })
      break
    case 'cutout_export_design_kit':
      if (typeof input.approvalId !== 'string' || input.approvalId.length === 0 || input.approvalId.length > 160) {
        throw rpcError(-32602, 'approvalId is required.')
      }
      result = await executeControl(PROJECT_ROOT, { type: 'export.design-kit', format: 'directory' }, {
        mode: 'apply', approval: { id: input.approvalId, grantedAt: Date.now() },
      })
      break
    case 'cutout_plan_brand_kit_export':
      if (!input.input || typeof input.input !== 'object' || Array.isArray(input.input)) {
        throw rpcError(-32602, 'input must be a BrandKitInput object.')
      }
      result = await executeControl(PROJECT_ROOT, { type: 'export.brand-kit', input: input.input }, { mode: 'dry-run' })
      break
    case 'cutout_export_brand_kit':
      if (!input.input || typeof input.input !== 'object' || Array.isArray(input.input)) {
        throw rpcError(-32602, 'input must be a BrandKitInput object.')
      }
      if (typeof input.approvalId !== 'string' || input.approvalId.length === 0 || input.approvalId.length > 160) {
        throw rpcError(-32602, 'approvalId is required.')
      }
      result = await executeControl(PROJECT_ROOT, { type: 'export.brand-kit', input: input.input }, {
        mode: 'apply', approval: { id: input.approvalId, grantedAt: Date.now() },
      })
      break
    case 'cutout_plan_starter_export':
      if (!validStarterFramework(input.framework)) throw rpcError(-32602, 'framework must be next-app-router, vite-react, nuxt, or tanstack-start.')
      result = await executeControl(PROJECT_ROOT, { type: 'export.starter', framework: input.framework }, { mode: 'dry-run' })
      break
    case 'cutout_export_starter':
      if (!validStarterFramework(input.framework)) throw rpcError(-32602, 'framework must be next-app-router, vite-react, nuxt, or tanstack-start.')
      if (typeof input.approvalId !== 'string' || input.approvalId.length === 0 || input.approvalId.length > 160) {
        throw rpcError(-32602, 'approvalId is required.')
      }
      result = await executeControl(PROJECT_ROOT, { type: 'export.starter', framework: input.framework }, {
        mode: 'apply', approval: { id: input.approvalId, grantedAt: Date.now() },
      })
      break
    case 'cutout_plan_coding_task':
      assertCodingInput(input)
      result = await executeControl(PROJECT_ROOT, { type: input.operation, task: input.task }, { mode: 'dry-run' })
      break
    case 'cutout_apply_coding_task':
      assertCodingInput(input)
      if (typeof input.approvalId !== 'string' || input.approvalId.length === 0 || input.approvalId.length > 160) throw rpcError(-32602, 'approvalId is required.')
      result = await executeControl(PROJECT_ROOT, { type: input.operation, task: input.task }, { mode: 'apply', approval: { id: input.approvalId, grantedAt: Date.now() } })
      break
    case 'cutout_registry_list': result = { ok: true, response: { items: await registryList(PROJECT_ROOT, { kind: input.kind, framework: input.framework }) } }; break
    case 'cutout_registry_search': result = { ok: true, response: { items: await registryList(PROJECT_ROOT, { query: input.query, kind: input.kind, framework: input.framework }) } }; break
    case 'cutout_registry_get': result = { ok: true, response: await registryGet(PROJECT_ROOT, input.itemId, input.version) }; break
    case 'cutout_registry_plan_install': result = { ok: true, response: await registryPlanInstall(PROJECT_ROOT, input.itemId, input.framework, input.version) }; break
    case 'cutout_registry_apply_install': result = { ok: true, response: await registryApplyInstall(PROJECT_ROOT, input.itemId, input.framework, input.approvalId, input.version) }; break
    case 'cutout_registry_install_receipt': { const receipt = await registryReceipt(PROJECT_ROOT, input.planId); result = receipt ? { ok: true, response: receipt } : { ok: false, error: { code: 'not-found', message: 'Registry install receipt was not found.' } }; break }
    case 'cutout_workflow_pack_list': result={ok:true,response:{packs:await workflowList(PROJECT_ROOT)}};break
    case 'cutout_workflow_pack_get': result={ok:true,response:await workflowGet(PROJECT_ROOT,input.id,input.version)};break
    case 'cutout_workflow_pack_compatibility': {const pack=await workflowGet(PROJECT_ROOT,input.id,input.version);result={ok:true,response:workflowCompatibility(pack,{cutoutVersion:input.cutoutVersion,capabilities:input.capabilities})};break}
    default:
      throw rpcError(-32602, `Unknown Cutout tool: ${params.name}`)
  }
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
    isError: !result.ok,
  }
}

function assertCodingInput(input) {
  if (!['coding.execute', 'coding.review', 'coding.repair'].includes(input.operation)) throw rpcError(-32602, 'operation must be coding.execute, coding.review, or coding.repair.')
  if (!input.task || typeof input.task !== 'object' || Array.isArray(input.task)) throw rpcError(-32602, 'task must be a CodingTask object.')
}

function governanceInputSchema() {
  return { type: 'object', additionalProperties: false, required: ['input', 'policy'], properties: { input: { type: 'object', description: 'GovernanceInput with explicit tokens and measured samples for the bound document/revision.' }, policy: { type: 'object', description: 'Versioned design-governance-policy.v1.' } } }
}

function assertSourceDescriptor(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw rpcError(-32602, 'input must be a source descriptor object.')
  // Reject payload upload aliases before the protocol reaches a filesystem host.
  if ('bytes' in value || 'content' in value || 'file' in value || 'absolutePath' in value || 'command' in value) {
    throw rpcError(-32602, 'Source ingestion accepts descriptors and controlled relative scan paths only.')
  }
}

function validStarterFramework(value) {
  return value === 'next-app-router' || value === 'vite-react' || value === 'nuxt' || value === 'tanstack-start'
}

function materialFilter(input) {
  if ('kind' in input && 'pageId' in input) throw rpcError(-32602, 'Use either kind or pageId, not both.')
  if (typeof input.kind === 'string') return { kind: input.kind }
  if (typeof input.pageId === 'string') return { pageId: input.pageId }
  return undefined
}

function rpcError(code, message) {
  const error = new Error(message)
  error.rpcCode = code
  return error
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

let buffer = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  let newline
  while ((newline = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, newline).trim()
    buffer = buffer.slice(newline + 1)
    if (line) void receive(line)
  }
})
process.stdin.on('end', async () => {
  await closeHeadlessRuntime()
  await closeRegistryRuntime()
})

async function receive(line) {
  let request
  try {
    request = JSON.parse(line)
  } catch {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON-RPC input.' } })
    return
  }
  if (!request || request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
    send({ jsonrpc: '2.0', id: request?.id ?? null, error: { code: -32600, message: 'Invalid JSON-RPC request.' } })
    return
  }
  try {
    const result = await handle(request.method, request.params)
    if ('id' in request) send({ jsonrpc: '2.0', id: request.id, result: result ?? {} })
  } catch (error) {
    if ('id' in request) send({
      jsonrpc: '2.0', id: request.id,
      error: { code: typeof error?.rpcCode === 'number' ? error.rpcCode : -32603, message: error instanceof Error ? error.message.slice(0, 1200) : 'Internal MCP error.' },
    })
  }
}
