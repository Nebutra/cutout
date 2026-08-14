import { constants as fsConstants } from 'node:fs'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { lstat, mkdir, open, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path'
import { AgentError, LIMITS, exactOutputName, invariant, sha256, stableJson } from './contracts.js'

const CREDENTIAL_PATTERN = /(?:\bBearer\s+[A-Za-z0-9._~+/-]{12,}|\bsk-[A-Za-z0-9_-]{16,}|\bAKIA[A-Z0-9]{16}\b|(?:api[_-]?key|secret[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9._~+/-]{12,})/i

export function deriveCheckpointKey(apiKey, planHash) {
  invariant(typeof apiKey === 'string' && apiKey.trim() && typeof planHash === 'string' && /^[a-f0-9]{64}$/.test(planHash),
    'invalid-checkpoint', 'Checkpoint authentication binding is unavailable.')
  return createHash('sha256').update('qianwen-checkpoint-v1\0').update(apiKey).update('\0').update(planHash).digest()
}

function checkpointMac(value, key) {
  invariant(Buffer.isBuffer(key) && key.length === 32, 'invalid-checkpoint', 'Checkpoint authentication key is unavailable.')
  return createHmac('sha256', key).update(stableJson(value)).digest('hex')
}

function verifyCheckpointRecord(record, key, label) {
  invariant(record && typeof record === 'object' && !Array.isArray(record), 'invalid-checkpoint', `${label} is malformed.`)
  const { mac, ...value } = record
  invariant(typeof mac === 'string' && /^[a-f0-9]{64}$/.test(mac), 'invalid-checkpoint', `${label} authentication is missing.`)
  const actual = Buffer.from(mac, 'hex')
  const expected = Buffer.from(checkpointMac(value, key), 'hex')
  invariant(timingSafeEqual(actual, expected), 'invalid-checkpoint', `${label} authentication failed.`)
  return value
}

async function readBoundedLocalFile(path, maximumBytes, label) {
  const info = await lstat(path)
  invariant(info.isFile() && !info.isSymbolicLink() && info.size > 0 && info.size <= maximumBytes,
    'invalid-checkpoint', `${label} must be a bounded regular file.`)
  const handle = await open(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0))
  try {
    const before = await handle.stat()
    invariant(before.isFile() && before.dev === info.dev && before.ino === info.ino && before.size === info.size,
      'path-identity-changed', `${label} changed before reading.`)
    const bytes = Buffer.alloc(before.size)
    let offset = 0
    while (offset < bytes.length) {
      const result = await handle.read(bytes, offset, bytes.length - offset, offset)
      invariant(result.bytesRead > 0, 'invalid-checkpoint', `${label} ended unexpectedly.`)
      offset += result.bytesRead
    }
    const after = await handle.stat()
    invariant(after.dev === before.dev && after.ino === before.ino && after.size === before.size
      && after.mtimeMs === before.mtimeMs,
    'path-identity-changed', `${label} changed while reading.`)
    return bytes
  } finally { await handle.close() }
}

export function parsePromptPaths(prompt) {
  invariant(typeof prompt === 'string' && Buffer.byteLength(prompt) <= LIMITS.maximumPromptBytes,
    'invalid-prompt', 'The prompt is missing or exceeds the byte limit.')
  invariant(!prompt.includes('\0'), 'invalid-prompt', 'The prompt contains an invalid character.')

  const marker = (kind) => kind === 'input'
    ? '(?:input(?:\\s+(?:directory|folder|path))?|source(?:\\s+(?:directory|folder|path))?|输入文件夹路径|输入目录路径|输入(?:文件夹|目录|路径)?)'
    : '(?:output(?:\\s+(?:directory|folder|path))?|destination(?:\\s+(?:directory|folder|path))?|输出文件夹路径|输出目录路径|输出(?:文件夹|目录|路径)?|保存(?:到|至))'
  const extract = (kind) => {
    const expression = new RegExp(`${marker(kind)}\\s*(?:(?:is|at|=|:|：|为|是|到|至)\\s*){0,2}(?:["“”']([^"“”'\\r\\n]+)["“”']|([^\\s,，;；。]+))`, 'iu')
    const match = expression.exec(prompt)
    const raw = (match?.[1] ?? match?.[2] ?? '').trim().replace(/[。；;,，]+$/u, '')
    invariant(raw.length > 0 && Buffer.byteLength(raw) <= LIMITS.maximumPathBytes,
      'invalid-prompt', `The ${kind} directory was not found in the prompt.`)
    invariant(isAbsolute(raw), 'invalid-prompt', `The ${kind} directory must be an absolute path.`)
    return resolve(raw)
  }
  const inputRoot = extract('input')
  const outputRoot = extract('output')
  invariant(inputRoot !== outputRoot, 'invalid-prompt', 'Input and output directories must be different.')
  return { inputRoot, outputRoot }
}

async function assertNoSymlinkPathComponents(path, label, includeLeaf) {
  const normalized = resolve(path)
  const root = parse(normalized).root
  const parts = relative(root, normalized).split(sep).filter(Boolean)
  const maximum = includeLeaf ? parts.length : Math.max(0, parts.length - 1)
  let current = root
  for (const part of parts.slice(0, maximum)) {
    current = join(current, part)
    const info = await lstat(current).catch(() => undefined)
    invariant(info?.isDirectory() && !info.isSymbolicLink(),
      'invalid-path', `${label} path contains an unavailable or symlinked directory component.`)
  }
}

async function assertDirectoryRoot(path, label, createLeaf = false) {
  const resolved = resolve(path)
  await assertNoSymlinkPathComponents(resolved, label, false)
  let info
  try {
    info = await lstat(resolved)
  } catch (error) {
    if (!createLeaf || error?.code !== 'ENOENT') throw new AgentError('invalid-path', `${label} directory is unavailable.`)
    const parent = dirname(resolved)
    const parentInfo = await lstat(parent).catch(() => undefined)
    invariant(parentInfo?.isDirectory() && !parentInfo.isSymbolicLink(), 'invalid-path', `${label} parent must be a regular directory.`)
    await mkdir(resolved, { mode: 0o700 })
    info = await lstat(resolved)
  }
  await assertNoSymlinkPathComponents(resolved, label, true)
  invariant(info.isDirectory() && !info.isSymbolicLink(), 'invalid-path', `${label} must be a non-symlink directory.`)
  const canonical = await realpath(resolved)
  return { resolved, canonical, device: info.dev, inode: info.ino }
}

function overlaps(left, right) {
  const relation = relative(left, right)
  return relation === '' || (!relation.startsWith(`..${sep}`) && relation !== '..' && !isAbsolute(relation))
}

export async function authorizeRoots({ inputRoot, outputRoot, logRoot }) {
  const input = await assertDirectoryRoot(inputRoot, 'Input')
  const output = await assertDirectoryRoot(outputRoot, 'Output', true)
  const logs = await assertDirectoryRoot(logRoot, 'Log', true)
  invariant(!overlaps(input.canonical, output.canonical) && !overlaps(output.canonical, input.canonical),
    'invalid-path', 'Input and output directories may not overlap.')
  invariant(!overlaps(input.canonical, logs.canonical) && !overlaps(logs.canonical, input.canonical),
    'invalid-path', 'Input and log directories may not overlap.')
  invariant(!overlaps(output.canonical, logs.canonical) && !overlaps(logs.canonical, output.canonical),
    'invalid-path', 'Output and log directories may not overlap.')
  return { input, output, logs }
}

async function assertRootIdentity(root, label) {
  const info = await lstat(root.resolved).catch(() => undefined)
  invariant(info?.isDirectory() && !info.isSymbolicLink() && info.dev === root.device && info.ino === root.inode,
    'path-identity-changed', `${label} directory identity changed during the run.`)
}

async function readBoundedRegularFile(root, relativePath, maximumBytes) {
  invariant(relativePath && !isAbsolute(relativePath) && !relativePath.split('/').some((part) => part === '' || part === '.' || part === '..'),
    'invalid-input', 'Input inventory produced an unsafe relative path.')
  const target = join(root.canonical, ...relativePath.split('/'))
  const info = await lstat(target)
  invariant(info.isFile() && !info.isSymbolicLink(), 'invalid-input', `Input must be a regular file: ${relativePath}`)
  invariant(info.size > 0 && info.size <= maximumBytes, 'invalid-input', `Input file size is invalid: ${relativePath}`)
  const handle = await open(target, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0))
  try {
    const before = await handle.stat()
    invariant(before.isFile() && before.dev === info.dev && before.ino === info.ino, 'path-identity-changed', `Input changed before reading: ${relativePath}`)
    const bytes = Buffer.alloc(before.size)
    let offset = 0
    while (offset < bytes.length) {
      const result = await handle.read(bytes, offset, bytes.length - offset, offset)
      invariant(result.bytesRead > 0, 'invalid-input', `Input ended unexpectedly: ${relativePath}`)
      offset += result.bytesRead
    }
    const after = await handle.stat()
    invariant(after.size === before.size && after.mtimeMs === before.mtimeMs && after.ino === before.ino,
      'path-identity-changed', `Input changed while reading: ${relativePath}`)
    return bytes
  } finally {
    await handle.close()
  }
}

