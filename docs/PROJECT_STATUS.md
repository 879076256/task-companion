# 项目状态

- **阶段**：Phase 3 重做 — 已完成并通过人工验收
- **分支**：`codex/phase-3-task-selection-redo`（基于 `v0.2.0-timer`，未合并 main）
- **功能状态**：计时器＋正式任务识别＋安全稳定 ID＋任务选择和母任务绑定
- **数据状态**：仅稳定 ID 写入任务行；当前 taskId 和计时状态保存到 data.json
- **测试数据**：仅仓库内 `test-vault/Phase 3 Tasks.md` 人造任务
- **正式 Vault**：未访问、未安装、未修改
- **质量状态**：build、typecheck、lint、20 个单元/结构测试、测试 Vault 产物校验全部通过（2026-07-16）

## Phase 3 实现

- `src/core/tasks/task-rules.ts`：解析、正式任务过滤、日期规则、重点/日常分类和去重。
- `src/core/tasks/task-id.ts`：稳定 ID 验证、提取、追加和防碰撞生成。
- `src/adapters/tasks/task-scanner.ts`：逐文件扫描、完整内容/原行校验、失败隔离。
- `src/adapters/obsidian/obsidian-task-vault.ts`：Obsidian Vault 的最小访问适配。
- `src/ui/task-selection-modal.ts`：搜索、刷新、分类、日期、来源和选择操作。
- `src/main.ts`：注册选择命令、打开来源、绑定母任务、活动计时切换保护。

## 安全与兼容性

- 扫描由用户命令显式触发，无后台监听或轮询。
- 通知只显示失败数量，不包含任务正文。
- 使用 `Vault.process` 做安全读改写，因此最低 Obsidian 版本从 1.0.0 准确提升到 1.1.0。
- Phase 4 ExecutionSession 代码未进入本分支。

## 人工验收结果

- 已在仓库内测试 Vault 启用插件。
- 分类、搜索、刷新、稳定 ID 写入与来源跳转通过。
- 选择任务、计时控制重开和活动计时切换保护通过。
- 人工验收发现的两个问题已修复并增加回归测试。

## 发布状态

- Phase 3 重做版本计划提交到 `codex/phase-3-task-selection-redo`。
- 旧标签 `v0.3.0-task-selection` 保留作为历史错误实现，不移动。
- 本次正确版本使用 `v0.3.1-task-selection`。

## 人工验收修复

- 来源跳转成功后关闭选择器，确保来源笔记不会被 Modal 遮挡。
- 活动计时期间点击当前母任务会重新打开计时控制；只有其他任务被拒绝。
