import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { lstat, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { main } from '../agent.js'
import { deterministicSeed } from '../lib/contracts.js'
import { buildAttributeIndex, buildCategoryIndex, compactFactsForModel, evidenceBackedCatalogAttributes, normalizeProduct } from '../lib/data.js'
import { inventoryInputs, parsePromptPaths } from '../lib/filesystem.js'
import { fixtureDirectories, mockDashScope } from './helpers.js'
import { validateRehearsal } from '../scripts/validate-rehearsal.js'

const cleanup = []
after(async () => { await Promise.all(cleanup.map((path) => rm(path, { recursive: true, force: true }))) })

test('production path survives 429 polling and publishes exact 11-file closure without duplicate spend', async () => {
  const fixture = await fixtureDirectories(); cleanup.push(fixture.root)
  const mock = await mockDashScope()
  try {
    const code = await main(
      ['--prompt', `Please process the input directory: "${fixture.input}" and write the output directory: "${fixture.output}".`],
      { DASHSCOPE_API_KEY: 'test-secret-key-never-log', DASHSCOPE_BASE_URL: mock.origin, AGENT_LOG_DIR: fixture.logs },
      { allowTestOrigin: true, allowedResultOrigins: new Set([mock.origin]), timing: { pollIntervalMs: 1, sleep: async () => {} } },
    )
    assert.equal(code, 0)
    const names = (await readdir(fixture.output)).sort()
    assert.deepEqual(names, [
      'detail_image_1.png', 'detail_image_2.png', 'detail_image_3.png', 'detail_image_4.png', 'detail_image_5.png',
      'main_image.png', 'product_description_en.md', 'product_description_ko.md', 'product_description_pt.md',
      'product_video.mp4', 'strategy_document.md',
    ])
    assert.deepEqual(mock.counts, {
      text: 1, qa: 7, image: 6, video: 1, polls: 3, posts: 15,
      seeds: mock.counts.seeds, sizes: Array(6).fill('1024*1024'),
      imageSources: mock.counts.imageSources, qaSources: mock.counts.qaSources,
      videoSources: mock.counts.videoSources, maxConcurrentImages: 1,
    })
    const anchor = 'https://media.example.test/products/OFFICIAL-100-front.jpg'
    assert.deepEqual(mock.counts.imageSources[0], [anchor])
    assert.ok(mock.counts.imageSources.every((sources) => sources[0] === anchor))
    assert.ok(mock.counts.qaSources.every((sources) => sources[0] === anchor))
    assert.ok(mock.counts.qaSources.slice(1, 6).every((sources) =>
      sources.length === 3 && sources[1]?.includes('/results/image-1.png')))
    assert.ok(mock.counts.videoSources[0]?.includes('/results/image-1.png'))
    assert.ok(mock.counts.seeds.every((seed) => Number.isInteger(seed) && seed >= 0 && seed <= 2_147_483_647))
    const video = await readFile(join(fixture.output, 'product_video.mp4'))
    assert.equal(video.toString('ascii', 4, 8), 'ftyp')
    const strategy = await readFile(join(fixture.output, 'strategy_document.md'), 'utf8')
    assert.match(strategy, /1440 x 1440px/)
    assert.match(strategy, /product_video\.mp4 used the verified main-image result handle/)
    assert.equal((await validateRehearsal(await (await import('node:fs/promises')).realpath(fixture.output))).status, 'passed')
    const description = await readFile(join(fixture.output, 'product_description_en.md'), 'utf8')
    assert.match(description, /\*\*RED-M\*\* - 颜色: 红色; 尺码: M `offer\.json\/ret\/result\/result\/productSkuInfos\/0\/skuId`/)
    assert.match(description, /材质: 棉 `offer\.json\/ret\/result\/result\/productAttribute\/0\/attrValue`/)
    assert.match(description, /颜色: 红色 `offer\.json\/ret\/result\/result\/productAttribute\/1\/attrValue`/)
    assert.match(description, /main_image\.png: Planned and QA-validated role: Main catalog image/)
    assert.match(description, /detail_image_5\.png: Planned and QA-validated role: Supplementary product presentation/)
    assert.match(description, /product_video\.mp4: Planned and QA-validated role: Stable five-second product presentation/)
    assert.doesNotMatch(description, /Five-second product video/)
    const log = await readFile(join(fixture.logs, 'agent.log'), 'utf8')
    assert.doesNotMatch(log, /test-secret-key-never-log|signature=|remote-video-task-secret/)
  } finally { await mock.close() }
})

test('official aliases keep target leaves and attrId identities distinct', async () => {
  const fixture = await fixtureDirectories(); cleanup.push(fixture.root)
  const info = await lstat(fixture.input)
  const roots = { canonical: fixture.input, resolved: fixture.input, device: info.dev, inode: info.ino }
  const inventory = await inventoryInputs(roots)
  const facts = normalizeProduct(inventory.product)
  assert.equal(facts.productId.value, 'OFFICIAL-100')
  assert.equal(facts.category.value, '9301181')
  assert.deepEqual(facts.identityAnchor, {
    url: 'https://media.example.test/products/OFFICIAL-100-front.jpg',
    pointer: '/ret/result/result/productImage/images/0',
    role: 'product-image',
  })
  assert.deepEqual(facts.imageReferences, [
    { url: 'https://media.example.test/products/OFFICIAL-100-front.jpg', pointer: '/ret/result/result/productImage/images/0', role: 'product-image' },
    { url: 'https://media.example.test/products/OFFICIAL-100-back.jpg', pointer: '/ret/result/result/productImage/images/1', role: 'product-image' },
    { url: 'https://media.example.test/products/OFFICIAL-100-description.jpg', pointer: '/ret/result/result/description', role: 'description-image' },
  ])
  assert.deepEqual(compactFactsForModel(facts), {
    productId: 'OFFICIAL-100', sourcePlatform: '1688', title: '红色棉质女装上衣', sourceCategory: '9301181',
    productAttributes: [{ key: '材质', value: '棉' }, { key: '颜色', value: '红色' }], skuCount: 1, sourceMediaCount: 3,
  })
  const categories = buildCategoryIndex(inventory.categories)
  assert.equal(categories.byId.get('29072').leaf, false)
  assert.equal(categories.byId.get('29073').leaf, true)
  const attributes = buildAttributeIndex(inventory.attributes, categories)
  assert.equal(attributes.definitions.filter((entry) => entry.categoryId === '29073' && entry.key === '颜色').length, 2)
  assert.equal(attributes.definitions.some((entry) => entry.attrId === 'ignored'), false)
  const backed = evidenceBackedCatalogAttributes(facts, attributes, '29073')
  assert.ok(backed.some((entry) => entry.attrId === 'attr-color-primary'))
  assert.ok(!backed.some((entry) => entry.attrId === 'attr-color-secondary'))
})

test('one rejected image repairs only its role and retains passing sibling artifacts', async () => {
  const fixture = await fixtureDirectories(); cleanup.push(fixture.root)
  const mock = await mockDashScope({ failQaRole: 'Material and texture detail' })
  try {
    const code = await main(
      ['--prompt', `Input directory: "${fixture.input}" Output directory: "${fixture.output}"`],
      { DASHSCOPE_API_KEY: 'repair-test-key', DASHSCOPE_BASE_URL: mock.origin, AGENT_LOG_DIR: fixture.logs },
      { allowTestOrigin: true, allowedResultOrigins: new Set([mock.origin]), timing: { pollIntervalMs: 1, sleep: async () => {} } },
    )
    assert.equal(code, 0)
    assert.equal(mock.counts.image, 7)
    assert.equal(mock.counts.qa, 8)
    assert.equal(mock.counts.posts, 17)
    assert.equal((await readdir(fixture.output)).length, 11)
    const strategy = await readFile(join(fixture.output, 'strategy_document.md'), 'utf8')
    assert.match(strategy, /Repair\/restart events: detail_image_2\.png/)
    const files = await Promise.all(['main_image.png', 'detail_image_1.png', 'detail_image_3.png', 'detail_image_4.png', 'detail_image_5.png']
      .map((name) => readFile(join(fixture.output, name))))
    assert.equal(new Set(files.map((bytes) => createHash('sha256').update(bytes).digest('hex'))).size, 5)
  } finally { await mock.close() }
})

test('one sibling-consistency rejection repairs only that detail while retaining source fidelity', async () => {
  const fixture = await fixtureDirectories(); cleanup.push(fixture.root)
  const mock = await mockDashScope({ failSiblingQaRole: 'Construction and finish detail' })
  try {
    assert.equal(await main(
      ['--prompt', `Input directory: "${fixture.input}" Output directory: "${fixture.output}"`],
      { DASHSCOPE_API_KEY: 'sibling-repair-key', DASHSCOPE_BASE_URL: mock.origin, AGENT_LOG_DIR: fixture.logs },
      { allowTestOrigin: true, allowedResultOrigins: new Set([mock.origin]), timing: { pollIntervalMs: 1, sleep: async () => {} } },
    ), 0)
    assert.equal(mock.counts.image, 7)
    assert.equal(mock.counts.qa, 8)
    assert.equal(mock.counts.imageSources.find((sources) => sources.length === 3)?.[0],
      'https://media.example.test/products/OFFICIAL-100-front.jpg')
    assert.match(await readFile(join(fixture.output, 'strategy_document.md'), 'utf8'),
      /Repair\/restart events: detail_image_3\.png/)
  } finally { await mock.close() }
})

test('rejected main image repairs under main-image physical constraints without applying sales-claim filters to QA instructions', async () => {
  const fixture = await fixtureDirectories(); cleanup.push(fixture.root)
  const mock = await mockDashScope({ failQaRole: 'Main catalog image', qaRepairPrompt: 'Restore authentic product construction without inventing a certification.' })
  try {
    const code = await main(
      ['--prompt', `Input directory: "${fixture.input}" Output directory: "${fixture.output}"`],
      { DASHSCOPE_API_KEY: 'main-repair-key', DASHSCOPE_BASE_URL: mock.origin, AGENT_LOG_DIR: fixture.logs },
      { allowTestOrigin: true, allowedResultOrigins: new Set([mock.origin]), timing: { pollIntervalMs: 1, sleep: async () => {} } },
    )
    assert.equal(code, 0)
    assert.equal(mock.counts.image, 7)
    assert.equal(mock.counts.qa, 8)
    const strategy = await readFile(join(fixture.output, 'strategy_document.md'), 'utf8')
    assert.match(strategy, /Repair\/restart events: main_image\.png/)
  } finally { await mock.close() }
})

test('one surplus planned image prompt is ignored without changing the six-role output contract', async () => {
  const fixture = await fixtureDirectories(); cleanup.push(fixture.root)
  const mock = await mockDashScope({ extraImagePrompt: true })
  try {
    const code = await main(
      ['--prompt', `Input directory: "${fixture.input}" Output directory: "${fixture.output}"`],
      { DASHSCOPE_API_KEY: 'surplus-prompt-key', DASHSCOPE_BASE_URL: mock.origin, AGENT_LOG_DIR: fixture.logs },
      { allowTestOrigin: true, allowedResultOrigins: new Set([mock.origin]), timing: { pollIntervalMs: 1, sleep: async () => {} } },
    )
    assert.equal(code, 0)
    assert.equal(mock.counts.image, 6)
    assert.equal((await readdir(fixture.output)).filter((name) => /^(?:main|detail)_image/.test(name)).length, 6)
  } finally { await mock.close() }
})

test('one invalid localized plan is repaired before any media node starts', async () => {
  const fixture = await fixtureDirectories(); cleanup.push(fixture.root)
  const mock = await mockDashScope({ cjkEnglishFirst: true })
  try {
    assert.equal(await main(
      ['--prompt', `Input directory: "${fixture.input}" Output directory: "${fixture.output}"`],
      { DASHSCOPE_API_KEY: 'text-repair-key', DASHSCOPE_BASE_URL: mock.origin, AGENT_LOG_DIR: fixture.logs },
      { allowTestOrigin: true, allowedResultOrigins: new Set([mock.origin]), timing: { pollIntervalMs: 1, sleep: async () => {} } },
    ), 0)
    assert.deepEqual({ text: mock.counts.text, image: mock.counts.image, video: mock.counts.video }, { text: 2, image: 6, video: 1 })
    assert.equal((await readdir(fixture.output)).length, 11)
  } finally { await mock.close() }
})

test('a second invalid localized plan fails closed before media spend', async () => {
  const fixture = await fixtureDirectories(); cleanup.push(fixture.root)
  const mock = await mockDashScope({ cjkEnglishAlways: true })
  try {
    await assert.rejects(main(
      ['--prompt', `Input directory: "${fixture.input}" Output directory: "${fixture.output}"`],
      { DASHSCOPE_API_KEY: 'text-repair-failure-key', DASHSCOPE_BASE_URL: mock.origin, AGENT_LOG_DIR: fixture.logs },
      { allowTestOrigin: true, allowedResultOrigins: new Set([mock.origin]), timing: { pollIntervalMs: 1, sleep: async () => {} } },
    ), /CJK script leakage/)
    assert.deepEqual({ text: mock.counts.text, image: mock.counts.image, video: mock.counts.video }, { text: 2, image: 0, video: 0 })
    assert.equal((await readdir(fixture.output)).filter((name) => !name.startsWith('.')).length, 0)
  } finally { await mock.close() }
})

test('credential-shaped model copy fails closed before media spend', async () => {
  const fixture = await fixtureDirectories(); cleanup.push(fixture.root)
  const mock = await mockDashScope({ credentialTextAlways: true })
  try {
    await assert.rejects(main(
      ['--prompt', `Input directory: "${fixture.input}" Output directory: "${fixture.output}"`],
      { DASHSCOPE_API_KEY: 'copy-safety-key', DASHSCOPE_BASE_URL: mock.origin, AGENT_LOG_DIR: fixture.logs },
      { allowTestOrigin: true, allowedResultOrigins: new Set([mock.origin]), timing: { pollIntervalMs: 1, sleep: async () => {} } },
    ), /credential-shaped or signed-URL data/)
    assert.deepEqual({ text: mock.counts.text, image: mock.counts.image, video: mock.counts.video },
      { text: 1, image: 0, video: 0 })
  } finally { await mock.close() }
})

test('serialized detail production fails before a sibling paid image node can start', async () => {
  const fixture = await fixtureDirectories(); cleanup.push(fixture.root)
  const mock = await mockDashScope({
    failQaTransportRole: 'Front and silhouette detail',
    slowImageNumber: 3,
    slowImageMs: 50,
  })
  try {
    await assert.rejects(main(
      ['--prompt', `Input directory: "${fixture.input}" Output directory: "${fixture.output}"`],
      { DASHSCOPE_API_KEY: 'fail-fast-key', DASHSCOPE_BASE_URL: mock.origin, AGENT_LOG_DIR: fixture.logs },
      { allowTestOrigin: true, allowedResultOrigins: new Set([mock.origin]), timing: { pollIntervalMs: 1, sleep: async () => {} } },
    ), /transport failed/)
    assert.deepEqual({ image: mock.counts.image, qa: mock.counts.qa, video: mock.counts.video, posts: mock.counts.posts }, {
      image: 2,
      qa: 2,
      video: 0,
      posts: 5,
    })
    assert.equal((await readdir(fixture.output)).filter((name) => !name.startsWith('.')).length, 0)
  } finally { await mock.close() }
})

test('process restart refuses an ambiguous paid image submit without another network request', async () => {
  const fixture = await fixtureDirectories(); cleanup.push(fixture.root)
  const mock = await mockDashScope({ failImageTransportAt: 1 })
  const args = ['--prompt', `Input directory: "${fixture.input}" Output directory: "${fixture.output}"`]
  const environment = { DASHSCOPE_API_KEY: 'ambiguous-image-key', DASHSCOPE_BASE_URL: mock.origin, AGENT_LOG_DIR: fixture.logs }
  const options = { allowTestOrigin: true, allowedResultOrigins: new Set([mock.origin]), timing: { pollIntervalMs: 1, sleep: async () => {} } }
  try {
    await assert.rejects(main(args, environment, options), /transport failed for main/)
    assert.deepEqual({ text: mock.counts.text, image: mock.counts.image, posts: mock.counts.posts }, { text: 1, image: 1, posts: 2 })

    await assert.rejects(main(args, environment, options), /prior main request may have been charged/)
    assert.deepEqual({ text: mock.counts.text, image: mock.counts.image, posts: mock.counts.posts }, { text: 1, image: 1, posts: 2 })
    assert.deepEqual(await readdir(fixture.output), ['.qianwen-agent-work'])
  } finally { await mock.close() }
})

test('process restart refuses an ambiguous paid text submit without another network request', async () => {
  const fixture = await fixtureDirectories(); cleanup.push(fixture.root)
  const mock = await mockDashScope({ failTextTransportAt: 1 })
  const args = ['--prompt', `Input directory: "${fixture.input}" Output directory: "${fixture.output}"`]
  const environment = { DASHSCOPE_API_KEY: 'ambiguous-text-key', DASHSCOPE_BASE_URL: mock.origin, AGENT_LOG_DIR: fixture.logs }
  const options = { allowTestOrigin: true, allowedResultOrigins: new Set([mock.origin]), timing: { pollIntervalMs: 1, sleep: async () => {} } }
  try {
    await assert.rejects(main(args, environment, options), /transport failed for structured-plan/)
    assert.deepEqual({ text: mock.counts.text, image: mock.counts.image, posts: mock.counts.posts },
      { text: 1, image: 0, posts: 1 })
    await assert.rejects(main(args, environment, options), /prior text request may have been charged/)
    assert.deepEqual({ text: mock.counts.text, image: mock.counts.image, posts: mock.counts.posts },
      { text: 1, image: 0, posts: 1 })
  } finally { await mock.close() }
})

test('completed media checkpoint refuses a symlink replacement before any new paid request', async () => {
  const fixture = await fixtureDirectories(); cleanup.push(fixture.root)
  const mock = await mockDashScope({ failQaTransportRole: 'Front and silhouette detail' })
  const args = ['--prompt', `Input directory: "${fixture.input}" Output directory: "${fixture.output}"`]
  const environment = { DASHSCOPE_API_KEY: 'checkpoint-symlink-key', DASHSCOPE_BASE_URL: mock.origin, AGENT_LOG_DIR: fixture.logs }
  const options = { allowTestOrigin: true, allowedResultOrigins: new Set([mock.origin]), timing: { pollIntervalMs: 1, sleep: async () => {} } }
  try {
    await assert.rejects(main(args, environment, options), /transport failed/)
    const paidPosts = mock.counts.posts
    const stagedMain = join(fixture.output, '.qianwen-agent-work', 'stage', 'main_image.png')
    const replacement = join(fixture.root, 'replacement.png')
    await writeFile(replacement, await readFile(stagedMain))
    await rm(stagedMain)
    await symlink(replacement, stagedMain)
    await assert.rejects(main(args, environment, options), /bounded regular file/)
    assert.equal(mock.counts.posts, paidPosts)
  } finally { await mock.close() }
})

test('process restart refuses a caller-tampered structured plan checkpoint', async () => {
  const fixture = await fixtureDirectories(); cleanup.push(fixture.root)
  const mock = await mockDashScope({ failImageTransportAt: 1 })
  const args = ['--prompt', `Input directory: "${fixture.input}" Output directory: "${fixture.output}"`]
  const environment = { DASHSCOPE_API_KEY: 'checkpoint-auth-key', DASHSCOPE_BASE_URL: mock.origin, AGENT_LOG_DIR: fixture.logs }
  const options = { allowTestOrigin: true, allowedResultOrigins: new Set([mock.origin]), timing: { pollIntervalMs: 1, sleep: async () => {} } }
  try {
    await assert.rejects(main(args, environment, options), /transport failed for main/)
    const paidPosts = mock.counts.posts
    const checkpointPath = join(fixture.output, '.qianwen-agent-work', 'checkpoints', 'structured-plan.json')
    const checkpoint = JSON.parse(await readFile(checkpointPath, 'utf8'))
    checkpoint.result.locales.en.title = 'Caller-authored replacement title'
    await writeFile(checkpointPath, `${JSON.stringify(checkpoint)}\n`)
    await assert.rejects(main(args, environment, options), /authentication failed/)
    assert.equal(mock.counts.posts, paidPosts)
  } finally { await mock.close() }
})

test('prompt parsing, seeds and symlink input fail closed', async () => {
  assert.throws(() => parsePromptPaths('input directory: relative output directory: /tmp/out'), /absolute/)
  assert.throws(() => parsePromptPaths('input directory: /tmp/same output directory: /tmp/same'), /different/)
  assert.deepEqual(parsePromptPaths('请处理输入文件夹路径为：/tmp/in，输出文件夹路径为：/tmp/out。'), { inputRoot: '/tmp/in', outputRoot: '/tmp/out' })
  assert.ok([0, 1, 2, 2_147_483_647].every((value) => deterministicSeed('fixture', String(value)) >= 0 && deterministicSeed('fixture', String(value)) <= 2_147_483_647))
  const fixture = await fixtureDirectories(); cleanup.push(fixture.root)
  await symlink(join(fixture.input, 'offer.json'), join(fixture.input, 'linked.json'))
  const info = await lstat(fixture.input)
  await assert.rejects(inventoryInputs({ canonical: fixture.input, resolved: fixture.input, device: info.dev, inode: info.ino }), /Symlinks are forbidden/)

  assert.throws(() => normalizeProduct({ path: 'description-only.json', sha256: 'a'.repeat(64), bytes: Buffer.from(JSON.stringify({
    productId: 'description-only', sourcePlatform: '1688', productUrl: 'https://detail.example.test/description-only',
    title: 'Description-only product', description: '<img src="https://media.example.test/description-only.jpg">',
  })) }), /explicit product image identity anchor/)
})
