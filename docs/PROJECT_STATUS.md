# 项目状态

- **阶段**：Phase 2 — 可靠计时器与状态组件，待人工验收
- **分支**：`phase-2-timer`（未合并 `main`）
- **功能状态**：计时状态机、代码块嵌入、计时控制 Modal；无任务功能
- **数据状态**：短期计时持久化到 data.json；无真实 Vault 内容写入
- **测试状态**：构建产物已安装到仓库内 `test-vault/`
- **发布状态**：未安装到正式 Vault、未发布
- **质量状态**：build、typecheck、lint、unit tests（10/10）全部通过（2026-07-16）

## Phase 2 实现

### Core 层
- `src/core/timer/model.ts` — TimerState 联合类型（idle/running/paused/finished）、TimerMode、StartTimerInput
- `src/core/timer/state-machine.ts` — 纯函数状态机（start/pause/resume/finishEarly/reset/reconcile/getRemainingSeconds）
- `src/core/timer/serialization.ts` — 持久化恢复与校验

### 服务层
- `src/services/timer-service.ts` — 单例计时服务，包装状态机，管理订阅通知，interval 驱动每秒更新

### UI 层
- `src/ui/status-code-block.ts` — `taskcompanion` 代码块处理器（`view: status`）
- `src/ui/timer-control-modal.ts` — 计时控制 Modal（模式选择、开始、暂停、继续、结束、重置）
- `src/ui/status-modal.ts` — 保留 Phase 1 测试 Modal

### 设置
- `src/settings/model.ts` — 保留 `showTechnicalDetails`
- `src/settings/settings-tab.ts` — 保留 Phase 1 设置页

### 主入口
- `src/main.ts` — 初始化 TimerService，注册状态恢复、代码块、计时命令和设置

### 测试
- `tests/timer-state-machine.test.mjs` — 10 个测试，覆盖所有状态转换路径
- `tests/skeleton.test.mjs` — 5 个测试（更新）
- `tests/core.test.mjs` — 2 个测试

## 卸载与清理

- TimerService.dispose() 清除 interval 和订阅者
- onunload 遍历 activeModals 逐个关闭

## 当前风险与待验收项

- 尚未在 Obsidian UI 内人工启用测试 Vault 验证计时器和代码块
- 系统通知和声音提醒尚未实现（容错空实现）
- 计时控制 Modal 外观尚需打磨

## 下一决策点

人工验收 Phase 2 后，再决定是否批准 Phase 3。未确认前停止开发。