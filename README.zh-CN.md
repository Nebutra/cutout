# Cutout

面向 Agent 的设计操作系统，将产品证据转化为可评审的设计系统、原型、物料与实现起始工程。

[English](README.md) | **简体中文**

## Cutout 是什么

Cutout 是一个 Agent-native Design OS。它把想法、需求、截图、本地文件和代码仓库整理为可版本化、可审查的设计系统、原型、品牌物料和实现起始工程。

Cutout 的权威数据不是聊天记录或截图，而是项目中的 `.cutout` Design IR 与 provenance。来源、需求、设计令牌、物料、页面路由、组件来源、生产状态和修订历史都能被人类与编码 Agent 检查。

产品由三个协同入口组成：

- **Cutout 桌面端**：可视化设计、评审和交付工作台。
- **CLI 与本地 MCP**：让自动化客户端读取同一份项目状态并执行受控操作。
- **Codex 插件**：把 Cutout 工作流 Skill 和自包含 MCP Runtime 安装进 Codex。

它们消费同一份 `.cutout` 状态，不通过 GUI 自动化互相控制，也不会维护第二套项目状态。

## 安装 macOS App

从 [Cutout v0.1.5 Release](https://github.com/Nebutra/cutout/releases/tag/v0.1.5) 下载 Apple Silicon DMG，然后将 Cutout 拖入 Applications。

公开的 macOS 构建会在发布前完成 Developer ID 签名、Apple 公证和票据装订。

## 安装 Codex 插件

需要 Codex CLI `0.144.5` 或兼容的插件版本。

```bash
codex plugin marketplace add Nebutra/cutout --ref v0.1.5
codex plugin add cutout@cutout-local
codex plugin list
```

`codex plugin list` 应显示：

```text
cutout@cutout-local  installed, enabled  0.1.5
```

Codex 在会话开始时捕获插件的 Skill 和 MCP 工具。安装或更新插件后，请新建会话。

#### 绑定受控项目

本地 MCP 必须由宿主通过 `CUTOUT_PROJECT_ROOT` 绑定到唯一项目。这个路径不能由 MCP 工具参数替换，插件也不会扫描主目录、父目录或相邻目录来猜测项目。

终端启动 Codex：

```bash
export CUTOUT_PROJECT_ROOT=/absolute/path/to/the/controlled/project
codex
```

从 Dock 启动 Codex 桌面端：

```bash
launchctl setenv CUTOUT_PROJECT_ROOT "/absolute/path/to/the/controlled/project"
```

设置后完全退出并重新打开 Codex，再新建会话。目标目录必须是包含有效 `.cutout` 状态的 Cutout 项目；不要把 Cutout 源码仓库当作设计项目绑定。

如果变量缺失，能力发现和 Skill 阅读仍可使用，但项目工具会返回 `project-binding-required`，不会读取或写入任意目录。

## Codex 插件如何工作

```text
用户请求
  -> Codex 加载 cutout-controller Skill
  -> 启动插件内置的本地 stdio MCP Runtime
  -> 通过 CUTOUT_PROJECT_ROOT 绑定唯一项目
  -> handshake + capability status + progressive Skill read
  -> 读取 .cutout Design IR 与 provenance
  -> preview -> 显式批准 -> apply -> 校验与交付物回读
```

写操作遵循以下约束：

- `.cutout` Design IR 与 provenance 是权威数据，导出物只是可再生投影。
- 先预览，再应用；需要批准的操作必须使用真实、非伪造的 approval id。
- 调用方不能指定任意输出目录，受管理导出限制在 `.cutout/exports/`。
- 写入后必须重新读取结果并验证交付物元数据与哈希。
- MCP 不暴露凭证、任意文件系统访问或桌面内部 Agent Host 生命周期。

推荐的首次请求：

```text
使用 Cutout 检查当前项目，读取设计系统和全部原型页面。
先展示变更预览，不要直接应用。
```

## 当前能力

- Tauri 2 + React 19 桌面工作台。
- 可观察的多轮 Agent 活动、结果清单、附件、模型路由和思考控制。
- 确定性本地图像抠图、边缘处理和物料生产链路。
- 版本化 `design-ir.v1`、内容寻址资产与 provenance-aware 来源摄取。
- Agent 规划的多路由原型，以及跨页面共享的设计系统上下文。
- Design Kit、Brand/VI Kit、组件清单和 Next.js/Vite starter 编译。
- `cutout.control.v1` CLI 与 stdio MCP，包含幂等 request id、乐观修订、持久运行事件和取消语义。
- 受策略与批准约束的本地写入和确定性交付物回读。

## 当前不提供

Cutout 目前不宣称实现以下能力：

- 公网 OAuth HTTP MCP 或云端项目服务；
- 实时 Figma 同步；
- 网页抓取或搜索；
- 视频处理；
- 云端多人协作；
- 内置 headless 模型 provider；

Figma 适配器只消费调用方明确提供的授权快照；URL 摄取只记录不含凭证的描述符，不会抓取网页。公网 OAuth HTTP MCP 是 roadmap 项目，不是当前能力。

## CLI 快速开始

能力清单的机器可读权威来源是 [`cutout.agent-capabilities.json`](cutout.agent-capabilities.json)，其 schema 位于 [`schemas/cutout.agent-capabilities.schema.json`](schemas/cutout.agent-capabilities.schema.json)。

```bash
pnpm agent:validate
pnpm cutout --project . context --include summary,outcome,run-events
pnpm cutout --project . materials
pnpm cutout --project . validate
pnpm cutout --project . ingest --repo .
pnpm cutout --project . export-kit
pnpm cutout --project . export-starter --framework vite-react
```

需要批准的应用操作：

```bash
pnpm cutout --project . export-kit --apply --approval <opaque-approval-id>
```

## 项目与导出约定

受控项目将 manifest、Design IR、策略、资产索引、运行事件和控制账本存放在 `.cutout/`。二进制对象使用 SHA-256 内容寻址。

```text
.cutout/exports/design-kit/
.cutout/exports/brand-kit/
.cutout/exports/starter/
```

生成文件是不可变、可哈希校验的投影。需要修改时应更新来源证据或 Design IR 并重新编译，而不是把生成的 token 或 starter 当作源数据编辑。

## 开发

```bash
pnpm install
pnpm dev                 # 浏览器工作台与热更新
pnpm tauri dev           # 桌面端与热更新
pnpm test                # 单元测试与契约测试
pnpm test:visual         # Playwright 视觉测试
pnpm agent:validate      # Agent/CLI/MCP/manifest 一致性
pnpm plugin:build        # 重建自包含 Codex 插件 Runtime
pnpm plugin:validate     # 验证插件、Skill、MCP 与打包模块
pnpm build               # TypeScript、生产构建与 bundle gate
pnpm tauri build         # 桌面安装包
```

技术栈：Tauri 2、React 19、Vite 8、TypeScript、Tailwind v4、shadcn/ui。

深入阅读：[Codex 插件](docs/CODEX_PLUGIN.md) · [Agent 集成](docs/AGENT_INTEGRATION.md) · [Headless Agent Control](docs/HEADLESS_AGENT_CONTROL.md) · [AI Native](docs/AI_NATIVE.md)
