# 项目状态

- **阶段**：Phase 5 — 已完成并通过人工验收
- **分支**：`codex/phase-5-breakdown`（基于 `v0.4.1-sessions`，未合并 main）
- **功能状态**：计时器＋任务选择＋执行会话＋一层子任务拆解和分项统计
- **长期数据**：会话写 `TaskCompanion/Sessions/YYYY-MM.jsonl`；子任务事件写 `TaskCompanion/Subtasks/tc-xxxxxx.jsonl`
- **测试数据**：仅仓库内 `test-vault/` 人造任务；运行日志被 Git 忽略，确定性样例位于 `tests/fixtures/`
- **正式 Vault**：未访问、未安装、未修改
- **质量状态**：production build、typecheck、lint、32 个单元/结构测试和 2 个测试 Vault 校验全部通过（2026-07-16）

## Phase 5 实现

- `src/core/subtasks/`：单层模型、追加事件折叠、状态约束和投入统计。
- `src/services/subtask-repository.ts`：按稳定 taskId 的 JSONL 读取与幂等追加。
- `src/services/subtask-service.ts`：添加、改名、原子排序、完成、取消、返工和当前下一步。
- `src/ui/subtask-manager-modal.ts`：最小拆解、进度与分项时间界面。
- `src/ui/execution-target-modal.ts`：选择直接推进母任务或一个活动子任务。
- ExecutionSession 升级为 schemaVersion 2；旧 v0/v1 自动迁移为母任务直接投入。
- 计时状态固定 subtaskId，暂停、恢复、重载和完成不会漂移目标。

## 安全与范围

- 不访问正式 Vault；开发与验收只使用仓库测试 Vault。
- 子任务严格一层，没有 parentSubtaskId 或递归结构。
- 不实现依赖、甘特图、复杂拖拽、AI、模板界面、正式复盘或主页接入。
- 不合并 main；用户已确认本阶段没有其他问题。

## 人工验收结果

- 添加、改名、排序、标记完成、取消和恢复为进行中的操作可用。
- 活动子任务选择规则正确；没有活动子任务时直接推进母任务。
- 根据人工反馈澄清“标记完成 / 取消子任务 / 恢复为进行中”文案。
- 用户于 2026-07-16 明确确认 Phase 5 无问题并批准进入下一阶段。

## 下一步

建立 Phase 5 Git 检查点后，从该基线创建 Phase 6 独立分支；不合并 main。
