import { z } from 'zod'

const id = z.string().regex(/^[a-z][a-z0-9.-]+$/)
const generationMode = z.enum(['image-generate', 'image-edit', 'deterministic-compose', 'vector', 'manual-review'])
const costClass = z.enum(['none', 'low', 'medium', 'high'])

export const brandViCatalogItemSchema = z.object({
  id,
  section: z.string().regex(/^[AB]\d+$/),
  category: z.string().min(1),
  title: z.string().min(1),
  stage: z.enum(['foundation', 'approved-master', 'application']),
  deliverableKind: z.enum(['guideline', 'master-artwork', 'layout-template', 'mockup', 'production-spec', 'motion']),
  requiredInputs: z.array(z.string().min(1)).min(1),
  dependencies: z.array(id),
  generationModes: z.array(generationMode).min(1),
  formats: z.array(z.string().min(1)).min(1),
  dimensions: z.array(z.object({ name: z.string().min(1), value: z.string().min(1) }).strict()).min(1),
  variants: z.array(z.string().min(1)).min(1),
  qualityGates: z.array(z.string().min(1)).min(1),
  approval: z.object({ required: z.boolean(), role: z.enum(['brand-owner', 'design-lead', 'production-owner']) }).strict(),
  costClass,
  referenceLocks: z.array(z.string().min(1)).min(1),
  promptPolicy: z.object({
    objective: z.string().min(1),
    required: z.array(z.string().min(1)).min(1),
    forbidden: z.array(z.string().min(1)).min(1),
  }).strict(),
}).strict()

export const brandViCatalogSchema = z.object({
  version: z.literal('brand-vi-catalog.v1'),
  items: z.array(brandViCatalogItemSchema).min(1),
}).strict()

export type BrandViCatalogItem = z.infer<typeof brandViCatalogItemSchema>
export type BrandViCatalog = z.infer<typeof brandViCatalogSchema>
export type BrandViProfile = 'minimum' | 'core' | 'full' | 'custom'
export type BrandViGenerationMode = z.infer<typeof generationMode>

export interface BrandViExecutionRoute {
  readonly mode: BrandViGenerationMode
  readonly target: 'visual-generation' | 'brand-kit-compose' | 'vector-authoring' | 'manual-review'
  readonly operation: string
  readonly effect: 'provider-required' | 'deterministic' | 'human-required'
  readonly extensionTargets: readonly ('figma-adapter' | 'coding-agent')[]
}

const executionRoutes: Readonly<Record<BrandViGenerationMode, BrandViExecutionRoute>> = {
  'image-generate': { mode: 'image-generate', target: 'visual-generation', operation: 'generate', effect: 'provider-required', extensionTargets: ['figma-adapter'] },
  'image-edit': { mode: 'image-edit', target: 'visual-generation', operation: 'edit', effect: 'provider-required', extensionTargets: ['figma-adapter'] },
  'deterministic-compose': { mode: 'deterministic-compose', target: 'brand-kit-compose', operation: 'compose', effect: 'deterministic', extensionTargets: ['figma-adapter', 'coding-agent'] },
  vector: { mode: 'vector', target: 'vector-authoring', operation: 'author-vector-master', effect: 'deterministic', extensionTargets: ['figma-adapter', 'coding-agent'] },
  'manual-review': { mode: 'manual-review', target: 'manual-review', operation: 'review-and-approve', effect: 'human-required', extensionTargets: ['figma-adapter'] },
}

/** Resolve catalog intent to a named runtime boundary; this does not invoke it or imply provider availability. */
export function resolveBrandViExecutionRoute(mode: BrandViGenerationMode): BrandViExecutionRoute {
  return executionRoutes[mode]
}

type Seed = readonly [id: string, title: string]

