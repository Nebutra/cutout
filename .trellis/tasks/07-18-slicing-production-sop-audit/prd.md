# 切片生产 SOP 审计与重构

## Goal

梳理并重构 Cutout 切片生产流程：以一个版本化、可恢复、可审计的 Asset Production Runtime 统一原型 region、旧整图导入和 Agent cutout 工具，确保计划路由、质量门禁、产物身份、Design IR provenance、UI 状态和导出消费使用同一权威合同。

## Requirements

- 以当前工作区代码为准，同时标注尚未提交但已经影响运行时的相关改动。
- 区分原型页面自动拆区/切片主链路、传统整图分析切片链路、语义切片实验链路和已移除的手动选区 UX。
- 对每条链路记录触发入口、核心函数、数据结构、状态存储、质量校验、命名、落盘/provenance、画布与 Assets 消费、导出路径。
- 识别设计系统、原型页、切片和素材之间的前置条件及当前实现是否真正强制这些条件。
- 识别并发、取消、重试、部分成功、重复执行和旧结果残留时的行为。
- 给出按严重度排序的问题清单，并以单一权威状态机驱动的新 SOP 完成生产代码重构。
- 实施阶段必须以稳定 asset task id 取代数组位置和文件名推断，所有产物绑定 source revision、plan id、run id、manifest item id 和内容哈希。
- `analysis.slices` 降级为 UI 投影，不再作为生产执行器之间共享的权威写入容器。
- 原型 region、整图导入和 Agent cutout 通过适配器进入同一 runtime；不得保留会静默切换语义的第二套完成状态机。
- `direct-generate`、`board-cutout`、`ignore-code-ui` 必须成为可执行且不可静默改写的路由；semantic single-slice 作为显式 direct/repair executor 接入。
- QA、背景诊断、CV 参数、bounds、review/waive 决策和 provenance 必须持久化并在保存、恢复、Design IR、Assets、Outcome 和 Export 间保持一致。
- 迁移需兼容旧 IndexedDB 项目，将旧 slices 标记为 legacy-imported provenance，不伪造缺失的历史 QA 或 manifest 绑定。

## Acceptance Criteria

- [x] 当前主流程用顺序图或编号流程完整表达，并附关键文件/行号证据。
- [x] 所有并行或遗留切片入口均被列出，说明是否仍可达、与主流程的关系及风险。
- [x] 每一阶段的输入、输出、状态、门禁、失败语义和下游消费者都有明确归属。
- [x] 明确回答“当前 SOP 为什么有问题”，问题按严重度排序且能追溯到实现证据。
- [x] 提供目标 SOP、必要状态不变量和建议的重构边界，足以单独进入后续实现规划。
- [x] 完成复杂重构的 `design.md`，明确权威合同、状态机、执行器边界、迁移和回滚。
- [x] 完成 `implement.md`，把基础设施、三条入口迁移、消费替换和旧路径移除拆成可独立验证的阶段。
- [x] 用户审阅并批准最终设计后，任务才进入 implementation。
- [x] 真实 3×2 效果 E2E 保持六个槽位与裁框完整，并让宽中性投影在深浅背景上自然合成。
- [x] Planner Agent 按产品与平台最佳实践动态决定页面路由结构；新项目完整生成所有计划路由，不把第二流程静默裁成单一主流程。
- [x] 渲染真实 `IntentWorkspace` 的确定性 E2E 验证多流程全部路由、完整页面产物和共享视觉锚点；真实网关失败需与产品回归分开报告。

## Notes

- 审计阶段保持生产代码只读；实施须在最终设计获批并执行 `task.py start` 后开始。
- 用户已于 2026-07-18 同意重构，并授权 Agent 自主权衡质量失败语义；最终设计尚待实施前审阅。

## Quality Gate Decision

- 完整性失败（来源/版本不匹配、缺失输出、越界 bounds、内容哈希错误、manifest 身份不唯一或覆盖不完整）不可 waive，必须修复或重跑。
- 模型 QA 拒绝、QA 服务不可用、背景诊断不合规或其他视觉质量问题进入 `needs-review`；自动重试耗尽后不得冒充 Ready。
- 用户可对可豁免的视觉质量问题执行显式 approve/waive；系统记录 revision-bound decision receipt 后才允许 Ready/Export。
- 旧项目 slices 迁移为 `legacy-unverified`，保留原导出能力并显示警告，不伪造历史 QA、manifest 或 provenance。
