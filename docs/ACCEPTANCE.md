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

## Phase 3：正式任务识别与任务选择（已完成）

- [x] 只识别带 `⏫`、`🔼`、`🔽`、`⏬` 或 `🔁` 的未完成 Markdown Tasks。
- [x] 今日待办覆盖 `TASK_RULES.md` 的七条日期规则，逾期任务有明确标识。
- [x] 所有活动的 `⏫` 任务均进入重点任务，不受日期限制。
- [x] 今日＋重点任务去重并标注双重归属。
- [x] 日常循环任务可见，但是否进入今日仍由日期规则决定。
- [x] 首次安全扫描为正式任务追加唯一 `^tc-xxxxxx` 块 ID。
- [x] 已有有效 ID 保持不变；其他块 ID、重复 ID、内容冲突或写入失败时原文不变。
- [x] 任务选择 Modal 支持搜索、分类、日期、来源显示和来源跳转。
- [x] 选择任务后绑定稳定 taskId 并打开现有计时控制 Modal。
- [x] 活动计时期间拒绝切换母任务。
- [x] 扫描失败只显示汇总，不泄露任务正文，不阻断其他文件。
- [x] 不实现 ExecutionSession、子任务、复盘、主页连接、网络或遥测。
- [x] `typecheck`、`lint`、`test`、`build` 全部通过。
- [x] 仅使用仓库内 `test-vault/` 完成人工验收。

## Phase 4：执行会话（已完成并通过人工验收）

- [x] 每次 25/50/自由计时或快速推进生成唯一 ExecutionSession。
- [x] 自动记录 sessionId、taskId、起止时间、活动/暂停秒数、mode、status 和提前结束。
- [x] 结束表单支持完成内容、下一步和可选阻塞；跳过或关闭仍保存基础会话。
- [x] 最新非空 nextAction 按稳定 taskId 回显。
- [x] 长期会话保存在 Vault 的按月 JSONL，而非仅 data.json。
- [x] 读取器隔离坏行并支持旧 schema 迁移；重试按 sessionId 幂等。
- [x] 写入失败保留完整待写队列、显示提示并可运行重试命令。
- [x] 提供当前任务最近 20 条的最小历史查看。
- [x] 测试覆盖会话、时间统计、写入失败和多任务隔离。
- [x] build、typecheck、lint、unit tests 和测试 Vault 产物校验全部通过。
- [x] 仅在仓库测试 Vault 完成人工验收。
- [x] 未实现子任务、正式复盘或主页接入。

## Phase 5：一层任务拆解（已完成并通过人工验收）

- [x] 可直接推进母任务，也可选择一个活动子任务执行。
- [x] 支持子任务添加、改名、稳定排序、完成、取消、返工和设为当前下一步。
- [x] 字段包含 subtaskId、taskId、title、status、order、origin、createdAt、completedAt，并补充 updatedAt/cancelledAt。
- [x] origin 区分最初创建、执行中新增，并保留模板来源读取值但不实现模板界面。
- [x] 计时与快速推进会话固定绑定母任务或一个子任务。
- [x] 自动统计完成数、每个子任务时间、母任务直接投入、总次数与总时间。
- [x] 没有子任务时不显示百分比或虚假进度。
- [x] 子任务变化保存在 Vault 追加式 JSONL，完成和取消历史均保留。
- [x] 测试覆盖母任务隔离、顺序、完成/取消/返工、当前下一步、会话绑定和时间统计。
- [x] build、typecheck、lint、unit tests 和测试 Vault 校验全部通过。
- [x] 未实现多层树、依赖、甘特图、AI、模板界面、正式复盘或主页接入。
- [x] 仅在仓库测试 Vault 完成人工验收。

## Phase 6：复盘（未开始）

## Phase 7：主页副本集成（未开始）

## Phase 8：经验沉淀（未开始）

## Phase 9：正式安装（未开始）
