# 验收标准

## Phase 0：安全开发环境

- [x] 当前工作区是独立 Git 仓库，默认分支为 `main`。
- [x] 存在 `task-companion/`、`test-vault/`、`docs/`、`reference/`。
- [x] 插件骨架可追溯到 Obsidian 官方 Sample Plugin。
- [x] 根目录存在适用于本项目的 `AGENTS.md`。
- [x] 全部指定规划文档均存在并包含第一版内容。
- [x] `package.json` 提供 `build`、`typecheck`、`lint`、`test`。
- [x] `npm run build` 成功。
- [x] `npm run typecheck` 成功。
- [x] `npm run lint` 成功。
- [x] `npm test` 成功。
- [x] 插件源码不含计时器、周期轮询、全局事件监听、遥测或网络请求（Phase 0 要求）。
- [x] 仓库不含真实任务或正式 Vault 内容。
- [x] `test-vault/` 明确标记为仅允许人造测试数据。
- [x] 用户确认 Phase 0，授权进入 Phase 1。

## Phase 1：插件骨架与工程基线

- [x] 插件可构建。
- [x] 插件能在测试 Vault 启用。
- [x] 禁用后没有残留事件或 DOM。
- [x] 设置能够保存。
- [x] 测试命令可执行。
- [x] `typecheck`、`lint`、`test`、`build` 全通过。
- [x] 目录分层与架构文档一致。
- [x] 没有业务功能提前混入。

## Phase 2：可靠计时器与 status 嵌入组件

- [x] Core 层以纯 TypeScript 实现 `idle`、`running`、`paused`、`finished` 状态机。
- [x] 支持 25 分钟、50 分钟和用户输入的自由时长，以及开始、暂停、继续、正常完成、提前结束、重置。
- [x] 运行态使用绝对结束时间计算剩余秒数；暂停态显式保存 `remainingSeconds`。
- [x] 运行态或暂停态拒绝重复启动，同一时间最多一个活动会话。
- [x] 短期计时状态与插件设置共同保存到插件 `data.json`，无 Vault 内容读写。
- [x] Obsidian 重载后恢复计时；若绝对结束时间已过，则恢复为正常完成。
- [ ] 可选系统通知和声音提醒失败时只记录错误，不影响核心状态（待实现）。
- [x] 注册 `taskcompanion` 代码块，且只接受 `view: status`。
- [x] status 空闲时显示 `25:00` 和"任务空闲中"，运行时显示真实剩余时间，暂停时显示"已暂停"。
- [x] 多个 status 实例共享一个计时服务，并每秒只更新各自的文本节点，不重渲染笔记。
- [x] 提供计时控制 Modal，且不包含真实任务选择。
- [x] 单元测试覆盖开始、暂停、继续、结束、跨重载恢复和重复启动保护。
- [x] `npm run typecheck`、`npm run lint`、`npm test`、`npm run build` 全部通过。
- [ ] 仅使用仓库内 `test-vault/` 进行人工验收（待用户操作）。

Phase 2 不包含 Tasks 解析、母任务、子任务、执行记录、复盘、主页集成、网络请求或外部服务。

## Phase 3：正式任务识别与任务选择（未开始）

## Phase 4：执行会话（未开始）

## Phase 5：一层任务拆解（未开始）

## Phase 6：复盘（未开始）

## Phase 7：主页副本集成（未开始）

## Phase 8：经验沉淀（未开始）

## Phase 9：正式安装（未开始）