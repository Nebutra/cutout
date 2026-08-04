import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const codexBin = process.env.CUTOUT_CODEX_PROBE_BIN
if (!codexBin) {
  throw new Error('CUTOUT_CODEX_PROBE_BIN is required')
}
const realAuthFile = process.env.CUTOUT_CODEX_PROBE_REAL_AUTH_FILE

const requests = []
const server = createServer((request, response) => {
  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8')
    let body
    try {
      body = JSON.parse(raw)
    } catch {
      response.writeHead(400).end()
      return
    }
    requests.push({ method: request.method, url: request.url, body })

    const responseId = `resp-${requests.length}`
    const messageId = `msg-${requests.length}`
    const events = [
      { type: 'response.created', response: { id: responseId } },
      {
        type: 'response.output_item.done',
        item: {
          type: 'message',
          role: 'assistant',
          id: messageId,
          content: [{ type: 'output_text', text: '{"ok":true}' }],
        },
      },
      {
        type: 'response.completed',
        response: {
          id: responseId,
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
    const payload = events
      .map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
      .join('')
    response.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    })
    response.end(payload)
  })
})

if (!realAuthFile) {
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
}
const address = server.address()
const capturePort = address && typeof address !== 'string' ? address.port : null

const root = await mkdtemp(join(tmpdir(), 'cutout-codex-zero-tools-'))
const codexHome = join(root, 'codex-home')
const stagedRoot = join(root, 'context')
await mkdir(codexHome)
await mkdir(stagedRoot)
await writeFile(join(stagedRoot, 'intent.json'), '{"intent":"probe"}\n', 'utf8')
if (realAuthFile) {
  await symlink(realAuthFile, join(codexHome, 'auth.json'))
}

const disabledFeatures = [
  'apps',
  'auth_elicitation',
  'browser_use',
  'browser_use_external',
  'browser_use_full_cdp_access',
  'code_mode',
  'code_mode_host',
  'computer_use',
  'goals',
  'guardian_approval',
  'hooks',
  'image_generation',
  'in_app_browser',
  'multi_agent',
  'multi_agent_v2',
  'network_proxy',
  'plugins',
  'remote_plugin',
  'request_permissions_tool',
  'shell_snapshot',
  'shell_tool',
  'skill_mcp_dependency_install',
  'skill_search',
  'standalone_web_search',
  'tool_call_mcp_elicitation',
  'tool_suggest',
  'unified_exec',
  'workspace_dependencies',
]

const captureRootConfig = capturePort === null ? '' : `
model = "gpt-5.4"
model_provider = "capture"
`

const captureProviderConfig = capturePort === null ? '' : `
[model_providers.capture]
name = "Cutout zero-tools capture"
base_url = "http://127.0.0.1:${capturePort}/v1"
env_key = "CUTOUT_PROBE_API_KEY"
wire_api = "responses"
supports_websockets = false
request_max_retries = 0
stream_max_retries = 0
`

const config = `
${captureRootConfig}
approval_policy = "never"
sandbox_mode = "read-only"
web_search = "disabled"

[agents]
enabled = false

[skills]
include_instructions = false

[orchestrator.skills]
enabled = false

[orchestrator.mcp]
enabled = false

[tools.experimental_request_user_input]
enabled = false

[tools.update_plan]
enabled = false

[features]
${disabledFeatures.map(feature => `${feature} = false`).join('\n')}
${captureProviderConfig}
`
await writeFile(join(codexHome, 'config.toml'), config, 'utf8')

const child = spawn(codexBin, ['app-server', '--stdio', '--strict-config'], {
  cwd: stagedRoot,
  env: {
    PATH: process.env.PATH ?? '',
    CODEX_HOME: codexHome,
    ...(realAuthFile ? {} : { CUTOUT_PROBE_API_KEY: 'cutout-probe-not-a-secret' }),
    RUST_BACKTRACE: '0',
  },
  stdio: ['pipe', 'pipe', 'pipe'],
})

let stderr = ''
child.stderr.setEncoding('utf8')
child.stderr.on('data', chunk => {
  stderr += chunk
})