export async function inventoryInputs(inputRoot) {
  await assertRootIdentity(inputRoot, 'Input')
  const found = []
  const walk = async (directory, parts, depth) => {
    invariant(depth <= 8, 'invalid-input', 'Input directory nesting exceeds the limit.')
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      invariant(entry.name !== '.' && entry.name !== '..' && !entry.name.includes('\0'), 'invalid-input', 'Input entry name is invalid.')
      const relativePath = [...parts, entry.name].join('/')
      const target = join(directory, entry.name)
      const info = await lstat(target)
      invariant(!entry.isSymbolicLink() && !info.isSymbolicLink(), 'invalid-input', `Symlinks are forbidden in input: ${relativePath}`)
      if (entry.isDirectory()) await walk(target, [...parts, entry.name], depth + 1)
      else {
        invariant(entry.isFile() && entry.name.toLowerCase().endsWith('.json'), 'invalid-input', `Only JSON input files are allowed: ${relativePath}`)
        found.push(relativePath)
        invariant(found.length <= LIMITS.maximumInputFiles, 'invalid-input', 'Input contains too many files.')
      }
    }
  }
  await walk(inputRoot.canonical, [], 0)
  invariant(found.length === 3, 'invalid-input', 'Input must contain exactly one product JSON and the two clothing catalogs.')
  const categoryPaths = found.filter((path) => basename(path).toLowerCase() === 'clothing_categories.json')
  const attributePaths = found.filter((path) => basename(path).toLowerCase() === 'clothing_attributes.json')
  invariant(categoryPaths.length === 1 && attributePaths.length === 1, 'invalid-input', 'Both exact clothing catalog filenames are required once.')
  const productPaths = found.filter((path) => path !== categoryPaths[0] && path !== attributePaths[0])
  invariant(productPaths.length === 1, 'invalid-input', 'Exactly one product JSON is required.')
  const records = []
  let totalBytes = 0
  for (const path of found) {
    const bytes = await readBoundedRegularFile(inputRoot, path, LIMITS.maximumInputFileBytes)
    totalBytes += bytes.length
    invariant(totalBytes <= LIMITS.maximumInputBytes, 'invalid-input', 'Input aggregate exceeds the byte limit.')
    invariant(!CREDENTIAL_PATTERN.test(bytes.toString('utf8')),
      'credential-shaped-input', 'Credential-shaped content is forbidden in task input.')
    records.push({ path, bytes, sha256: sha256(bytes) })
  }
  await assertRootIdentity(inputRoot, 'Input')
  const byPath = new Map(records.map((record) => [record.path, record]))
  return {
    product: byPath.get(productPaths[0]),
    categories: byPath.get(categoryPaths[0]),
    attributes: byPath.get(attributePaths[0]),
    digest: sha256(stableJson(records.map(({ path, sha256: hash }) => ({ path, sha256: hash })))),
  }
}

