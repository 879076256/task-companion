# 路线图

## Phase 0：安全环境、架构与文档（已完成）

- 独立 Git 仓库与目录边界。
- 完整长期文档（PRODUCT、TASK_RULES、DATA_MODEL、ACCEPTANCE、DECISIONS 等）。
- 官方 Sample Plugin 基线与质量命令。
- 测试 Vault 任务样例覆盖主要任务状态。
- 正式 Vault 未被访问或修改。

## Phase 1：插件骨架与工程基线（已完成）

- `core`、`adapters`、`ui`、`services`、`settings` 五层源码目录。
- 实现 `onload`/`onunload`、测试命令、简单 Modal、基础设置项和错误日志。
- production build 可安装到仓库内 `test-vault/`。
- build、typecheck、lint、unit tests 全部通过。

## Phase 2：可靠计时器与状态组件（已完成，待人工验收）

- Core 层纯 TypeScript 计时状态机（idle / running / paused / finished）。
- 支持 25 分钟、50 分钟、自由计时、开始、暂停、继续、正常完成、提前结束、重置。
- 绝对时间戳计算，暂停时保存 remainingSeconds。
- 同一时间只允许一个活动会话。
- 短期计时状态持久化到插件 data.json。
- Obsidian 重载后状态恢复。
- 可选系统通知和声音提醒（失败不影响核心）。
- 注册 `taskcompanion` 自定义代码块（`view: status`）。
- 计时控制 Modal。
- 多个 status 组件共享同一计时服务并同步更新。
- 状态机单元测试 10/10 通过。

## Phase 3：正式任务识别与任务选择（未开始）

- 扫描 Vault 中的 Tasks 任务。
- 正式任务过滤（⏫🔼🔽⏬🔁）。
- 今日待办、重点任务、去重。
- 稳定任务 ID。
- 任务选择 Modal 并绑定计时器。

## Phase 4：执行会话、进展记录与当前下一步（未开始）

## Phase 5：一层任务拆解与进度（未开始）

## Phase 6：任务完成分流与复盘（未开始）

## Phase 7：嵌入式组件与主页副本集成（未开始）

## Phase 8：经验沉淀与扩展接口（未开始）

## Phase 9：稳定测试、发布构建与正式安装（未开始）