const waiters = new Map()
const notifications = []
const observedMethods = new Set()
const observedErrors = []
let stdoutBuffer = ''
child.stdout.setEncoding('utf8')
child.stdout.on('data', chunk => {
  stdoutBuffer += chunk
  for (;;) {
    const newline = stdoutBuffer.indexOf('\n')
    if (newline < 0) break
    const line = stdoutBuffer.slice(0, newline).trim()
    stdoutBuffer = stdoutBuffer.slice(newline + 1)
    if (!line) continue
    const message = JSON.parse(line)
    if (Object.hasOwn(message, 'id') && waiters.has(message.id)) {
      waiters.get(message.id)(message)
      waiters.delete(message.id)
    } else if (message.method) {
      observedMethods.add(message.method)
      if (message.method === 'turn/completed') notifications.push(message)
      if (message.method === 'error') {
        observedErrors.push({
          codexErrorInfo: message.params?.error?.codexErrorInfo ?? null,
          willRetry: message.params?.willRetry === true,
        })
      }
    }
  }
})

let nextId = 1
function rpc(method, params) {
  const id = nextId++
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      waiters.delete(id)
      reject(new Error(`timed out waiting for ${method}`))
    }, 20_000)
    waiters.set(id, message => {
      clearTimeout(timer)
      if (message.error) reject(new Error(`${method}: ${JSON.stringify(message.error)}`))
      else resolve(message.result)
    })
  })
}

function notify(method, params) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`)
}

async function waitForNotification(method) {
  const deadline = Date.now() + (realAuthFile ? 180_000 : 20_000)
  while (Date.now() < deadline) {
    const index = notifications.findIndex(message => message.method === method)
    if (index >= 0) return notifications.splice(index, 1)[0]
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error(
    `timed out waiting for notification ${method}; observed methods: ${[...observedMethods].sort().join(', ')}; sanitized errors: ${JSON.stringify(observedErrors)}`,
  )
}

try {
  await rpc('initialize', {
    clientInfo: { name: 'cutout-zero-tools-probe', version: '1.0.0' },
    capabilities: { experimentalApi: true },
  })
  notify('initialized')

  const started = await rpc('thread/start', {
    ...(realAuthFile ? {} : { model: 'gpt-5.4', modelProvider: 'capture' }),
    cwd: stagedRoot,
    approvalPolicy: 'never',
    sandbox: 'read-only',
    environments: [],
    dynamicTools: [],
    ephemeral: true,
    baseInstructions: 'Return only the requested structured response.',
  })
  await rpc('turn/start', {
    threadId: started.thread.id,
    input: [{ type: 'text', text: 'Return {"ok":true}.', textElements: [] }],
    outputSchema: {
      type: 'object',
      required: ['ok'],
      properties: { ok: { const: true } },
      additionalProperties: false,
    },
    approvalPolicy: 'never',
    environments: [],
    cwd: stagedRoot,
  })
  await waitForNotification('turn/completed')

  if (realAuthFile) {
    process.stdout.write(`${JSON.stringify({
      authenticatedTurnCompleted: true,
      isolatedCodexHome: true,
      isolatedContextRoot: true,
      authFileReferencedWithoutCopy: true,
    }, null, 2)}\n`)
  } else {
    const modelRequests = requests.filter(request => request.url?.endsWith('/responses'))
    if (modelRequests.length !== 1) {
      throw new Error(`expected one model request, received ${modelRequests.length}`)
    }
    const tools = modelRequests[0].body.tools
    if (!Array.isArray(tools)) {
      throw new Error('captured request did not contain a tools array')
    }
    if (tools.length !== 0) {
      throw new Error(`expected zero tools, received ${JSON.stringify(tools)}`)
    }
    process.stdout.write(`${JSON.stringify({
      codexHome,
      stagedRoot,
      requestCount: modelRequests.length,
      toolCount: tools.length,
      outputSchema: modelRequests[0].body.text?.format?.type ?? null,
    }, null, 2)}\n`)
  }
} catch (error) {
  throw new Error(`${error.message}\napp-server stderr:\n${stderr}`)
} finally {
  child.kill('SIGTERM')
  if (!realAuthFile) server.close()
}
