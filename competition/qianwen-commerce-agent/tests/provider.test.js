import assert from 'node:assert/strict'
import { mkdir, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { DashScopeClient } from '../lib/provider.js'
import { LIMITS } from '../lib/contracts.js'
import { main } from '../agent.js'
import { fixtureDirectories } from './helpers.js'
import { createLogger, createWorkspace } from '../lib/filesystem.js'

const cleanup = []
after(async () => { await Promise.all(cleanup.map((path) => rm(path, { recursive: true, force: true }))) })
const logger = { write: async () => {} }

test('invalid result origin fails after one paid POST and cannot duplicate spend', async () => {
  const fixture = await fixtureDirectories(); cleanup.push(fixture.root)
  const workspace = { stageRoot: join(fixture.output, 'stage'), checkpointRoot: join(fixture.output, 'checkpoints') }
  await Promise.all([mkdir(workspace.stageRoot), mkdir(workspace.checkpointRoot)])
  let posts = 0
  const client = new DashScopeClient({
    apiKey: 'test-key', baseUrl: 'http://127.0.0.1:8787', deadline: Date.now() + 120_000,
    workspace, planHash: '1'.repeat(64), logger, allowTestOrigin: true, allowedResultOrigins: new Set(['http://127.0.0.1:8787']),
    fetchImpl: async () => {
      posts += 1
      return new Response(JSON.stringify({ output: { choices: [{ message: { content: [{ image: 'https://evil.example.test/result.png' }] } }] } }), { status: 200, headers: { 'content-type': 'application/json' } })
    },
  })
  const request = { prompt: 'preserve product', sourceUrls: ['https://media.example.test/source.jpg'], size: '1024*1024', seed: 9 }
  await assert.rejects(client.image('main', request), /origin is not allowed/)
  await assert.rejects(client.image('main', request), /already submitted/)
  assert.equal(posts, 1)
})

test('provider response without content length is cancelled at the streaming byte limit', async () => {
  const fixture = await fixtureDirectories(); cleanup.push(fixture.root)
  const workspace = { stageRoot: join(fixture.output, 'stage'), checkpointRoot: join(fixture.output, 'checkpoints') }
  await Promise.all([mkdir(workspace.stageRoot), mkdir(workspace.checkpointRoot)])
  let cancelled = false
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(LIMITS.maximumJsonResponseBytes))
      controller.enqueue(new Uint8Array(1))
    },
    cancel() { cancelled = true },
  })
  const client = new DashScopeClient({
    apiKey: 'test-key', baseUrl: 'http://127.0.0.1:8787', deadline: Date.now() + 120_000,
    workspace, planHash: '0'.repeat(64), logger, allowTestOrigin: true,
    fetchImpl: async () => new Response(stream, { status: 200 }),
  })
  await assert.rejects(client.structuredText('structured-plan', 'system', 'prompt'), /byte limit/)
  assert.equal(cancelled, true)
})