const foundationSections: Readonly<Record<string, readonly Seed[]>> = {
  A1: [
    ['a1.logo.standard', '标志标准图形'], ['a1.logo.ink', '企业标志墨稿'], ['a1.logo.grid', '标志方格制图'],
    ['a1.logo.restrictions', '限定'], ['a1.logo.clearspace-minimum', '标志预留空间与最小化比例'],
  ],
  A2: [
    ['a2.type.short-cn-grid', '简称中文字体方格制图'], ['a2.type.short-en-grid', '简称英文字体方格制图'],
    ['a2.type.short-bilingual-grid', '简称中英文字体组合方格制图'], ['a2.type.full-cn-grid', '全称中文字体方格制图'],
    ['a2.type.full-en-grid', '全称英文字体方格制图'], ['a2.type.full-bilingual-grid', '全称中英文字体组合方格制图'],
  ],
  A3: [
    ['a3.color.standard', '企业标准色'], ['a3.color.auxiliary-scale', '辅助色色阶'], ['a3.color.standard-scale', '标准色色阶'],
    ['a3.color.auxiliary', '企业辅助色'], ['a3.color.misuse', '标准色彩禁用示例'],
  ],
  A4: [
    ['a4.lockup.vertical-bilingual', '标志与企业中英文字体上下组合'], ['a4.lockup.misuse', '标志及组合禁用说明'],
    ['a4.lockup.horizontal-bilingual', '标志与企业中英文字体左右组合'],
  ],
  A5: [['a5.pattern.master', '辅助图形'], ['a5.pattern.usage', '辅助图形使用规范']],
}

const applicationSections: Readonly<Record<string, readonly Seed[]>> = {
  B1: seeds('b1', [
    '名片', '薪资袋', '奖杯', '信封', '备忘录', '考勤卡', '信纸', '工作证', '请假单', '便签', '票据夹', '意见箱',
    '文档表头', '送货单', '纸杯', '文件夹', '收据', '通讯录', '合同夹', '桌牌', '财产编号牌', '合同书封面',
    '员工座位标识牌(职位牌)', 'PPT模板', '公文袋', '名片盒（夹/台）', '车辆出入证', '档案盒', '及时贴标签', '胸卡',
    '档案袋', '办公用笔',
  ]),
  B2: [
    ['b2.social-avatar', '网络社交头像规范'], ['b2.web-header', '网页眉头规范'], ['b2.email', '邮件样式规范'],
    ['b2.qr-code', '二维码规范'], ['b2.app-icon', 'APP应用ICO图标'], ['b2.mouse-pad', '鼠标垫'], ['b2.web-ad', '网页广告规范'],
  ],
  B3: seeds('b3', ['包装箱样式', '包装盒样式', '包装纸', '胶带', '合格证样式', '礼盒（年终礼盒）', '保修卡封面', '产品吊牌样式', '说明书规范封面']),
  B4: seeds('b4', ['公司旗帜', '挂旗', '促销彩旗', '桌旗']),
  B5: seeds('b5', ['贺卡', '红包', '邀请函', '挂历封面版式规范', '标识伞']),
  B6: seeds('b6', ['管理人员着装（男/女二季）', '生产职员制服（男/女二季）', '店面职员制服（男/女二季）', '警卫职员制服（男/女二季）', '保洁职员制服（男/女二季）', '运动服（男/女二季）', '文化衫 (T恤)', '安全帽', '公司活动专用帽']),
  B7: seeds('b7', ['公务车', '面包车', '班车', '运输货车', '三轮车车棚']),
  B8: seeds('b8', ['杂志广告封面样式', '海报版式规范', '公交车体广告规范', '擎天柱广告规范', '灯箱广告规范', 'DM版式规范', '条幅广告规范', '促销帐篷', '促销大伞']),
  B9: seeds('b9', ['公司文化展板', '公司公告栏样式', '公司制度展示牌', '接待台及背景墙']),
  B10: seeds('b10', ['销售店面外观', '室内环境', '门头设计', '店面招聘', '导购流程图版式规范', '橱窗形象规范', '收银台形象规范', '店内形象墙', '店内展台', '货架', '货柜', '中岛柜', '立墙灯箱', '垃圾桶']),
  B11: seeds('b11', ['企业厂房大门形象', '企业厂房外墙形象', '生产车间部门标示牌', '生产车间平面指示图', '车间标语牌', '车间工位标识牌', '车间生产流程标示牌', '物料管理标签', '生产车间5S/7S标识牌']),
  B12: seeds('b12', ['公司名称标识牌', '部门标示牌', '玻璃门横贴（防撞条）', '楼层标识牌', '立地式标识牌', '停车场区域指示', '欢迎标语牌', '禁止停车牌']),
  B13: [
    ['b13.mascot.color-master', '吉祥物彩色稿及造型说明'], ['b13.mascot.turnaround', '吉祥物三视图'],
    ['b13.mascot.motion-poses', '吉祥物基本动态造型'], ['b13.mascot.monochrome', '企业吉祥物造型单色印刷规范'],
    ['b13.mascot.usage', '吉祥物应用规范设定'], ['b13.mascot.3d-render', '吉祥物3D立体效果图'],
    ['b13.mascot.animated-motion', '吉祥物动画动态图'],
  ],
}

