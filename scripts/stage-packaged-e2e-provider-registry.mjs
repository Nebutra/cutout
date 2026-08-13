import {
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const MAX_REGISTRY_BYTES = 1024 * 1024
export const PACKAGED_E2E_PROVIDER_DISCOVERY_FILE = 'provider-discovery.json'
export const PACKAGED_E2E_IMAGE_MODELS = new Set([
  'qwen-image-3.0',
  'qwen-image-3.0-pro',
])
const PROVIDER_KINDS = new Set([
  'anthropic',
  'openai',
  'google',
  'openai-compatible',
  'cc-switch',
  'dashscope',
  'deepseek',
  'zhipu',
  'moonshot',
  'volcengine',
  'siliconflow',
  'openrouter',
  'together',
  'groq',
  'fireworks',
  'xai',
  'mistral',
  'ollama',
  'vllm',
  'lm-studio',
])
const WIRE_PROTOCOLS = new Set([
  'responses',
  'chat-completions',
  'anthropic-messages',
  'google-generate-content',
])
const ALLOWED_FIELDS = new Set([
  'id',
  'kind',
  'label',
  'baseUrl',
  'wireProtocol',
  'defaultModel',
  'enabled',
])

function boundedText(value, maximum) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maximum
    && ![...value].some((character) => {
      const code = character.codePointAt(0)
      return code !== undefined && (code < 32 || code === 127)
    })
}

function supportsWireProtocol(kind, protocol) {
  if (kind === 'openai' || kind === 'cc-switch') {
    return protocol === 'responses' || protocol === 'chat-completions'
  }
  if (kind === 'anthropic') return protocol === 'anthropic-messages'
  if (kind === 'google') return protocol === 'google-generate-content'
  if (kind === 'openai-compatible') return WIRE_PROTOCOLS.has(protocol)
  return protocol === 'chat-completions'
}

function safeBaseUrl(value) {
  if (value === undefined) return true
  if (!boundedText(value, 2048)) return false
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:')
      && !url.username
      && !url.password
      && !url.search
      && !url.hash
  } catch {
    return false
  }
}

function safeProvider(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Object.keys(value)
  return keys.length <= ALLOWED_FIELDS.size
    && keys.every((key) => ALLOWED_FIELDS.has(key))
    && boundedText(value.id, 120)
    && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value.id)
    && PROVIDER_KINDS.has(value.kind)
    && boundedText(value.label, 160)
    && safeBaseUrl(value.baseUrl)
    && WIRE_PROTOCOLS.has(value.wireProtocol)
    && supportsWireProtocol(value.kind, value.wireProtocol)
    && boundedText(value.defaultModel, 200)
    && value.enabled === true
}

export async function stageProviderRegistry(source, destination, imageModel) {
  let metadata
  try {
    metadata = await lstat(source)
  } catch (error) {
    if (error?.code === 'ENOENT') return 0
    throw error
  }
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > MAX_REGISTRY_BYTES) {
    return 0
  }
  const parsed = JSON.parse(await readFile(source, 'utf8'))
  if (!Array.isArray(parsed) || parsed.length > 64) return 0
  if (imageModel !== undefined && !PACKAGED_E2E_IMAGE_MODELS.has(imageModel)) return 0
  const providers = parsed.filter(safeProvider).map((provider) =>
    imageModel !== undefined && provider.kind === 'dashscope'
      ? { ...provider, defaultModel: imageModel }
      : provider)
  if (providers.length === 0 || new Set(providers.map(({ id }) => id)).size !== providers.length) {
    return 0
  }

  await mkdir(dirname(destination), { recursive: true, mode: 0o700 })
  const temporary = `${destination}.${process.pid}.tmp`
  try {
    await writeFile(temporary, `${JSON.stringify(providers, null, 2)}\n`, { mode: 0o600 })
    await rename(temporary, destination)
  } finally {
    await rm(temporary, { force: true })
  }
  return providers.length
}

export function providerRegistryPaths(home) {
  const applicationSupport = join(home, 'Library', 'Application Support')
  return {
    source: join(applicationSupport, 'com.nebutra.cutout', 'providers.json'),
    destination: join(
      applicationSupport,
      'com.nebutra.cutout.packaged-e2e',
      PACKAGED_E2E_PROVIDER_DISCOVERY_FILE,
    ),
  }
}

async function main() {
  const { source, destination } = providerRegistryPaths(homedir())
  const count = await stageProviderRegistry(
    source,
    destination,
    process.env.CUTOUT_PACKAGED_E2E_IMAGE_MODEL,
  )
  process.stdout.write(`Staged ${count} non-secret local Provider record(s) for packaged E2E.\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