export async function assertOutputAvailable(outputRoot) {
  await assertRootIdentity(outputRoot, 'Output')
  const entries = await readdir(outputRoot.canonical)
  const foreign = entries.filter((name) => name !== '.qianwen-agent-work')
  const hasWorkspace = entries.includes('.qianwen-agent-work')
  invariant((!hasWorkspace && foreign.length === 0)
    || (hasWorkspace && foreign.length <= 11 && foreign.every(exactOutputName)),
  'output-not-empty', 'Output directory must be empty or contain only a recoverable interrupted publication.')
}

export function createLogger(logRoot, apiKey) {
  const file = join(logRoot.canonical, 'agent.log')
  let tail = Promise.resolve()
  const redact = (value) => String(value)
    .replaceAll(apiKey || '__missing_api_key__', '[REDACTED]')
    .replace(CREDENTIAL_PATTERN, '[REDACTED]')
    .replace(/https:\/\/[^\s?]+\?[^\s]+/g, '[SIGNED_URL_REDACTED]')
  return Object.freeze({
    file,
    write(event, fields = {}) {
      const safe = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, redact(value)]))
      const line = `${JSON.stringify({ time: new Date().toISOString(), event, ...safe })}\n`
      tail = tail.then(async () => {
        await assertRootIdentity(logRoot, 'Log')
        const handle = await open(file, fsConstants.O_WRONLY | fsConstants.O_APPEND | fsConstants.O_CREAT | (fsConstants.O_NOFOLLOW ?? 0), 0o600)
        try {
          const info = await handle.stat()
          invariant(info.isFile(), 'invalid-log-path', 'Agent log must be a regular file.')
          await handle.writeFile(line, 'utf8')
        } finally { await handle.close() }
        await assertRootIdentity(logRoot, 'Log')
      })
      return tail
    },
    flush() { return tail },
  })
}