test('only exact DashScope regional and acceleration result origins are accepted', async () => {
  for (const [index, resultUrl] of [
    'https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/result.png?token=opaque',
    'https://dashscope-a717.oss-accelerate.aliyuncs.com/result.png?token=opaque',
  ].entries()) {
    const fixture = await fixtureDirectories(); cleanup.push(fixture.root)
    const workspace = { stageRoot: join(fixture.output, 'stage'), checkpointRoot: join(fixture.output, 'checkpoints') }
    await Promise.all([mkdir(workspace.stageRoot), mkdir(workspace.checkpointRoot)])
    const client = new DashScopeClient({
      apiKey: 'test-key', baseUrl: 'http://127.0.0.1:8787', deadline: Date.now() + 120_000,
      workspace, planHash: String(index + 2).repeat(64), logger, allowTestOrigin: true,
      fetchImpl: async () => new Response(JSON.stringify({ output: { choices: [{ message: { content: [{ image: resultUrl }] } }] } }), { status: 200 }),
    })
    await assert.doesNotReject(client.image(`main-${index}`, {
      prompt: 'preserve product', sourceUrls: ['https://media.example.test/source.jpg'], size: '1024*1024', seed: index,
    }))
  }

  for (const resultUrl of [
    'https://dashscope-result-bj.oss.aliyuncs.com/result.png',
    'https://dashscope-result-bj.evil.aliyuncs.com/result.png',
    'https://dashscope-result-bj.oss-accelerate.aliyuncs.com/result.png',
    'https://dashscope-a-717.oss-accelerate.aliyuncs.com/result.png',
    'https://not-dashscope-result.oss-accelerate.aliyuncs.com/result.png',
  ]) {
    const fixture = await fixtureDirectories(); cleanup.push(fixture.root)
    const workspace = { stageRoot: join(fixture.output, 'stage'), checkpointRoot: join(fixture.output, 'checkpoints') }
    await Promise.all([mkdir(workspace.stageRoot), mkdir(workspace.checkpointRoot)])
    const client = new DashScopeClient({
      apiKey: 'test-key', baseUrl: 'http://127.0.0.1:8787', deadline: Date.now() + 120_000,
      workspace, planHash: 'f'.repeat(64), logger, allowTestOrigin: true,
      fetchImpl: async () => new Response(JSON.stringify({ output: { choices: [{ message: { content: [{ image: resultUrl }] } }] } }), { status: 200 }),
    })
    await assert.rejects(client.image(`bad-${cleanup.length}`, {
      prompt: 'preserve product', sourceUrls: ['https://media.example.test/source.jpg'], size: '1024*1024', seed: 0,
    }), /origin is not allowed/)
  }
})

test('failed production leaves no official output filename', async () => {
  const fixture = await fixtureDirectories(); cleanup.push(fixture.root)
  await assert.rejects(main(
    ['--prompt', `Input directory: "${fixture.input}" Output directory: "${fixture.output}"`],
    { DASHSCOPE_API_KEY: 'failure-key', DASHSCOPE_BASE_URL: 'http://127.0.0.1:8787', AGENT_LOG_DIR: fixture.logs },
    { allowTestOrigin: true, allowedResultOrigins: new Set(['http://127.0.0.1:8787']), fetchImpl: async () => new Response(JSON.stringify({ code: 'Denied' }), { status: 403, headers: { 'content-type': 'application/json' } }) },
  ), /HTTP 403/)
  const { readdir } = await import('node:fs/promises')
  assert.deepEqual(await readdir(fixture.output), ['.qianwen-agent-work'])
})

test('workspace and log symlink components are rejected', async () => {
  const fixture = await fixtureDirectories(); cleanup.push(fixture.root)
  const external = join(fixture.root, 'external')
  await mkdir(external)
  await symlink(external, join(fixture.output, '.qianwen-agent-work'))
  const outputInfo = await (await import('node:fs/promises')).lstat(fixture.output)
  await assert.rejects(createWorkspace({ resolved: fixture.output, canonical: fixture.output, device: outputInfo.dev, inode: outputInfo.ino }, 'a'.repeat(64), 'test-key'), /non-symlink|regular directory/)

  await symlink(join(external, 'captured.log'), join(fixture.logs, 'agent.log'))
  const logInfo = await (await import('node:fs/promises')).lstat(fixture.logs)
  const logger = createLogger({ resolved: fixture.logs, canonical: fixture.logs, device: logInfo.dev, inode: logInfo.ino }, 'secret')
  await assert.rejects(logger.write('test_event'), /ELOOP|symbolic link|symlink/i)

  const bindingFixture = await fixtureDirectories(); cleanup.push(bindingFixture.root)
  const workRoot = join(bindingFixture.output, '.qianwen-agent-work')
  await mkdir(workRoot)
  await symlink(join(external, 'binding.json'), join(workRoot, 'binding.json'))
  const bindingOutputInfo = await (await import('node:fs/promises')).lstat(bindingFixture.output)
  await assert.rejects(createWorkspace({
    resolved: bindingFixture.output, canonical: bindingFixture.output,
    device: bindingOutputInfo.dev, inode: bindingOutputInfo.ino,
  }, 'b'.repeat(64), 'test-key'), /bounded regular file/)
})