function seeds(prefix: string, titles: readonly string[]): readonly Seed[] {
  return titles.map((title, index) => [`${prefix}.${String(index + 1).padStart(2, '0')}`, title] as const)
}

const approvedLogo = 'approved:a1.logo.standard'
const approvedColor = 'approved:a3.color.standard'
const approvedType = 'approved:a2.type.full-bilingual-grid'
const approvedPattern = 'approved:a5.pattern.master'

function foundationItem(section: string, [itemId, title]: Seed): BrandViCatalogItem {
  const isMaster = ['a1.logo.standard', 'a3.color.standard', 'a5.pattern.master'].includes(itemId)
  const dependencies = foundationDependencies(itemId)
  return {
    id: itemId,
    section,
    category: categoryName(section),
    title,
    stage: isMaster ? 'approved-master' : 'foundation',
    deliverableKind: isMaster ? 'master-artwork' : 'guideline',
    requiredInputs: dependencies.length === 0 ? ['brand brief', 'licensed reference sources'] : dependencies.map((value) => `approved ${value}`),
    dependencies,
    generationModes: itemId.startsWith('a1.logo') || itemId.startsWith('a4.') || itemId === 'a5.pattern.master'
      ? ['vector', 'manual-review'] : ['deterministic-compose', 'manual-review'],
    formats: isMaster ? ['SVG', 'PDF', 'PNG'] : ['PDF', 'SVG'],
    dimensions: [{ name: 'master', value: isMaster ? 'vector, viewBox normalized' : 'A4 landscape guideline page' }],
    variants: itemId === 'a1.logo.standard' ? ['primary', 'compact', 'responsive'] : ['print', 'screen'],
    qualityGates: ['source evidence resolved', 'geometry/token checks pass', 'human visual review approved'],
    approval: { required: true, role: 'brand-owner' },
    costClass: 'none',
    referenceLocks: dependencies.length ? dependencies.map((value) => `approved:${value}`) : ['brand-brief', 'licensed-reference-only'],
    promptPolicy: {
      objective: `Produce ${title} as a reusable, reviewable brand foundation artifact.`,
      required: ['preserve supplied brand intent', 'output editable production geometry or explicit specification'],
      forbidden: ['invent unlicensed references', 'silently alter approved masters', 'rasterize the only master'],
    },
  }
}

function foundationDependencies(itemId: string): string[] {
  if (itemId === 'a1.logo.standard' || itemId === 'a3.color.standard') return []
  if (itemId.startsWith('a1.')) return ['a1.logo.standard']
  if (itemId.startsWith('a2.')) return ['a1.logo.standard']
  if (itemId.startsWith('a3.')) return ['a3.color.standard']
  if (itemId.startsWith('a4.')) return ['a1.logo.standard', 'a2.type.full-bilingual-grid', 'a3.color.standard']
  if (itemId === 'a5.pattern.master') return ['a1.logo.standard', 'a3.color.standard']
  return ['a5.pattern.master']
}

