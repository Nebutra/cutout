# Implement — Provider/Model 三层重构与路由治理

## 验证命令

```bash
pnpm lint
npx tsc --noEmit -p tsconfig.app.json        # 注意：-p . 在本仓库是静默 no-op
pnpm test
cargo test --manifest-path src-tauri/Cargo.toml providers
cargo test --manifest-path src-tauri/Cargo.toml provider_discovery
pnpm i18n:extract                             # 新文案入目录
```

## 阶段 A — 数据契约（L1/L2）

- [x] A1 `provider-types.ts`：新增 `ProviderCatalog` + `catalog?`，`defaultModel` 改 optional 并标 `@deprecated`；同步 `providerConfigFields` zod（`defaultModel` → `.optional()`，新增 `catalog`）。
- [x] A2 `providers.rs`：`default_model: Option<String>`、新增 `catalog: Option<ProviderCatalog>`，均带 `#[serde(default, skip_serializing_if = "Option::is_none")]`；修 `validate_providers` 与既有 Rust 测试 fixture。
- [x] A3 `provider_discovery.rs`：`ImportDraftInput.default_model` → `Option<String>`；`import_provider_draft` 写 `catalog`，删除 default_model ∈ models 的校验；`automatic_default_model` 改为 `automatic_catalog`（返回模型清单），自动配置路径写 catalog。
- [x] A4 `models.ts`：删 `DEFAULT_MODEL` / `SUGGESTED_MODELS`；`resolveModel(override)` 收敛为 `string | undefined`。
- [x] A5 `generation-service.local.ts`：7 处调用点改为解析失败即 `err(...)`；`provider-service.local.ts` 的 `test()` 返回 `{ models }`。
- [x] A6 `provider-verification.ts`：记录收敛为 `{status, checkedAt?, detail?}`（schema 对旧的多余字段宽容）；新增 `providerCatalogModels(provider)` 与 `providerRouteVerified(provider, verification, model?)`。

**门禁 A**：`npx tsc --noEmit -p tsconfig.app.json` 只剩下「调用点未适配」类错误；`cargo test` 全绿。

## 阶段 B — 路由（L3）

- [x] B1 新建 `src/services/ai/task-routing.ts`：`FALLBACK` 表 + `resolveTaskAssignment()`；配套单测覆盖每条回退链与 `inheritedFrom`。
- [x] B2 `model-capabilities.ts` 的 `projectPrimaryAssignments` 基于 B1 重写（语义等价，保留 Agent run 双槽覆盖）。
- [x] B3 `ai-settings.ts` 新增 `useTaskAssignment(task)`。
- [x] B4 按 design.md §3.1 的映射表逐一改造调用点：`generate.ts`、`pipeline.ts`(5)、`dag.ts`(含 `createNodeRunner` 拆双图像路由)、`AppShell.tsx`、`LibraryDrawer.tsx`、`IntentWorkspace.tsx`。
- [x] B5 `automatic-ai-setup.ts`：删除两处 `provider.defaultModel` 路由偏好，chat/image 候选完全由 catalog + 能力证据决定。
- [x] B6 新建 `legacy-binding-migration.ts` + `useLegacyBindingMigration()`，在 `AppShell` 挂载时幂等执行（守卫键 `ai.legacyBindingMigration.v1`）。

**门禁 B**：`pnpm test` 全绿；新增测试证明「image-edit 绑定与 image-generation 不同的模型时，编辑调用使用前者」「webdev 绑定与 text 不同时，webdev 调用使用前者」。

## 阶段 C — UI/UX 旅程

- [x] C1 `ProviderForm`：移除「默认模型」字段与相关状态；探测结果改为只读的「已发现 N 个模型」预览；`catalog-unsupported` 时放开保存；保存写入 catalog。
- [x] C2 `ProviderRow`：副行显示模型数与相对时间；「校验」写回 catalog 并刷新 providers。
- [x] C3 `ModelSlot`：折叠态 `providerLabel · model` / `自动 · 继承自「X」`；展开态 provider+model 双 `Select`（来源 catalog）+ 手动输入逃生舱 + 刷新按钮；解除对 `useEndpointModels` 的依赖。
- [x] C4 `AiSection`：重排为「① 连接提供商 / ② 为任务指派模型 / ③ SVG 导出」，补两层关系的说明文案。
- [x] C5 新文案全部走 `Trans` / `t` 宏并带稳定 id；跑 `pnpm i18n:extract`。

**门禁 C**：`pnpm lint` + typecheck + `pnpm test` 全绿；人工按 prd.md 验收清单逐条走查。

## 阶段 D — 收尾

- [x] D1 更新 `.trellis/spec/frontend/byok-provider-protocols.md` 中 `defaultModel` 的描述与三层模型。
- [x] D2 全量 `pnpm lint && npx tsc --noEmit -p tsconfig.app.json && pnpm test && cargo test`。
- [ ] D3 提交。

## 回滚点

- A 阶段结束、B 阶段结束、C 阶段结束各自是独立可编译的提交点；出问题从最近一个门禁 revert。

## 计划外的发现（已修）

- `provider-service.local.ts` 的 `materialize()` 逐字段重建 `ProviderConfig`，会丢弃 `catalog` —— 任何一次编辑（哪怕只是改名）都会抹掉刚探测到的模型清单。已修，并补了回归测试
  `carries the probed catalog through an unrelated edit`。
- `verifyProviderCatalog` 的 catalog 持久化改为尽力而为：凭证明确可用时，一次写盘失败不应把成功的校验变成失败。
- `model-routing-summary.ts` 自带一张与运行时不同步的回退表，已改为复用 `taskFallbackChain`。
- Rust 无日期库，为 `catalog.fetchedAt` 写了 `iso_timestamp_from_epoch_secs`（含闰日单测），使原生层能原子写入 catalog。
