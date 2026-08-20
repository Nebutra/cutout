# Provider/Model 三层重构与路由治理

## Goal

把 BYOK 配置从「Provider 携带一个默认模型」的两层结构，纠正为清晰的三层：

```
Provider (连接: endpoint + key)
  → Catalog (该连接下真实可用的模型 + 能力证据)
    → Task routing (任务 → providerId + model)
```

并让运行时**真正按任务解析路由**，同时重做 Settings → AI 的用户旅程，使「连接」和「指派」两个动作在界面上不可混淆。

## Background / 现状谬误

1. `ProviderConfig.defaultModel` 是**必填**（`provider-types.ts:115`、`providers.rs:149`），导致连接被迫携带一个模型；用户只能把百炼 provider 命名为 "Qwen Image 3"。
2. 该字段是隐藏的第二路由权威：`automatic-ai-setup.ts:89-92,107-112` 用它做自动路由偏好；`generation-service.local.ts` 7 处 `resolveModel(cfg.kind, cfg.defaultModel, input.model)`；`models.ts:78-84` 再兜底到硬编码 `DEFAULT_MODEL[kind]`，会用用户从未配置过的模型名发请求。
3. Catalog 探测做了但存错地方：`ProviderForm.probeModels()` 的结果写进 **localStorage** 的 verification 记录（`provider-verification.ts:3`），与 providers（Rust JSON）、bindings（`settings.json`）分属三个存储。
4. `ModelSlot` 的模型下拉走 `useEndpointModels`，其 `enabled: Boolean(provider?.baseUrl) && hasKey`（`ai-settings.ts:69`）对无 baseUrl 的直连 provider 永久 disabled → 下拉恒空。
5. `ModelSlot` 折叠态只渲染模型 slug（`ModelSlot.tsx:86`），不显示 provider，读起来像一个全局模型列表。
6. **最严重**：UI 暴露 6 个任务槽（`model-dimensions.ts`），运行时只消费 `projectPrimaryAssignments` 的 2 槽投影（`model-capabilities.ts:21`）。`webdev` / `image-to-webdev` 在 `text` 有值时**永不生效**；`image-edit` 在 `image-generation` 有值时**永不生效**。

## Requirements

### R1 数据契约
- R1.1 `ProviderConfig.defaultModel` 变为可选，并标记为 deprecated（仅用于读旧配置与一次性迁移），Rust / TS / zod 三处一致。
- R1.2 `ProviderConfig` 新增 `catalog?: { models: string[]; fetchedAt: string }`，与 provider 同层持久化（`providers.json`），成为模型清单的唯一真相源。
- R1.3 新建 provider 时不再写入 `defaultModel`；`import_provider_draft` 的 `defaultModel` 入参变为可选，并把 draft 的 checked models 写入 `catalog`。
- R1.4 `resolveModel` 移除 `DEFAULT_MODEL[kind]` 静默兜底；无法解析出模型时调用方返回明确错误，绝不静默替换。

### R2 路由
- R2.1 新增 `resolveTaskAssignment(bindings, task)`，实现**显式且有文档的**任务级回退链（见 design.md），并提供 `useTaskAssignment(task)` hook。
- R2.2 所有生成入口按各自的任务语义解析路由，不再消费 2 槽投影：`generate.ts`、`pipeline.ts`（5 处）、`dag.ts`（2 处）、`AppShell.tsx`、`LibraryDrawer.tsx`、`IntentWorkspace.tsx`。
- R2.3 `automaticBindingsFor` 不再以 `provider.defaultModel` 作为路由偏好，改为基于 catalog + 能力证据。
- R2.4 一次性迁移：已有 `defaultModel` 且 `capabilityBindings` 为空的用户，首次启动时据其种子化 `text` 绑定，保证不丢路由。

### R3 UI/UX 旅程
- R3.1 `ProviderForm` 移除「默认模型」字段；「检查凭证并加载模型」成功后展示「发现 N 个模型」只读预览；保存时持久化 catalog。
- R3.2 `ProviderRow` 展示 catalog 规模与抓取时间；「校验」按钮同时刷新 catalog。
- R3.3 `ModelSlot` 折叠态显示 `provider.label · model`（未绑定显示「自动 · 继承自 <来源任务>」）。
- R3.4 `ModelSlot` 展开态的模型选择改为读 `provider.catalog.models` 的下拉（保留 catalog 不可用时的手动输入逃生舱），不再依赖 `useEndpointModels` 的 baseUrl 门槛。
- R3.5 `AiSection` 重排为显式两步旅程：**第一步 连接提供商** → **第二步 为任务指派模型**，并用文案说明「提供商 = 连接，模型 = 按任务指派」。

### R4 质量
- R4.1 `pnpm lint`、`pnpm typecheck`（`tsc --noEmit -p tsconfig.app.json`）、`pnpm test` 全绿。
- R4.2 `cargo test`（provider / discovery 相关）全绿。
- R4.3 新增回归测试覆盖：任务级回退链、catalog 持久化、旧配置迁移、`resolveModel` 不再静默兜底。

## Constraints

- 不得破坏已存在的 `providers.json` / `settings.json` / localStorage 数据：旧文件必须能读，且不丢用户已有路由。
- API key 仍只在原生层，任何改动不得让密钥进入网页层。
- 保持现有 i18n 机制（`Trans` / `t` 宏），新增文案需带 id。

## Acceptance Criteria

- [ ] 新建一个 DashScope provider 时**不需要**选择模型即可保存，provider 名称可自由填写（如「阿里云百炼」）。
- [ ] 保存后该 provider 行显示其 catalog 模型数量。
- [ ] 「图像生成」槽展开后，模型下拉列出该 provider catalog 内的模型；折叠态显示「阿里云百炼 · qwen-image-3.0-pro」。
- [ ] 把「图像编辑」绑到与「图像生成」不同的模型后，编辑类调用实际使用「图像编辑」绑定的模型（可由测试断言）。
- [ ] 把「网页开发」绑到与「文本理解」不同的模型后，webdev 类调用实际使用「网页开发」绑定的模型。
- [ ] 任何调用都不会使用 `DEFAULT_MODEL[kind]` 里用户从未配置过的模型名。
- [ ] 升级前已有配置的用户，升级后路由不丢失。
- [ ] R4.1 / R4.2 的命令全部通过。
