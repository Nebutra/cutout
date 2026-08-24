import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { lstat, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { main } from '../agent.js'
import { deterministicSeed } from '../lib/contracts.js'
import { buildAttributeIndex, buildCategoryIndex, catalogCandidates, compactFactsForModel, evidenceBackedCatalogAttributes, normalizeProduct, planImageRoleSources } from '../lib/data.js'
import { inventoryInputs, parsePromptPaths } from '../lib/filesystem.js'
import {
  assertLocalizedDocumentScriptClosure, assertLocalizedFactsScriptClosure, decodeFactTranslations, factLocalizationInventory,
  indexFactTranslations, localizeFact,
} from '../lib/localization.js'
import { fixtureDirectories, mockDashScope } from './helpers.js'
import { validateRehearsal } from '../scripts/validate-rehearsal.js'

const cleanup = []
after(async () => { await Promise.all(cleanup.map((path) => rm(path, { recursive: true, force: true }))) })

const officialPrompt = (input, output) => `## 任务目标
读取 \`${input}/\` 目录下目标商品的全部信息文件，提取指定内容，按规范生成输出文件并保存至 \`${output}/\`。

输入目录：\`${input}/\`

输出目录：\`${output}/\``

test('production path survives 429 polling and publishes exact 11-file closure without duplicate Provider execution', async () => {
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
      imageSources: mock.counts.imageSources, imagePrompts: mock.counts.imagePrompts,
      qaSources: mock.counts.qaSources, qaPrompts: mock.counts.qaPrompts, qaLabels: mock.counts.qaLabels,
      videoSources: mock.counts.videoSources, localizationFactIds: mock.counts.localizationFactIds,
      maxConcurrentImages: 1,
    })
    const anchor = 'https://media.example.test/products/OFFICIAL-100-front.jpg'
    assert.deepEqual(mock.counts.imageSources[0], [anchor])
    assert.ok(mock.counts.imageSources.every((sources) => sources[0] === anchor))
    assert.ok(mock.counts.qaSources.every((sources) => sources[0] === anchor))
    assert.ok(mock.counts.qaSources.slice(1, 6).every((sources) =>
      sources.length === 4 && sources[2]?.includes('/results/image-1.png')))
    assert.deepEqual(mock.counts.imageSources.slice(1).map((sources) => sources[1]), [
      'https://media.example.test/products/OFFICIAL-100-back.jpg',
      'https://media.example.test/products/OFFICIAL-100-description.jpg',
      'https://media.example.test/products/OFFICIAL-100-description.jpg',
      'https://media.example.test/products/OFFICIAL-100-back.jpg',
      'https://media.example.test/products/OFFICIAL-100-description.jpg',
    ])
    assert.match(mock.counts.imagePrompts[2], /Purpose: Make source-visible material character/)
    assert.match(mock.counts.imagePrompts[2], /source pointer \/ret\/result\/result\/description/)
    assert.ok(mock.counts.imagePrompts.slice(1).every((prompt) =>
      prompt.includes('The third reference is the accepted generated hero.')
      && prompt.includes('Use it only for presentation and sibling consistency')))
    assert.ok(mock.counts.qaPrompts[0].rejectWhen.some((rule) => rule.includes('main-image media')))
    assert.ok(!mock.counts.qaPrompts[0].rejectWhen.some((rule) => rule.startsWith('detail role')))
    assert.ok(mock.counts.qaPrompts[1].rejectWhen.some((rule) => rule.startsWith('detail role')))
    assert.ok(!mock.counts.qaPrompts[1].rejectWhen.some((rule) => rule.includes('main-image media')))
    assert.deepEqual(Object.keys(mock.counts.qaPrompts[0].productIdentity).sort(), ['evidencePolicy', 'productId'])
    assert.match(mock.counts.qaPrompts[0].productIdentity.evidencePolicy, /first source image wins/)
    assert.ok(mock.counts.qaPrompts[0].rejectWhen.some((rule) => rule.includes('do not infer visual expectations from title')))
    assert.match(mock.counts.qaLabels[0][0], /^SOURCE ANCHOR 1:/)
    assert.match(mock.counts.qaLabels[0].at(-1), /^FINAL IMAGE CANDIDATE:/)
    assert.match(mock.counts.qaLabels.at(-1).at(-1), /^FINAL VIDEO CANDIDATE:/)
    assert.match(mock.counts.qaPrompts[1].requiredShape.siblingConsistent, /third reference/)
    assert.ok(mock.counts.videoSources[0]?.includes('/results/image-1.png'))
    assert.ok(mock.counts.seeds.every((seed) => Number.isInteger(seed) && seed >= 0 && seed <= 2_147_483_647))
    assert.equal(mock.counts.localizationFactIds[0].length, 2)
    const video = await readFile(join(fixture.output, 'product_video.mp4'))
    assert.equal(video.toString('ascii', 4, 8), 'ftyp')
    const strategy = await readFile(join(fixture.output, 'strategy_document.md'), 'utf8')
    assert.match(strategy, /1440 x 1440px/)
    assert.match(strategy, /product_video\.mp4 uses the accepted hero as its first-frame identity lock/)
    assert.match(strategy, /### Actual Asset Roles and Source Support/)
    assert.match(strategy, /detail_image_2\.png.*primary-source `offer\.json\/ret\/result\/result\/description` \(description-image\)/)
    assert.match(strategy, /Actual QA: identity passed, sibling consistency passed, role fulfillment passed/)
    assert.match(strategy, /### 0-5s Video Storyboard/)
    assert.match(strategy, /\*\*0\.0-1\.2s - Identity:\*\*/)
    assert.match(strategy, /\*\*3\.4-5\.0s - Commerce close:\*\*/)
    assert.match(strategy, /## QA and Repair Closure/)
    assert.equal((await validateRehearsal(await (await import('node:fs/promises')).realpath(fixture.output))).status, 'passed')
    const description = await readFile(join(fixture.output, 'product_description_en.md'), 'utf8')
    assert.match(description, /\*\*`RED-M`\*\* - Color: red \(source value: `红色`\); Size: M \(source value: `M`\) `offer\.json\/ret\/result\/result\/productSkuInfos\/0\/skuId`/)
    assert.match(description, /Material: cotton \(source value: `棉`\) `offer\.json\/ret\/result\/result\/productAttribute\/0\/attrValue`/)
    assert.match(description, /Color: red \(source value: `红色`\) `offer\.json\/ret\/result\/result\/productAttribute\/1\/attrValue`/)
    assert.match(description, /Craft: handwoven \(source value: `手工编织`\)/)
    assert.match(description, /Model: 3XL classic style \(source value: `3XL经典款`\)/)
    assert.match(description, /\*\*Exact leaf category:\*\* Womens tops \(29073\)/)
    assert.match(description, /main_image\.png: Planned and QA-validated role: Pure-white marketplace hero/)
    assert.match(description, /detail_image_5\.png: Planned and QA-validated role: Source-supported styling and merchandising context/)
    assert.match(description, /product_video\.mp4: Planned and QA-validated role: Five-second product story with whole-product and construction holds/)
    assert.doesNotMatch(description, /Five-second product video/)
    const korean = await readFile(join(fixture.output, 'product_description_ko.md'), 'utf8')
    const portuguese = await readFile(join(fixture.output, 'product_description_pt.md'), 'utf8')
    assert.match(korean, /- 상품 ID: OFFICIAL-100/)
    assert.match(korean, /카탈로그 확인/)
    assert.match(portuguese, /- ID do produto: OFFICIAL-100/)
    assert.match(portuguese, /Confirmado no catalogo/)
    const log = await readFile(join(fixture.logs, 'agent.log'), 'utf8')
    assert.doesNotMatch(log, /test-secret-key-never-log|signature=|remote-video-task-secret/)
  } finally { await mock.close() }
})

test('official Chinese prompt runs without a non-contract log directory', async () => {
  const fixture = await fixtureDirectories(); cleanup.push(fixture.root)
  const mock = await mockDashScope()
  try {
    assert.equal(await main(
      ['--prompt', officialPrompt(fixture.input, fixture.output)],
      { DASHSCOPE_API_KEY: 'platform-startup-key', DASHSCOPE_BASE_URL: mock.origin },
      { allowTestOrigin: true, allowedResultOrigins: new Set([mock.origin]), timing: { pollIntervalMs: 1, sleep: async () => {} } },
    ), 0)
    assert.equal((await readdir(fixture.output)).length, 11)
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
  assert.deepEqual(planImageRoleSources(facts).map(({ roleId, supportingReference, supportMode }) => ({
    roleId, pointer: supportingReference?.pointer, sourceRole: supportingReference?.role, supportMode,
  })), [
    { roleId: 'main', pointer: undefined, sourceRole: undefined, supportMode: 'identity-anchor' },
    { roleId: 'detail-1', pointer: '/ret/result/result/productImage/images/1', sourceRole: 'product-image', supportMode: 'primary-source' },
    { roleId: 'detail-2', pointer: '/ret/result/result/description', sourceRole: 'description-image', supportMode: 'primary-source' },
    { roleId: 'detail-3', pointer: '/ret/result/result/description', sourceRole: 'description-image', supportMode: 'primary-source' },
    { roleId: 'detail-4', pointer: '/ret/result/result/productImage/images/1', sourceRole: 'product-image', supportMode: 'primary-source' },
    { roleId: 'detail-5', pointer: '/ret/result/result/description', sourceRole: 'description-image', supportMode: 'primary-source' },
  ])
  assert.deepEqual(compactFactsForModel(facts), {
    productId: 'OFFICIAL-100', sourcePlatform: '1688', title: '红色棉质女装上衣', sourceCategory: '9301181',
    productAttributes: [
      { key: '材质', value: '棉' }, { key: '颜色', value: '红色' },
      { key: '工艺', value: '手工编织' }, { key: '型号', value: '3XL经典款' },
    ],
    skuAxes: [{ key: '颜色', values: ['红色'] }, { key: '尺码', values: ['M'] }], skuCount: 1, sourceMediaCount: 3,
  })
  const categories = buildCategoryIndex(inventory.categories)
  assert.equal(categories.byId.get('29072').leaf, false)
  assert.equal(categories.byId.get('29073').leaf, true)
  assert.equal(categories.byId.get('29073').path, '女装 > 女装上衣')
  assert.equal(catalogCandidates(facts, categories)[0].id, '29073')
  const attributes = buildAttributeIndex(inventory.attributes, categories)
  assert.equal(attributes.definitions.filter((entry) => entry.categoryId === '29073' && entry.key === '颜色').length, 2)
  assert.equal(attributes.definitions.some((entry) => entry.attrId === 'ignored'), false)
  const backed = evidenceBackedCatalogAttributes(facts, attributes, '29073')
  assert.ok(backed.some((entry) => entry.attrId === 'attr-color-primary'))
  assert.ok(!backed.some((entry) => entry.attrId === 'attr-color-secondary'))
  assert.equal(backed.find((entry) => entry.attrId === 'attr-size')?.sourceKind, 'sale')
})

test('image role planning keeps every detail on the identity anchor when no non-anchor source exists', () => {
  const bytes = Buffer.from(JSON.stringify({
    productId: 'SINGLE-SOURCE', sourcePlatform: '1688', productUrl: 'https://detail.example.test/single-source',
    title: 'Single-source red top', images: ['https://media.example.test/products/single-source.jpg'],
  }))
  const facts = normalizeProduct({ path: 'single-source.json', bytes, sha256: createHash('sha256').update(bytes).digest('hex') })
  const plans = planImageRoleSources(facts)
  assert.equal(plans.length, 6)
  assert.ok(plans.slice(1).every(({ supportingReference, supportMode, identityAnchor }) =>
    supportingReference === undefined && supportMode === 'identity-anchor-fallback'
      && identityAnchor.pointer === '/images/0'))
})

test('deterministic market localization preserves source values while converting physical guidance', () => {
  assert.deepEqual(localizeFact('en', '尺码', 'S 80-95斤'), {
    key: 'Size', value: 'S 88.2-104.7 lb (40-47.5 kg)', sourceKey: '尺码', sourceValue: 'S 80-95斤', changed: true,
    display: 'Size: S 88.2-104.7 lb (40-47.5 kg) (source value: `S 80-95斤`)',
  })
  assert.equal(localizeFact('ko', '适合身高', '100cm').value, '100 cm')
  assert.equal(localizeFact('pt', '颜色', '粉色').display, 'Cor: rosa (valor original: `粉色`)')
  assert.equal(localizeFact('en', '工艺', '是否无缝').value, '是否无缝')
  assert.deepEqual(localizeFact('en', '材质功能', '防污'), {
    key: '材质功能', value: '防污', sourceKey: '材质功能', sourceValue: '防污', changed: false,
    display: '材质功能: 防污',
  })
  const aliasInventory = factLocalizationInventory({ attributes: [{ key: '面料成分2', value: '兔毛' }], skus: [] })
  const aliasTranslations = decodeFactTranslations([{
    id: aliasInventory[0].id,
    en: { key: 'Fabric composition', value: 'rabbit hair' },
    ko: { key: '원단 구성', value: '토끼털' },
    pt: { key: 'Composicao do tecido', value: 'pelo de coelho' },
  }], aliasInventory)
  const aliasIndex = indexFactTranslations(aliasTranslations)
  assert.deepEqual(localizeFact('en', '材质', '兔毛', aliasIndex), {
    key: 'Material', value: 'rabbit hair', sourceKey: '材质', sourceValue: '兔毛', changed: true,
    display: 'Material: rabbit hair (source value: `兔毛`)',
  })
  const repeatedAliasInventory = factLocalizationInventory({
    attributes: [{ key: '主面料成分', value: '兔毛' }, { key: '主面料成分2', value: '兔毛' }, { key: '面料2成分', value: '兔毛' }], skus: [],
  })
  const repeatedAliasTranslations = decodeFactTranslations(repeatedAliasInventory.map((entry, index) => ({
    id: entry.id,
    en: { key: ['Material', 'Material 2', 'Fabric 2 composition'][index], value: 'Rabbit Hair' },
    ko: { key: ['소재', '소재 2', '원단 2 성분'][index], value: '토끼털' },
    pt: { key: ['Material', 'Material 2', 'Composicao do tecido 2'][index], value: 'Pelo de Coelho' },
  })), repeatedAliasInventory)
  assert.deepEqual(localizeFact('en', '材质', '兔毛', indexFactTranslations(repeatedAliasTranslations)), {
    key: 'Material', value: 'Rabbit Hair', sourceKey: '材质', sourceValue: '兔毛', changed: true,
    display: 'Material: Rabbit Hair (source value: `兔毛`)',
  })
  const conflictingAliasTranslations = decodeFactTranslations(repeatedAliasInventory.slice(0, 2).map((entry, index) => ({
    id: entry.id,
    en: { key: 'Material', value: index === 0 ? 'rabbit hair' : 'hare fiber' },
    ko: { key: '소재', value: index === 0 ? '토끼털' : '산토끼 털' },
    pt: { key: 'Material', value: index === 0 ? 'pelo de coelho' : 'fibra de lebre' },
  })), repeatedAliasInventory.slice(0, 2))
  const conflictingAliasIndex = indexFactTranslations(conflictingAliasTranslations)
  assert.equal(localizeFact('en', '材质', '兔毛', conflictingAliasIndex).value, '兔毛')
  assert.throws(() => assertLocalizedFactsScriptClosure(
    [{ key: '材质', value: '兔毛' }], conflictingAliasIndex, 'Catalog attributes',
  ), /Catalog attributes 1 contains en script leakage/)
  const scriptContract = {
    locale: 'en', identityHeading: 'Source and Product Identity', mediaHeading: 'Image and Video Assets',
    sourceValueLabel: 'source value', name: 'product_description_en.md',
  }
  assert.doesNotThrow(() => assertLocalizedDocumentScriptClosure(
    '## Product Attributes\n\n- Material: rabbit hair (source value: `兔毛`) `offer.json/product/0`\n\n## Source and Product Identity\n\n- Source title: `兔毛`\n\n## Image and Video Assets\n',
    scriptContract,
  ))
  assert.throws(() => assertLocalizedDocumentScriptClosure(
    '## Product Attributes\n\n- Catalog-confirmed Material: 兔毛 `offer.json/product/0`\n\n## Source and Product Identity\n\n## Image and Video Assets\n',
    scriptContract,
  ), /script leakage/)
})

test('ambiguous catalog localization fails before any media Provider execution', async () => {
  const fixture = await fixtureDirectories(); cleanup.push(fixture.root)
  const productPath = join(fixture.input, 'offer.json')
  const product = JSON.parse(await readFile(productPath, 'utf8'))
  product.ret.result.result.productAttribute.splice(0, 1,
    { attrName: '主面料成分', attrValue: '兔毛' },
    { attrName: '主面料成分2', attrValue: '兔毛' })
  await writeFile(productPath, JSON.stringify(product))
  const attributesPath = join(fixture.input, 'clothing_attributes.json')
  const attributeCatalog = JSON.parse(await readFile(attributesPath, 'utf8'))
  attributeCatalog.categories.find(({ categoryId }) => categoryId === '29072')
    .categoryMetadata.categoryProductAttrList[0].values.push({ valueNameAlias: '兔毛' })
  await writeFile(attributesPath, JSON.stringify(attributeCatalog))
  const mock = await mockDashScope({ catalogMaterialValue: '兔毛', conflictingMaterialTranslations: true })
  try {
    await assert.rejects(main(
      ['--prompt', `Input directory: "${fixture.input}" Output directory: "${fixture.output}"`],
      { DASHSCOPE_API_KEY: 'ambiguous-localization-key', DASHSCOPE_BASE_URL: mock.origin },
      { allowTestOrigin: true, allowedResultOrigins: new Set([mock.origin]), timing: { pollIntervalMs: 1, sleep: async () => {} } },
    ), /Catalog attributes 1 contains en script leakage/)
    assert.deepEqual({ text: mock.counts.text, image: mock.counts.image, video: mock.counts.video },
      { text: 1, image: 0, video: 0 })
  } finally { await mock.close() }
})

test('fact translation closure is exact, ordered, script-clean, and protects numeric and 3XL evidence', () => {
  const facts = { attributes: [
    { key: '工艺', value: '手工编织' },
    { key: '型号', value: '3XL经典款' },
  ], skus: [] }
  const inventory = factLocalizationInventory(facts)
  assert.equal(inventory.length, 2)
  const valid = inventory.map((fact) => fact.sourceValue.includes('3XL') ? {
    id: fact.id,
    en: { key: 'Model', value: '3XL classic style' },
    ko: { key: '모델', value: '3XL 클래식 스타일' },
    pt: { key: 'Modelo', value: '3XL classico' },
  } : {
    id: fact.id,
    en: { key: 'Craft', value: 'handwoven' },
    ko: { key: '제작 방식', value: '수작업 직조' },
    pt: { key: 'Tecnica', value: 'trama manual' },
  })
  const decoded = decodeFactTranslations(valid, inventory)
  assert.equal(localizeFact('en', '型号', '3XL经典款', indexFactTranslations(decoded)).value, '3XL classic style')
  assert.deepEqual(decodeFactTranslations([], []), [])
  assert.throws(() => decodeFactTranslations([valid[0]], []), /exact requested closure/)
  assert.throws(() => decodeFactTranslations(valid.slice(0, -1), inventory), /exact requested closure/)
  assert.throws(() => decodeFactTranslations([...valid].reverse(), inventory), /identity or order/)
  assert.throws(() => decodeFactTranslations(valid.map((entry) => entry.en.value.includes('3XL')
    ? { ...entry, en: { ...entry.en, value: '4XL classic style' } } : entry), inventory), /numeric evidence/)
  assert.throws(() => decodeFactTranslations(valid.map((entry) => entry.en.value.includes('3XL')
    ? { ...entry, en: { ...entry.en, value: '3XXL classic style' } } : entry), inventory), /protected model or size token/)
  assert.throws(() => decodeFactTranslations(valid.map((entry, index) => index === 0
    ? { ...entry, pt: { ...entry.pt, value: 'trama 手工' } } : entry), inventory), /script leakage/)
  assert.throws(() => decodeFactTranslations(valid.map((entry, index) => index === 0
    ? { ...entry, en: { ...entry.en, value: '`handwoven`' } } : entry), inventory), /missing, unsafe/)

  for (const token of ['3xl', '3xL']) {
    const tokenInventory = factLocalizationInventory({ attributes: [{ key: '型号', value: `${token}经典款` }], skus: [] })
    const tokenTranslations = [{
      id: tokenInventory[0].id,
      en: { key: 'Model', value: `${token} classic style` },
      ko: { key: '모델', value: `${token} 클래식 스타일` },
      pt: { key: 'Modelo', value: `${token} classico` },
    }]
    assert.doesNotThrow(() => decodeFactTranslations(tokenTranslations, tokenInventory))
    assert.throws(() => decodeFactTranslations(tokenTranslations.map((entry) => ({
      ...entry, en: { ...entry.en, value: `${token.toUpperCase()} classic style` },
    })), tokenInventory), /protected model or size token/)
  }
  assert.deepEqual(factLocalizationInventory({ attributes: [], skus: [] }), [])
  const maximumFacts = Array.from({ length: 80 }, (_, index) => ({ key: `工艺${index}`, value: `手工编织${index}` }))
  assert.equal(factLocalizationInventory({ attributes: maximumFacts, skus: [] }).length, 80)
  assert.throws(() => factLocalizationInventory({
    attributes: [...maximumFacts, { key: '工艺80', value: '手工编织80' }], skus: [],
  }), /exceeds 80 entries/)
})

test('catalog evidence prefers exact keys and does not collapse distinct attribute concepts', () => {
  const facts = {
    attributes: [
      { key: '材质功能', value: '防污', pointer: '/attributes/0' },
      { key: '面料名称', value: '化纤类混纺', pointer: '/attributes/1' },
      { key: '款式', value: '开叉款', pointer: '/attributes/2' },
      { key: '风格', value: '优雅风', pointer: '/attributes/3' },
      { key: '裙长', value: '中长款', pointer: '/attributes/4' },
    ],
    skus: [],
  }
  const attributeIndex = { definitions: [
    { categoryId: 'leaf', attrId: 'material', key: '材质', values: [], customizable: true },
    { categoryId: 'leaf', attrId: 'style', key: '风格', values: [], customizable: true },
    { categoryId: 'leaf', attrId: 'skirt-length', key: '裙长', values: [], customizable: true },
    { categoryId: 'leaf', attrId: 'pants-length', key: '裤长', values: [], customizable: true },
  ] }
  assert.deepEqual(evidenceBackedCatalogAttributes(facts, attributeIndex, 'leaf'), [
    { attrId: 'material', key: '材质', value: '化纤类混纺', sourcePointer: '/attributes/1', sourceKind: 'product' },
    { attrId: 'style', key: '风格', value: '优雅风', sourcePointer: '/attributes/3', sourceKind: 'product' },
    { attrId: 'skirt-length', key: '裙长', value: '中长款', sourcePointer: '/attributes/4', sourceKind: 'product' },
  ])
})

test('one rejected image repairs only its role and retains passing sibling artifacts', async () => {
  const fixture = await fixtureDirectories(); cleanup.push(fixture.root)
  const mock = await mockDashScope({ failQaRole: 'Material and texture macro' })
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
  const mock = await mockDashScope({ failSiblingQaRole: 'Hardware, seam, and finish close-up' })
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
    const repairPrompt = mock.counts.imagePrompts.find((prompt) => prompt.includes('QA correction:'))
    assert.match(repairPrompt, /third reference is the rejected prior output/)
    assert.doesNotMatch(repairPrompt, /third reference is the accepted generated hero/)
    assert.match(await readFile(join(fixture.output, 'strategy_document.md'), 'utf8'),
      /Repair\/restart events: detail_image_3\.png/)
  } finally { await mock.close() }
})

test('rejected main image repairs under main-image physical constraints without applying sales-claim filters to QA instructions', async () => {
  const fixture = await fixtureDirectories(); cleanup.push(fixture.root)
  const mock = await mockDashScope({ failQaRole: 'Pure-white marketplace hero', qaRepairPrompt: 'Restore authentic product construction without inventing a certification.' })
  try {
    const code = await main(
      ['--prompt', `Input directory: "${fixture.input}" Output directory: "${fixture.output}"`],
      { DASHSCOPE_API_KEY: 'main-repair-key', DASHSCOPE_BASE_URL: mock.origin, AGENT_LOG_DIR: fixture.logs },
      { allowTestOrigin: true, allowedResultOrigins: new Set([mock.origin]), timing: { pollIntervalMs: 1, sleep: async () => {} } },
    )
    assert.equal(code, 0)
    assert.equal(mock.counts.image, 7)
    assert.equal(mock.counts.qa, 8)
    const repairPrompt = mock.counts.imagePrompts.find((prompt) => prompt.includes('QA correction:'))
    assert.match(repairPrompt, /second reference is the rejected prior main output/)
    const strategy = await readFile(join(fixture.output, 'strategy_document.md'), 'utf8')
    assert.match(strategy, /Repair\/restart events: main_image\.png/)
  } finally { await mock.close() }
})

test('restart restores a completed main repair and re-runs only invalidated QA policy', async () => {
  const fixture = await fixtureDirectories(); cleanup.push(fixture.root)
  const mock = await mockDashScope({ failQaAtSet: [1, 2] })
  const args = ['--prompt', `Input directory: "${fixture.input}" Output directory: "${fixture.output}"`]
  const environment = { DASHSCOPE_API_KEY: 'repair-resume-key', DASHSCOPE_BASE_URL: mock.origin }
  const options = { allowTestOrigin: true, allowedResultOrigins: new Set([mock.origin]), timing: { pollIntervalMs: 1, sleep: async () => {} } }
  try {
    await assert.rejects(main(args, environment, options), /Main image failed bounded QA after repair/)
    assert.equal(mock.counts.image, 2)
    assert.equal(mock.counts.qa, 2)
    await rm(join(fixture.output, '.qianwen-agent-work', 'checkpoints', 'main-qa-2.json'))
    assert.equal(await main(args, environment, options), 0)
    assert.equal(mock.counts.image, 7)
    assert.equal(mock.counts.qa, 9)
    assert.equal((await readdir(fixture.output)).length, 11)
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

test('visual material authenticity remains valid while an unsupported authentic-product claim fails closed', async () => {
  const passingFixture = await fixtureDirectories(); cleanup.push(passingFixture.root)
  const passing = await mockDashScope({ creativeStrategy: 'Use material authenticity as a visual fidelity goal without adding product claims.' })
  try {
    assert.equal(await main(
      ['--prompt', `Input directory: "${passingFixture.input}" Output directory: "${passingFixture.output}"`],
      { DASHSCOPE_API_KEY: 'authenticity-fidelity-key', DASHSCOPE_BASE_URL: passing.origin },
      { allowTestOrigin: true, allowedResultOrigins: new Set([passing.origin]), timing: { pollIntervalMs: 1, sleep: async () => {} } },
    ), 0)
  } finally { await passing.close() }

  const failingFixture = await fixtureDirectories(); cleanup.push(failingFixture.root)
  const failing = await mockDashScope({ creativeStrategy: 'Present this as a guaranteed authentic product.' })
  try {
    await assert.rejects(main(
      ['--prompt', `Input directory: "${failingFixture.input}" Output directory: "${failingFixture.output}"`],
      { DASHSCOPE_API_KEY: 'authentic-product-claim-key', DASHSCOPE_BASE_URL: failing.origin },
      { allowTestOrigin: true, allowedResultOrigins: new Set([failing.origin]), timing: { pollIntervalMs: 1, sleep: async () => {} } },
    ), /unsupported claim/)
    assert.equal(failing.counts.image, 0)
  } finally { await failing.close() }
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

test('a second invalid localized plan fails closed before media Provider execution', async () => {
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

test('structured plan cannot inject Markdown section boundaries through a localized title', async () => {
  const fixture = await fixtureDirectories(); cleanup.push(fixture.root)
  const mock = await mockDashScope({ structuralTitleAlways: true })
  try {
    await assert.rejects(main(
      ['--prompt', `Input directory: "${fixture.input}" Output directory: "${fixture.output}"`],
      { DASHSCOPE_API_KEY: 'structural-title-key', DASHSCOPE_BASE_URL: mock.origin, AGENT_LOG_DIR: fixture.logs },
      { allowTestOrigin: true, allowedResultOrigins: new Set([mock.origin]), timing: { pollIntervalMs: 1, sleep: async () => {} } },
    ), /en title is missing or exceeds its limit/)
    assert.deepEqual({ text: mock.counts.text, image: mock.counts.image }, { text: 2, image: 0 })
  } finally { await mock.close() }
})

test('structured-plan repair rejects incomplete, reordered, drifted, or script-leaking fact translations before media', async () => {
  for (const failure of ['missing', 'reordered', 'numeric-drift', 'model-drift', 'script-leak']) {
    const fixture = await fixtureDirectories(); cleanup.push(fixture.root)
    const mock = await mockDashScope({ factTranslationFailure: failure })
    try {
      await assert.rejects(main(
        ['--prompt', `Input directory: "${fixture.input}" Output directory: "${fixture.output}"`],
        { DASHSCOPE_API_KEY: `fact-${failure}-key`, DASHSCOPE_BASE_URL: mock.origin, AGENT_LOG_DIR: fixture.logs },
        { allowTestOrigin: true, allowedResultOrigins: new Set([mock.origin]), timing: { pollIntervalMs: 1, sleep: async () => {} } },
      ), /Fact translation/)
      assert.deepEqual({ text: mock.counts.text, image: mock.counts.image, video: mock.counts.video },
        { text: 2, image: 0, video: 0 })
    } finally { await mock.close() }
  }
})

test('credential-shaped model copy fails closed before media Provider execution', async () => {
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

test('serialized detail production fails before a sibling Provider image node can start', async () => {
  const fixture = await fixtureDirectories(); cleanup.push(fixture.root)
  const mock = await mockDashScope({
    failQaTransportRole: 'Source-supported alternate angle or reverse construction',
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

test('process restart refuses an ambiguous Provider image submit without another network request', async () => {
  const fixture = await fixtureDirectories(); cleanup.push(fixture.root)
  const mock = await mockDashScope({ failImageTransportAt: 1 })
  const args = ['--prompt', `Input directory: "${fixture.input}" Output directory: "${fixture.output}"`]
  const environment = { DASHSCOPE_API_KEY: 'ambiguous-image-key', DASHSCOPE_BASE_URL: mock.origin, AGENT_LOG_DIR: fixture.logs }
  const options = { allowTestOrigin: true, allowedResultOrigins: new Set([mock.origin]), timing: { pollIntervalMs: 1, sleep: async () => {} } }
  try {
    await assert.rejects(main(args, environment, options), /transport failed for main/)
    assert.deepEqual({ text: mock.counts.text, image: mock.counts.image, posts: mock.counts.posts }, { text: 1, image: 1, posts: 2 })

    await assert.rejects(main(args, environment, options), /prior main Provider request may have reached the Provider/)
    assert.deepEqual({ text: mock.counts.text, image: mock.counts.image, posts: mock.counts.posts }, { text: 1, image: 1, posts: 2 })
    assert.deepEqual(await readdir(fixture.output), ['.qianwen-agent-work'])
  } finally { await mock.close() }
})

test('process restart refuses an ambiguous Provider text submit without another network request', async () => {
  const fixture = await fixtureDirectories(); cleanup.push(fixture.root)
  const mock = await mockDashScope({ failTextTransportAt: 1 })
  const args = ['--prompt', `Input directory: "${fixture.input}" Output directory: "${fixture.output}"`]
  const environment = { DASHSCOPE_API_KEY: 'ambiguous-text-key', DASHSCOPE_BASE_URL: mock.origin, AGENT_LOG_DIR: fixture.logs }
  const options = { allowTestOrigin: true, allowedResultOrigins: new Set([mock.origin]), timing: { pollIntervalMs: 1, sleep: async () => {} } }
  try {
    await assert.rejects(main(args, environment, options), /transport failed for structured-plan/)
    assert.deepEqual({ text: mock.counts.text, image: mock.counts.image, posts: mock.counts.posts },
      { text: 1, image: 0, posts: 1 })
    await assert.rejects(main(args, environment, options), /prior text Provider request may have reached the Provider/)
    assert.deepEqual({ text: mock.counts.text, image: mock.counts.image, posts: mock.counts.posts },
      { text: 1, image: 0, posts: 1 })
  } finally { await mock.close() }
})

test('completed media checkpoint refuses a symlink replacement before any new Provider request', async () => {
  const fixture = await fixtureDirectories(); cleanup.push(fixture.root)
  const mock = await mockDashScope({ failQaTransportRole: 'Source-supported alternate angle or reverse construction' })
  const args = ['--prompt', `Input directory: "${fixture.input}" Output directory: "${fixture.output}"`]
  const environment = { DASHSCOPE_API_KEY: 'checkpoint-symlink-key', DASHSCOPE_BASE_URL: mock.origin, AGENT_LOG_DIR: fixture.logs }
  const options = { allowTestOrigin: true, allowedResultOrigins: new Set([mock.origin]), timing: { pollIntervalMs: 1, sleep: async () => {} } }
  try {
    await assert.rejects(main(args, environment, options), /transport failed/)
    const providerPosts = mock.counts.posts
    const stagedMain = join(fixture.output, '.qianwen-agent-work', 'stage', 'main_image.png')
    const replacement = join(fixture.root, 'replacement.png')
    await writeFile(replacement, await readFile(stagedMain))
    await rm(stagedMain)
    await symlink(replacement, stagedMain)
    await assert.rejects(main(args, environment, options), /bounded regular file/)
    assert.equal(mock.counts.posts, providerPosts)
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
    const providerPosts = mock.counts.posts
    const checkpointPath = join(fixture.output, '.qianwen-agent-work', 'checkpoints', 'structured-plan.json')
    const checkpoint = JSON.parse(await readFile(checkpointPath, 'utf8'))
    checkpoint.result.locales.en.title = 'Caller-authored replacement title'
    await writeFile(checkpointPath, `${JSON.stringify(checkpoint)}\n`)
    await assert.rejects(main(args, environment, options), /authentication failed/)
    assert.equal(mock.counts.posts, providerPosts)
  } finally { await mock.close() }
})

test('prompt parsing, seeds and symlink input fail closed', async () => {
  assert.throws(() => parsePromptPaths('input directory: relative output directory: /tmp/out'), /absolute/)
  assert.throws(() => parsePromptPaths('input directory: /tmp/same output directory: /tmp/same'), /different/)
  assert.deepEqual(parsePromptPaths('请处理输入文件夹路径为：/tmp/in，输出文件夹路径为：/tmp/out。'), { inputRoot: '/tmp/in', outputRoot: '/tmp/out' })
  assert.deepEqual(parsePromptPaths(officialPrompt('/home/user/ws/input', '/home/user/ws/output')), {
    inputRoot: '/home/user/ws/input', outputRoot: '/home/user/ws/output',
  })
  assert.deepEqual(parsePromptPaths('Input directory: “/tmp/in folder”\nOutput directory: ‘/tmp/out folder’'), {
    inputRoot: '/tmp/in folder', outputRoot: '/tmp/out folder',
  })
  await assert.rejects(main(
    ['--prompt', 'Input directory: /tmp/in Output directory: /tmp/out'],
    { DASHSCOPE_API_KEY: 'invalid-log-path-key', AGENT_LOG_DIR: 'relative/logs' },
  ), /AGENT_LOG_DIR/)
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