export async function createWorkspace(outputRoot, planHash, apiKey) {
  const checkpointKey = deriveCheckpointKey(apiKey, planHash)
  await assertRootIdentity(outputRoot, 'Output')
  const workRoot = join(outputRoot.canonical, '.qianwen-agent-work')
  await mkdir(workRoot, { recursive: true, mode: 0o700 })
  const info = await lstat(workRoot)
  invariant(info.isDirectory() && !info.isSymbolicLink(), 'invalid-output', 'Work directory must be a regular directory.')
  const bindingPath = join(workRoot, 'binding.json')
  let binding
  try {
    const bytes = await readBoundedLocalFile(bindingPath, LIMITS.maximumJsonResponseBytes, 'Checkpoint binding')
    binding = verifyCheckpointRecord(JSON.parse(bytes.toString('utf8')), checkpointKey, 'Checkpoint binding')
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      if (error instanceof AgentError) throw error
      throw new AgentError('invalid-checkpoint', 'Checkpoint binding is malformed.')
    }
  }
  if (binding) {
    invariant(binding.schema === 'qianwen.checkpoint-binding.v1' && binding.planHash === planHash,
      'stale-checkpoint', 'Existing checkpoints belong to a different input plan.')
  } else {
    const value = { schema: 'qianwen.checkpoint-binding.v1', planHash }
    await atomicWrite(bindingPath, Buffer.from(`${JSON.stringify({ ...value, mac: checkpointMac(value, checkpointKey) })}\n`))
  }
  const stageRoot = join(workRoot, 'stage')
  const checkpointRoot = join(workRoot, 'checkpoints')
  await mkdir(stageRoot, { recursive: true, mode: 0o700 })
  await mkdir(checkpointRoot, { recursive: true, mode: 0o700 })
  const identities = { work: { dev: info.dev, inode: info.ino } }
  for (const [path, label, key] of [[stageRoot, 'Stage', 'stage'], [checkpointRoot, 'Checkpoint', 'checkpoint']]) {
    const directory = await lstat(path)
    invariant(directory.isDirectory() && !directory.isSymbolicLink(), 'invalid-output', `${label} directory must be a non-symlink directory.`)
    identities[key] = { dev: directory.dev, inode: directory.ino }
  }
  const workspace = { workRoot, stageRoot, checkpointRoot, checkpointKey, identities }
  const interrupted = (await readdir(outputRoot.canonical)).filter((name) => name !== '.qianwen-agent-work')
  invariant(interrupted.length <= 11 && interrupted.every(exactOutputName),
    'invalid-publication', 'Interrupted publication contains an invalid output name.')
  for (const name of interrupted) {
    await assertRootIdentity(outputRoot, 'Output')
    const source = join(outputRoot.canonical, name)
    const target = join(stageRoot, name)
    const [sourceInfo, targetInfo] = await Promise.all([
      lstat(source).catch(() => undefined), lstat(target).catch(() => undefined),
    ])
    invariant(sourceInfo?.isFile() && !sourceInfo.isSymbolicLink() && !targetInfo,
      'invalid-publication', `Interrupted publication cannot be recovered safely: ${name}`)
    await rename(source, target)
  }
  await assertRootIdentity(outputRoot, 'Output')
  await assertWorkspaceIdentity(workspace)
  return workspace
}

