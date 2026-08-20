# Design — Provider/Model 三层重构与路由治理

## 1. 目标结构

```
Layer 1  ProviderConfig      连接：kind + label + baseUrl + wireProtocol + enabled  (+ keychain 里的 key)
Layer 2  ProviderConfig.catalog   该连接实际广告的模型清单 { models, fetchedAt }
Layer 3  CapabilityBindings   任务 → { providerId, model, fallbackModel?, effort? }
```

不变量：

- **L1 不含任何模型选择。** `defaultModel` 降级为 deprecated 只读字段，仅用于读旧文件与一次性迁移。
- **L2 与 L1 同层持久化**（`providers.json`），不再散落在 localStorage。localStorage 的 `provider-verification` 只保留「上一次探测的结论」（status / checkedAt / detail），不再是模型清单的载体。
- **L3 是运行时唯一的路由权威。** 没有任何调用路径可以绕过它去猜模型。

## 2. 契约变更

### 2.1 `ProviderConfig`（`src/services/ai/provider-types.ts` + `src-tauri/src/commands/ai/providers.rs`）

```ts
export interface ProviderCatalog {
  readonly models: readonly string[]
  /** ISO 时间戳，来自最近一次成功的凭证探测。 */
  readonly fetchedAt: string
}

export interface ProviderConfig {
  readonly id: string
  readonly kind: ProviderKind
  readonly label: string
  readonly baseUrl?: string
  readonly wireProtocol?: ProviderWireProtocol
  readonly enabled: boolean
  /** L2：该连接广告的模型。缺失代表尚未探测或端点不提供清单。 */
  readonly catalog?: ProviderCatalog
  /**
   * @deprecated L1 不再拥有模型。仅为读取旧 `providers.json` 与一次性
   * 迁移（seed `text` 绑定）保留；新建 provider 永不写入。
   */
  readonly defaultModel?: string
}
```

Rust 侧镜像：`default_model: Option<String>`、`catalog: Option<ProviderCatalog>`，二者都带
`#[serde(default, skip_serializing_if = "Option::is_none")]`。serde 默认忽略未知字段并接受
缺失的 `Option`，所以**旧 `providers.json` 可直接读**，新写出的文件不再含 `defaultModel`。

`ImportDraftInput.default_model` → `Option<String>`；`import_provider_draft` 改为把
`draft.checked_models` 写进 `catalog`，并**移除**「default_model 必须在 models 里」的校验。

### 2.2 `resolveModel`（`src/services/ai/models.ts`）

```ts
// 旧：resolveModel(kind, configDefault, override) -> string      （静默兜底 DEFAULT_MODEL[kind]）
// 新：
export function resolveModel(override: string | undefined): string | undefined
```

`generation-service.local.ts` 的 7 处调用点改为：解析不出模型时返回
`err('no model is bound for this call — assign one in Settings → AI')`，绝不静默替换。

`DEFAULT_MODEL` / `SUGGESTED_MODELS` 随「默认模型」表单字段一起删除；`POPULAR_MODELS`
保留，用于 catalog 不可用时 ModelSlot 的手动输入建议。

### 2.3 `provider-verification`（localStorage）

```ts
type ProviderVerification = { status; checkedAt?; detail? }   // 去掉 model / models
```

读取模型清单的**唯一**入口变成：

```ts
providerCatalogModels(provider): readonly string[]            // provider.catalog?.models ?? []
providerRouteVerified(provider, verification, model?): boolean // 校验通过 && (无 model 要求 || catalog 含该 model)
```

`ProviderService.test()` 返回值由 `{ model, models }` 收敛为 `{ models }`
（`model` 原本就是 `cfg.defaultModel` 的回声，没有信息量）。

## 3. 任务路由解析器

新文件 `src/services/ai/task-routing.ts`：

```ts
/** 任务未绑定时，允许回退到哪个更一般的任务。链条是显式的、有序的、有文档的。 */
const FALLBACK: Record<ModelTaskKind, readonly ModelTaskKind[]> = {
  text:               [],
  vision:             ['text'],
  research:           ['text'],
  webdev:             ['text'],
  'image-to-webdev':  ['vision', 'webdev', 'text'],
  'image-generation': [],
  'image-edit':       ['image-generation'],
  asr: [], tts: [], 'video-generation': [], 'video-edit': [],
}

export function resolveTaskRoute(
  bindings: CapabilityBindings['bindings'] | undefined,
  task: ModelTaskKind,
): { assignment: ModelAssignment; inheritedFrom?: ModelTaskKind } | undefined

/** Same, discarding provenance. */
export function resolveTaskAssignment(...): ModelAssignment | undefined

/** The inheritance chain, so the UI and the coverage summary cannot drift. */
export function taskFallbackChain(task: ModelTaskKind): readonly ModelTaskKind[]
```