function applicationItem(section: string, [itemId, title]: Seed): BrandViCatalogItem {
  const mascot = section === 'B13'
  const motion = itemId === 'b13.mascot.animated-motion'
  const dependencies = mascot
    ? mascotDependencies(itemId)
    : ['a1.logo.standard', 'a2.type.full-bilingual-grid', 'a3.color.standard', 'a5.pattern.master']
  const generationModes: BrandViCatalogItem['generationModes'] = motion
    ? ['image-generate', 'image-edit', 'manual-review']
    : mascot ? ['image-generate', 'image-edit', 'deterministic-compose', 'manual-review']
      : ['deterministic-compose', 'image-edit', 'manual-review']
  return {
    id: itemId,
    section,
    category: categoryName(section),
    title,
    stage: 'application',
    deliverableKind: motion ? 'motion' : mascot ? 'master-artwork' : title.includes('规范') || title.includes('模板') ? 'layout-template' : 'mockup',
    requiredInputs: ['approved logo master', 'approved typography lockup', 'approved color tokens', 'approved auxiliary pattern', 'production context or measured template'],
    dependencies,
    generationModes,
    formats: motion ? ['MP4', 'WebM', 'Lottie JSON', 'GIF'] : ['editable source', 'PDF', 'PNG', 'production specification'],
    dimensions: [{ name: 'production', value: 'parameterized by approved vendor/template measurements; no guessed dimensions' }],
    variants: mascot ? ['approved master', 'monochrome proof', 'application preview'] : ['primary', 'alternate format', 'production proof'],
    qualityGates: ['all reference locks resolve to approved revisions', 'logo clearspace and minimum size pass', 'color contrast/gamut pass for target medium', 'copy and dimensions reviewed', 'visual regression against approved masters'],
    approval: { required: true, role: mascot ? 'brand-owner' : 'production-owner' },
    costClass: motion || itemId === 'b13.mascot.3d-render' ? 'high' : mascot ? 'medium' : 'low',
    referenceLocks: [approvedLogo, approvedType, approvedColor, approvedPattern, ...(mascot && itemId !== 'b13.mascot.color-master' ? ['approved:b13.mascot.color-master'] : [])],
    promptPolicy: {
      objective: `Apply approved brand masters to ${title}; explore composition and context without redesigning the identity.`,
      required: ['condition generation on immutable approved reference assets', 'preserve exact logo, type, color, pattern and mascot identity', 'separate presentation mockup from production artwork'],
      forbidden: ['redraw or mutate approved logo', 'invent new brand colors or typefaces', 'replace approved mascot identity', 'claim guessed dimensions are production-ready'],
    },
  }
}

function mascotDependencies(itemId: string): string[] {
  const base = ['a1.logo.standard', 'a2.type.full-bilingual-grid', 'a3.color.standard', 'a5.pattern.master']
  if (itemId === 'b13.mascot.color-master') return base
  if (itemId === 'b13.mascot.turnaround') return [...base, 'b13.mascot.color-master']
  if (itemId === 'b13.mascot.motion-poses') return [...base, 'b13.mascot.color-master', 'b13.mascot.turnaround']
  if (itemId === 'b13.mascot.monochrome' || itemId === 'b13.mascot.usage') return [...base, 'b13.mascot.color-master']
  if (itemId === 'b13.mascot.3d-render') return [...base, 'b13.mascot.color-master', 'b13.mascot.turnaround']
  return [...base, 'b13.mascot.color-master', 'b13.mascot.turnaround', 'b13.mascot.motion-poses']
}

function categoryName(section: string): string {
  return ({
    A1: '企业标志规范', A2: '企业标准字体规范', A3: '企业标准色规范', A4: '标识组合规范', A5: '辅助图形规范',
    B1: '办公形象应用规范', B2: '网络媒体应用规范', B3: '产品包装应用规范', B4: '旗帜规划应用规范',
    B5: '公共关系赠品应用规范', B6: '服装服饰应用规范', B7: '交通运输工具应用规范', B8: '媒体广告应用规范',
    B9: '展览展示应用规范', B10: '销售店面应用规范', B11: '厂房（生产）车间应用规范', B12: '室内外指示应用规范', B13: '吉祥物IP形象',
  } as Record<string, string>)[section] ?? section
}

const allSeeds = [...Object.entries(foundationSections), ...Object.entries(applicationSections)]
export const BRAND_VI_REQUIRED_ITEM_IDS = allSeeds.flatMap(([, values]) => values.map(([itemId]) => itemId))

export const BRAND_VI_CATALOG: BrandViCatalog = brandViCatalogSchema.parse({
  version: 'brand-vi-catalog.v1',
  items: allSeeds.flatMap(([section, values]) => values.map((seed) =>
    section.startsWith('A') ? foundationItem(section, seed) : applicationItem(section, seed),
  )),
})

export interface BrandViCatalogValidation { readonly ok: boolean; readonly errors: readonly string[] }

