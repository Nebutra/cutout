import http from 'node:http'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import readline from 'node:readline'

const timeout = (promise, milliseconds, label) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), milliseconds)),
])

const root = await mkdtemp(path.join(os.tmpdir(), 'cutout-codex-zero-tools-'))
const codexHome = path.join(root, 'home')
const cwd = path.join(root, 'context')
await mkdir(codexHome)
await mkdir(cwd)
await writeFile(path.join(cwd, '.git'), 'gitdir: nowhere\n')

let captured
const server = http.createServer(async (request, response) => {
  let raw = ''
  for await (const chunk of request) raw += chunk
  captured = JSON.parse(raw)
  const events = [
    { type: 'response.created', response: { id: 'resp-cutout-proof' } },
    {
      type: 'response.output_item.done',
      item: {
        type: 'message',
        role: 'assistant',
        id: 'msg-cutout-proof',
        content: [{ type: 'output_text', text: '{"kind":"planning-result","summary":"ok"}' }],
      },
    },
    {
      type: 'response.completed',
      response: {
        id: 'resp-cutout-proof',
        usage: {
          input_tokens: 0,
          input_tokens_details: null,
          output_tokens: 0,
          output_tokens_details: null,
          total_tokens: 0,
        },
      },
    },
  ]
  response.writeHead(200, { 'content-type': 'text/event-stream' })
  for (const event of events) {
    response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
  }
  response.end()
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port

await writeFile(path.join(codexHome, 'config.toml'), `
model = "gpt-5.4-mini"
model_provider = "cutout-capture"
approval_policy = "never"
sandbox_mode = "read-only"
web_search = "disabled"
include_permissions_instructions = false
include_apps_instructions = false
include_collaboration_mode_instructions = false
include_environment_context = false

[analytics]
enabled = false

[model_providers.cutout-capture]
name = "Cutout capture"
base_url = "http://127.0.0.1:${port}/v1"
env_key = "CUTOUT_CAPTURE_KEY"
wire_api = "responses"
requires_openai_auth = false
request_max_retries = 0
stream_max_retries = 0

[tools.experimental_request_user_input]
enabled = false

[tools.update_plan]
enabled = false

[agents]
enabled = false

[orchestrator.skills]
enabled = false

[orchestrator.mcp]
enabled = false

[skills]
include_instructions = false

[skills.bundled]
enabled = false

[features]
shell_tool = false
unified_exec = false
shell_snapshot = false
deferred_executor = false
code_mode = false
code_mode_host = false
code_mode_only = false
web_search_request = false
web_search_cached = false
standalone_web_search = false
memories = false
hooks = false
request_permissions_tool = false
multi_agent = false
multi_agent_v2 = false
apps = false
enable_mcp_apps = false
deferred_tool_world_state = false
non_prefixed_mcp_tool_names = false
tool_suggest = false
plugins = false
executor_capability_discovery = false
in_app_browser = false
browser_use = false
browser_use_full_cdp_access = false
browser_use_external = false
computer_use = false
remote_plugin = false
plugin_sharing = false
image_generation = false
skill_mcp_dependency_install = false
skill_search = false
default_mode_request_user_input = false
goals = false
token_budget = false
current_time_reminder = false
artifact = false
workspace_dependencies = false
`)

const binary = process.env.CODEX_PROBE_BINARY
if (!binary || !path.isAbsolute(binary)) {
  throw new Error('CODEX_PROBE_BINARY must name an absolute reviewed Codex 0.146 binary')
}
const child = spawn(
  binary,
  ['app-server', '--stdio', '--strict-config'],
  {
    cwd,
    env: {
      PATH: process.env.PATH,
      HOME: root,
      CODEX_HOME: codexHome,
      CUTOUT_CAPTURE_KEY: 'capture-only',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  },
)

let stderr = ''
child.stderr.on('data', (chunk) => { stderr += chunk })
const lines = readline.createInterface({ input: child.stdout })
let nextId = 1
const pending = new Map()
let resolveTerminal
const terminal = new Promise((resolve) => { resolveTerminal = resolve })

lines.on('line', (line) => {
  const value = JSON.parse(line)
  if (value.id !== undefined && pending.has(value.id)) {
    pending.get(value.id)(value)
    pending.delete(value.id)
  }
  if (value.method === 'turn/completed') resolveTerminal(value.params)
})

const send = (method, params) => new Promise((resolve) => {
  const id = nextId++
  pending.set(id, resolve)
  child.stdin.write(`${JSON.stringify({ method, id, params })}\n`)
})

try {
  const initialized = await timeout(send('initialize', {
    clientInfo: {
      name: 'cutout_zero_tools_probe',
      title: 'Cutout Zero Tools Probe',
      version: '0.1.16',
    },
    capabilities: { experimentalApi: true },
  }), 15_000, 'initialize')
  if (initialized.error) throw new Error(JSON.stringify(initialized.error))
  child.stdin.write(`${JSON.stringify({ method: 'initialized', params: {} })}\n`)

  const thread = await timeout(send('thread/start', {
    cwd,
    approvalPolicy: 'never',
    sandbox: 'read-only',
    environments: [],
    dynamicTools: [],
    baseInstructions: 'Return only the requested JSON.',
    developerInstructions: 'Do not use tools.',
  }), 15_000, 'thread/start')
  if (thread.error) throw new Error(JSON.stringify(thread.error))

  const turn = await timeout(send('turn/start', {
    threadId: thread.result.thread.id,
    input: [{
      type: 'text',
      text: 'Return an object with kind planning-result and summary ok.',
      textElements: [],
    }],
    outputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'summary'],
      properties: {
        kind: { const: 'planning-result' },
        summary: { type: 'string' },
      },
    },
    environments: [],
    approvalPolicy: 'never',
    sandboxPolicy: { type: 'readOnly', networkAccess: false },
  }), 15_000, 'turn/start')
  if (turn.error) throw new Error(JSON.stringify(turn.error))

  const completed = await timeout(terminal, 15_000, 'turn/completed')
  const evidence = {
    toolCount: Array.isArray(captured?.tools) ? captured.tools.length : null,
    toolNames: Array.isArray(captured?.tools)
      ? captured.tools.map((tool) => tool.name ?? tool.function?.name ?? tool.type)
      : null,
    terminalStatus: completed?.turn?.status ?? null,
    outputFormat: captured?.text?.format?.type ?? captured?.response_format?.type ?? null,
  }
  console.log(JSON.stringify(evidence, null, 2))
  if (evidence.toolCount !== 0 || evidence.terminalStatus !== 'completed') process.exitCode = 1
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  if (stderr) console.error(stderr)
  process.exitCode = 1
} finally {
  child.kill('SIGKILL')
  server.close()
}