- 回退是**路由**回退，不是能力担保；能力门禁仍由既有的 `requiresVerifiedVision` /
  `assessImageRoute` 负责。返回的 `inheritedFrom` 供 UI 显示「继承自「文本理解」」。
- `image-generation` 与 `text` 是链条根，无回退 —— 它们没配就是真的没配。
- `projectPrimaryAssignments` 改为基于本解析器实现，语义与今日**完全等价**，所以
  Agent run 的 chat/image 双槽锁定（`composer-execution.ts`、`IntentWorkspace` 的
  `lockedRouteRef`）行为不变。`ModelAssignments` 的角色被重新定义为
  「一次运行内的双槽覆盖视图」，不再是设置层的路由表。

新 hook：`useTaskAssignment(task)`（`src/hooks/queries/ai-settings.ts`），基于
`useCapabilityBindings()` 派生，返回 `{ assignment, inheritedFrom, isPending }`。

### 3.1 调用点 → 任务映射

映射准则：**按实际使用的传输/能力**归类，不按功能名臆测，避免语义漂移。

| 调用点 | 今日 | 新任务 |
|---|---|---|
| `generate.ts` `useGenerateFromProto` → `generateImages` | `image` | `image-generation` |
| `pipeline.ts:167` `useGenerateMockup` → `generateImages` | `image` | `image-generation` |
| `pipeline.ts:299` `useDeconstructMockup` → `editImage`/多模态 | `image` | `image-edit` |
| `pipeline.ts:357` `useComposeMockup` → `generateImages` | `image` | `image-generation` |
| `pipeline.ts:409` `useComposeFromLibrary` → `generateImages` | `image` | `image-generation` |
| `pipeline.ts:500` `useNameSlices`（喂 board bitmap） | `chat` | `vision` |
| `dag.ts` `useRunPlan` / `useRerunNode` chat | `chat` | `text` |
| `dag.ts` `createNodeRunner` `generate-image` op | `image` | `image-generation` |
| `dag.ts` `createNodeRunner` `edit-image` / `deconstruct` op | `image` | `image-edit` |
| `AppShell.tsx:1103` `composeDemoHtmlWithAgent`（产出 demo.html） | `chat` | `webdev` |
| `LibraryDrawer.tsx:41` 有无图像模型的门禁 | `image` | `image-generation` |
| `IntentWorkspace` `hasChatModel` | `chat` | `text` |

`createNodeRunner` 的签名由 `(services, image, chat, imageKind)` 改为
`(services, routes: { imageGeneration, imageEdit, chat }, kindOf)`，`imageKind` 改为按算子
所用的 provider 现算，因为两条图像路由可能指向不同 provider。

## 4. 迁移

`src/services/ai/legacy-binding-migration.ts`：

```ts
export function seedBindingsFromLegacyProviders(
  providers, bindings,
): CapabilityBindings['bindings'] | undefined
```

纯函数。当 `bindings` 为空且存在带 `defaultModel` 的 enabled provider 时，用第一个这样的
provider 生成 `{ text: { providerId, model: defaultModel } }`（图像路由留给自动探测，
因为旧的 `defaultModel` 无法证明图像能力）。

执行时机：`AppShell` 挂载时的一次性 effect（`useLegacyBindingMigration()`），以
`settings.json` 里的 `ai.legacyBindingMigration.v1` 标记做幂等守卫 —— 用户从不打开
Settings 也能完成迁移。

`automaticBindingsFor` 中两处 `provider.defaultModel` 偏好（`automatic-ai-setup.ts:89-92`、
`:107-112`）直接删除；chat 候选退化为「catalog 内第一个满足 `TEXT_MODEL` 且非图像模型」，
image 候选完全由 `sortImageRouteRecommendations` 的能力证据决定。

## 5. UI/UX 旅程

### 5.1 `AiSection` 结构

```
[AI 状态总览]                      ← AiSetupOverview，保持不变

▾ 高级 AI 管理
  ① 连接提供商                     ← 「提供商是一个连接（地址 + 密钥），不是一个模型。」
     [openai-compatible] MOX
        校验通过 · aigw.mox.ktvsky.com · 38 个模型 · 2 小时前
        [校验] [编辑] [删除]
     [+ 添加提供方]

  ② 为任务指派模型                 ← 「在这里决定每个环节用哪个提供商的哪个模型。」
     文本理解        MOX · gpt-5.6-terra
     视觉    [需要视觉能力]  MOX · gpt-5.6-terra
     网页开发        自动 · 继承自「文本理解」
     图像转网页 [需要视觉能力] 自动 · 继承自「视觉」
     图像生成        阿里云百炼 · qwen-image-3.0-pro
     图像编辑        自动 · 继承自「图像生成」

  ③ SVG 导出
```