export async function assertWorkspaceIdentity(workspace) {
  invariant(workspace?.identities && Buffer.isBuffer(workspace.checkpointKey),
    'path-identity-changed', 'Workspace identity is unavailable.')
  for (const [path, key] of [[workspace.workRoot, 'work'], [workspace.stageRoot, 'stage'], [workspace.checkpointRoot, 'checkpoint']]) {
    const info = await lstat(path).catch(() => undefined)
    const expected = workspace.identities[key]
    invariant(info?.isDirectory() && !info.isSymbolicLink() && expected
      && info.dev === expected.dev && info.ino === expected.inode,
    'path-identity-changed', `Workspace ${key} directory identity changed.`)
  }
}

export async function atomicWrite(path, bytes) {
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`
  await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 })
  await rename(temporary, path)
}

export async function readCheckpoint(workspace, id) {
  invariant(/^[a-z0-9-]+$/.test(id), 'invalid-checkpoint', 'Checkpoint id is invalid.')
  try {
    await assertWorkspaceIdentity(workspace)
    const path = join(workspace.checkpointRoot, `${id}.json`)
    const bytes = await readBoundedLocalFile(path, LIMITS.maximumJsonResponseBytes, `Checkpoint ${id}`)
    const value = verifyCheckpointRecord(JSON.parse(bytes.toString('utf8')), workspace.checkpointKey, `Checkpoint ${id}`)
    invariant(value?.schema === 'qianwen.node-checkpoint.v1' && value.id === id, 'invalid-checkpoint', `Checkpoint is malformed: ${id}`)
    await assertWorkspaceIdentity(workspace)
    return value
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    if (error instanceof AgentError) throw error
    throw new AgentError('invalid-checkpoint', `Checkpoint is malformed: ${id}`)
  }
}

export async function writeCheckpoint(workspace, id, body) {
  invariant(/^[a-z0-9-]+$/.test(id) && body && typeof body === 'object' && !Array.isArray(body),
    'invalid-checkpoint', 'Checkpoint write is invalid.')
  const value = { ...body, schema: 'qianwen.node-checkpoint.v1', id }
  const record = { ...value, mac: checkpointMac(value, workspace.checkpointKey) }
  await assertWorkspaceIdentity(workspace)
  await atomicWrite(join(workspace.checkpointRoot, `${id}.json`), Buffer.from(`${JSON.stringify(record)}\n`))
  await assertWorkspaceIdentity(workspace)
  return value
}

export async function publishExact(outputRoot, workspace, names) {
  await assertRootIdentity(outputRoot, 'Output')
  await assertWorkspaceIdentity(workspace)
  const unique = new Set(names)
  invariant(unique.size === names.length && names.every(exactOutputName), 'invalid-publication', 'Publication manifest contains invalid output names.')
  for (const name of names) {
    const source = join(workspace.stageRoot, name)
    const info = await lstat(source).catch(() => undefined)
    invariant(info?.isFile() && !info.isSymbolicLink(), 'invalid-publication', `Staged output is missing: ${name}`)
  }
  const moved = []
  try {
    for (const name of names.sort()) {
      await assertWorkspaceIdentity(workspace)
      await assertRootIdentity(outputRoot, 'Output')
      await rename(join(workspace.stageRoot, name), join(outputRoot.canonical, name))
      moved.push(name)
    }
    await assertWorkspaceIdentity(workspace)
    await assertRootIdentity(outputRoot, 'Output')
    const intermediateEntries = (await readdir(outputRoot.canonical)).sort()
    const expectedIntermediate = ['.qianwen-agent-work', ...names].sort()
    invariant(intermediateEntries.length === expectedIntermediate.length
      && intermediateEntries.every((name, index) => name === expectedIntermediate[index]),
    'invalid-publication', 'Publication intermediate closure is not exact.')
  } catch (error) {
    for (const name of moved.reverse()) {
      await rename(join(outputRoot.canonical, name), join(workspace.stageRoot, name)).catch(() => {})
    }
    throw error
  }
  await assertWorkspaceIdentity(workspace)
  await assertRootIdentity(outputRoot, 'Output')
  await rm(workspace.workRoot, { recursive: true })
  const finalEntries = (await readdir(outputRoot.canonical)).sort()
  invariant(finalEntries.length === names.length && finalEntries.every((name, index) => name === [...names].sort()[index]),
    'invalid-publication', 'Published output closure is not exact.')
}