export function validateBrandViCatalog(catalog: BrandViCatalog): BrandViCatalogValidation {
  const parsed = brandViCatalogSchema.safeParse(catalog)
  if (!parsed.success) return { ok: false, errors: [z.prettifyError(parsed.error)] }
  const ids = new Set<string>()
  const errors: string[] = []
  for (const item of parsed.data.items) {
    if (ids.has(item.id)) errors.push(`Duplicate item ${item.id}.`)
    ids.add(item.id)
  }
  for (const item of parsed.data.items) for (const dependency of item.dependencies) {
    if (!ids.has(dependency)) errors.push(`${item.id} depends on unknown item ${dependency}.`)
  }
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const byId = new Map(parsed.data.items.map((item) => [item.id, item]))
  function visit(itemId: string): void {
    if (visiting.has(itemId)) { errors.push(`Dependency cycle includes ${itemId}.`); return }
    if (visited.has(itemId)) return
    visiting.add(itemId)
    for (const dependency of byId.get(itemId)?.dependencies ?? []) visit(dependency)
    visiting.delete(itemId)
    visited.add(itemId)
  }
  for (const item of parsed.data.items) visit(item.id)
  return { ok: errors.length === 0, errors }
}

const minimumIds = ['a1.logo.standard', 'a1.logo.clearspace-minimum', 'a2.type.full-bilingual-grid', 'a3.color.standard', 'a3.color.auxiliary', 'a4.lockup.horizontal-bilingual', 'a5.pattern.master']
const coreIds = [...minimumIds, 'a1.logo.ink', 'a1.logo.restrictions', 'a3.color.misuse', 'a4.lockup.vertical-bilingual', 'a4.lockup.misuse', 'a5.pattern.usage', 'b1.01', 'b1.04', 'b1.07', 'b1.24', 'b2.social-avatar', 'b2.web-header', 'b2.email', 'b2.app-icon', 'b8.02']

export interface BrandViPlanRequest { readonly profile: BrandViProfile; readonly itemIds?: readonly string[] }
export interface BrandViPlanNode extends BrandViCatalogItem {
  readonly itemId: string
  readonly status: 'planned'
  readonly paidAction: boolean
  readonly executionRoutes: readonly BrandViExecutionRoute[]
}
export interface BrandViGenerationPlan {
  readonly version: 'brand-vi-plan.v1'
  readonly catalogVersion: 'brand-vi-catalog.v1'
  readonly profile: BrandViProfile
  readonly requestedItemIds: readonly string[]
  readonly nodes: readonly BrandViPlanNode[]
  readonly estimatedPaidActions: number
  readonly requiresApproval: boolean
}

export function createBrandViGenerationPlan(request: BrandViPlanRequest): BrandViGenerationPlan {
  const validation = validateBrandViCatalog(BRAND_VI_CATALOG)
  if (!validation.ok) throw new Error(validation.errors.join(' '))
  const byId = new Map(BRAND_VI_CATALOG.items.map((item) => [item.id, item]))
  const requested = request.profile === 'minimum' ? minimumIds
    : request.profile === 'core' ? coreIds
      : request.profile === 'full' ? BRAND_VI_CATALOG.items.map((item) => item.id)
        : [...new Set(request.itemIds ?? [])]
  if (request.profile === 'custom' && requested.length === 0) throw new Error('Custom Brand VI profile requires at least one item id.')
  for (const itemId of requested) if (!byId.has(itemId)) throw new Error(`Unknown Brand VI item "${itemId}".`)

  const expanded = new Set<string>()
  function include(itemId: string): void {
    if (expanded.has(itemId)) return
    const item = byId.get(itemId)!
    for (const dependency of item.dependencies) include(dependency)
    expanded.add(itemId)
  }
  requested.forEach(include)
  const nodes = [...expanded].map((itemId) => {
    const item = byId.get(itemId)!
    return {
      ...item,
      itemId,
      status: 'planned' as const,
      paidAction: item.generationModes.some((mode) => mode === 'image-generate' || mode === 'image-edit'),
      executionRoutes: item.generationModes.map(resolveBrandViExecutionRoute),
    }
  })
  return {
    version: 'brand-vi-plan.v1',
    catalogVersion: BRAND_VI_CATALOG.version,
    profile: request.profile,
    requestedItemIds: [...requested],
    nodes,
    estimatedPaidActions: nodes.filter((node) => node.paidAction).length,
    requiresApproval: nodes.some((node) => node.paidAction || node.approval.required),
  }
}