### 5.2 `ProviderForm`

移除「默认模型」字段与 `canSave` 中对它的依赖。`probeModels()` 成功后展示只读结果：

- 成功：`已发现 38 个模型 · 可在「为任务指派模型」中选择`，附前若干个 chip 预览。
- `catalog-unsupported`：`该端点不提供模型清单。仍可保存；指派模型时手动输入模型 ID。`
  并放开保存（不再要求填模型）。

保存时把 `catalog: { models: probedModels, fetchedAt }` 一并写入 provider。

### 5.3 `ProviderRow`

副行追加 `N 个模型 · <relative fetchedAt>`；catalog 缺失时显示 `模型清单未获取`。
「校验」成功后写回 `catalog` 并刷新 providers 查询 —— **校验 = 刷新模型清单**，
全应用只有这一条 catalog 写入路径（加上新建时的 draft import）。

### 5.4 `ModelSlot`

- 折叠态右侧：`providerLabel · model` ／ `自动 · 继承自「X」` ／ `不可用`（无 provider 时）。
- 展开态：
  - provider `Select`：选项文案 `label（N 个模型）`。
  - model `Select`：选项来自 `providerCatalogModels(selected)`；catalog 为空时自动切换到
    手动输入，并提供「刷新模型清单」按钮（走同一条 `test` 探测）。
  - 已有的 fallback model 输入、证据行、视觉/图像路由提示保留，证据文案改用
    catalog 的 `fetchedAt` 而不是 `useEndpointModels` 的成功态。
- 不再使用 `useEndpointModels`（该 hook 的 `enabled: Boolean(provider?.baseUrl) && hasKey`
  对直连 provider 永久为假）。hook 本身保留但从 ModelSlot 解耦。

## 6. 兼容与回滚

- **数据向后兼容**：旧 `providers.json` 中的 `defaultModel` 仍可解析；catalog 缺失时 UI
  引导用户点「校验」补齐。localStorage 里旧的 `models` 字段被 zod `.strict()` 拒绝会
  导致整条记录解析失败 → 因此 verification schema 对多余字段改为**宽容**（去掉
  `.strict()` 或显式 `.passthrough()`），退化为 `unverified` 而不是抛错。
- **回滚**：本次改动全部在 TS/Rust 源码内，无数据破坏性写入（不删除旧字段的磁盘内容），
  `git revert` 即可回到旧行为；已迁移用户的 bindings 是新增数据，旧版本会忽略。

## 7. 风险

| 风险 | 缓解 |
|---|---|
| `IntentWorkspace` 有 10+ 处读 `verification.models` | 统一替换为由 `providers.data` 的 catalog 构建的映射；类型改动会让编译器把遗漏点全部指出来 |
| `dag.ts` 拆分图像双路由后 `imageKind` 语义变化 | `imageKind` 改为按算子实际使用的 provider 现算，并补单测覆盖 generate/edit 走不同 provider 的场景 |
| 大量测试引用 `defaultModel` | 字段保留为 optional，旧测试仍可编译；仅断言其**不再影响路由**的测试需要改写 |
| `test()` 返回值收窄 | 一次性改完全部调用点，由 typecheck 保证无遗漏 |

## 8. 实现与本设计的差异（已落地）

- 解析器主入口叫 `resolveTaskRoute`（返回 `inheritedFrom`），`resolveTaskAssignment` 是丢弃出处的薄封装；另导出 `taskFallbackChain`，让 `model-routing-summary` 复用同一张表，消除它原本自带的一份会漂移的回退映射。
- `verifyProviderCatalog` 的 catalog 落盘是**尽力而为**：凭证已被证明可用时，一次写盘失败不应把成功的校验判为失败。
- Rust 无日期库，新增 `iso_timestamp_from_epoch_secs`（Howard Hinnant civil-from-days，含闰日单测），使 `catalog.fetchedAt` 能在原生层原子生成。
- `useEndpointModels` / `listEndpointModels` 整条删除，而非仅从 `ModelSlot` 解耦：它对无 `baseUrl` 的直连 provider 永久 disabled，正是模型下拉恒空的根因，留着只会被再次误用。
- `ProviderRow` 的抓取时间用 `Intl.RelativeTimeFormat`（`catalog-age.ts`），跟随当前语言，不新增逐语言文案。
- `provider-service.local.ts` 的 `materialize()` 原本逐字段重建配置，会丢弃 `catalog`；已修，并补回归测试。
