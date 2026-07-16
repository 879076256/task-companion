# 项目状态

- **阶段**：Phase 6 — 已完成并通过人工验收
- **分支**：`codex/phase-6-review`（基于 `v0.5.0-breakdown`，未合并 main）
- **功能状态**：计时器＋任务选择＋执行会话＋一层子任务＋完成分流与复盘队列
- **长期数据**：会话、子任务事件、`TaskCompanion/Reviews/index.jsonl` 复盘状态和 `TaskCompanion/Reviews/YYYY-MM/*.md` 可读复盘
- **测试数据**：仅仓库内 `test-vault/` 人造任务；运行日志被 Git 忽略，确定性样例位于 `tests/fixtures/`
- **正式 Vault**：未访问、未安装、未修改
- **质量状态**：production build、typecheck、lint、42 个单元/结构测试和 2 个测试 Vault 产物校验全部通过（2026-07-16）

## Phase 6 实现

- `src/core/reviews/`：ReviewEvent、自动统计、JSONL 编解码和可读 Markdown 渲染。
- `TaskCompletionService`：区分简单任务与有档案任务，并在稳定块 ID 冲突时拒绝修改原文。
- 未完成子任务提供返回继续、取消剩余和保留记录并完成三条显式路径。
- `ReviewService`：待复盘事件、复盘 Markdown 与 completed 事件的持久化和幂等重试。
- `ReviewQueueModal` / `ReviewModal`：待复盘队列、已完成复盘重新打开、自动统计和可选文本。
- 完成原任务会立即退出今日/重点扫描结果；复盘保存失败不会回滚复选框。

## 安全与范围

- 不访问正式 Vault；开发与验收只使用仓库测试 Vault。
- 不实现复盘模板、AI、主页接入、经验沉淀或多层子任务。
- 所有新增自动测试只用人造数据；测试 Vault 复盘运行文件由 Git 忽略。
- 不合并 main；用户已确认本阶段验收通过。

## 人工验收结果

- 简单任务完成分流、有执行档案任务进入待复盘队列均符合预期。
- 未完成子任务分流、自动统计、复盘保存和已完成复盘重新打开可用。
- 用户于 2026-07-16 明确确认 Phase 6 验收通过。

## 下一步

建立 Phase 6 Git 检查点与版本标签；不合并 main。Phase 7 等待用户另行批准。
