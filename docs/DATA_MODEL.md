# 数据模型（v7）

> Phase 7.2 将 ReviewEvent 升级为 schemaVersion 2，以支持母任务和子任务独立复盘；schemaVersion 1 自动迁移为母任务复盘。ExecutionSession 保持 schemaVersion 2。
> Phase 8 新增 ExperienceTemplate、TemplateEvent 和受控扩展状态；不改变既有会话、子任务或复盘 schema。
> 嵌入组件只产生运行时派生快照；计时模式偏好属于插件设置，不是长期执行档案。

## 候选实体

### TaskReference

| 字段 | 候选含义 | 当前状态 |
| --- | --- | --- |
| `id` | `^tc-` 加六位小写十六进制稳定块 ID | Phase 3 已确定 |
| `text` | 原任务复选框后的用户可见文本 | Phase 3 已实现 |
| `sourcePath` | Vault 内相对 Markdown 路径 | 仅运行时使用 |
| `lineNumber` | 本次扫描定位提示 | 不作为长期 ID |
| `priority` | `⏫`、`🔼`、`🔽`、`⏬` 或空 | Phase 3 已实现 |
| `hasRecurrence` | 是否包含 `🔁` | Phase 3 已实现 |
| `start` / `scheduled` / `due` | 有效 `YYYY-MM-DD` 或空 | Phase 3 已实现 |
| `category` | today / important / today-important / recurring / pending | 运行时派生 |

### SourceRef

运行时使用 Vault 相对路径、扫描行号和原始行精确定位；长期主关联使用稳定块 ID。Phase 6 的复盘事件额外保存完成时的 Vault 相对路径和任务标题快照，用于打开来源和生成可读复盘；路径变化不会改变 taskId。完成写入按块 ID 在来源文件中重新定位，重复 ID 或不可用来源时不写入。

### PluginSettings

插件 `data.json` 保存基础设置（含首选计时模式和自由时长）、短期计时状态、当前选中的稳定 `taskId`/`subtaskId` 和尚未成功写入 Vault 的临时队列。它不是会话、子任务或复盘的长期来源；待写复盘为恢复所需会暂存任务标题快照和复盘正文。

### TimerState

短期计时状态保存于插件自身 `data.json`，不写入任何笔记：

| 状态 | 持久化字段 | 规则 |
| --- | --- | --- |
| `idle` | `status` | 无活动会话 |
| `running` | 会话 ID、模式、总秒数、开始时间、绝对结束时间、累计暂停毫秒 | 剩余秒数由结束时间与当前时间计算 |
| `paused` | 会话 ID、模式、总秒数、开始时间、暂停时间、`remainingSeconds`、累计暂停毫秒 | 重载后保持暂停，不消耗时间 |
| `finished` | 会话 ID、模式、总秒数、开始/结束时间、累计暂停毫秒、`normal` 或 `early` | 转换为 ExecutionSession 后不作为长期历史 |

持久化输入必须经过结构和值域校验；无效数据回退到 `idle`。运行态恢复时若已过绝对结束时间，归一为正常完成。

### ExecutionSession（schemaVersion 2）

| 字段 | 含义 |
| --- | --- |
| `sessionId` | 每次计时或快速推进唯一 UUID；计时会话沿用开始时 ID |
| `taskId` | 关联的稳定 `^tc-xxxxxx` 任务 ID |
| `subtaskId` | 本次绑定的一层子任务 ID；直接推进母任务时为 `null` |
| `startedAt` / `endedAt` | ISO 8601 时间戳 |
| `activeDurationSeconds` | 扣除暂停后的活动秒数；正常倒计时等于计划时长 |
| `pausedDurationSeconds` | 全部暂停区间累计秒数 |
| `mode` | `focus-25`、`focus-50`、`custom` 或 `quick` |
| `status` / `endedEarly` | `completed` 或 `ended-early`，以及显式提前结束布尔值 |
| `completedWork` | 本次完成内容；可空 |
| `nextAction` | 当前下一步；可空，按任务取最新非空值 |
| `blockerReason` | 注意事项；可空。保留字段名以兼容既有会话日志 |

长期文件为 `TaskCompanion/Sessions/YYYY-MM.jsonl`，每行一个完整 JSON 对象。读取器逐行隔离损坏记录并支持 schemaVersion 0/1 到 2 的迁移；旧会话补为 `subtaskId: null`。追加前按 `sessionId` 检查重复，保证失败重试幂等。

### Subtask

| 字段 | 含义 |
| --- | --- |
| `subtaskId` | UUID，不承载层级；第一版只允许属于一个母任务 |
| `taskId` | 母任务稳定 `^tc-xxxxxx` ID |
| `title` | 1–200 字符的单行名称 |
| `status` | `active`、`completed` 或 `cancelled` |
| `order` | 同一母任务内的稳定非负整数顺序 |
| `origin` | `initial`、`during-execution` 或为未来读取保留的 `template` |
| `createdAt` / `updatedAt` | ISO 8601 时间戳 |
| `completedAt` / `cancelledAt` | 对应状态的时间戳，否则为 `null` |

### SubtaskEvent（schemaVersion 1）

每个母任务使用 `TaskCompanion/Subtasks/tc-xxxxxx.jsonl`。事件类型为 `created`、`renamed`、`reordered`、`completed`、`cancelled`、`deleted`、`reopened` 或 `current-next-set`。事件保存受影响子任务的完整快照；排序交换在同一事件中原子记录。读取器继续识别旧版 `deleted` 软删除墓碑，以兼容既有开发数据；新版界面不再生成这种墓碑。

状态转换仅允许：`active → completed`、`active → cancelled`、`completed/cancelled → active`（返工/恢复）。只有活动子任务可设为当前下一步或作为新执行目标。永久删除不是状态转换：它对任意当前状态开放，并按 `taskId + subtaskId` 重写该母任务日志，移除目标快照和 current-next 引用；同一事件中的兄弟快照及无法解析的原始行原样保留。

### PendingSessionWrites

`data.json` 只临时保存尚未成功追加到 Vault 的完整会话。结束时先进入队列；用户保存、跳过或关闭轻量表单后尝试追加。写入失败保留队列并提示重试，成功后删除。它不是长期历史来源。

### ReviewEvent（schemaVersion 2）

复盘索引采用 `TaskCompanion/Reviews/index.jsonl`，每次状态变化追加一个完整快照，按 `reviewId` 折叠为最新状态；追加前按 `eventId` 检查重复。

| 字段 | 含义 |
| --- | --- |
| `eventId` / `reviewId` | 事件幂等 ID 与一次任务复盘的稳定 ID |
| `taskId` | 原任务稳定 `^tc-xxxxxx` ID |
| `targetType` | `task` 或 `subtask`；schemaVersion 1 迁移时补为 `task` |
| `subtaskId` | 子任务复盘的稳定子任务 ID；母任务复盘为 `null` |
| `parentTaskTitle` | 子任务复盘的母任务标题快照；母任务复盘为 `null` |
| `taskTitle` | 复盘目标标题快照；母任务为原任务标题，子任务为子任务标题 |
| `sourcePath` / `sourceLineNumber` | 完成时 Vault 相对路径与定位提示；行号不作长期身份 |
| `occurredAt` / `completedAt` | 事件时间与原任务完成时间 |
| `reviewStatus` | `pending` 或 `completed` |
| `stats` | 完成时冻结的自动复盘统计 |
| `reviewText` | 一段自由复盘，可空 |
| `wentWell` / `reworkOrBlocker` / `nextAdjustment` | 三个可选引导问题答案 |
| `markdownPath` | 完成复盘文件的 Vault 相对路径；待复盘时为 `null` |

母任务自动统计包含：任务跨度、实际执行天数、会话数、总有效/暂停时间、提前结束次数、初始/执行中新增/完成/取消子任务数、最长耗时步骤、最后一次非空进展和未完成子任务标题。子任务统计只聚合该 `subtaskId` 的会话，并记录自身完成数，不混入其他子任务或母任务直接投入。

完成复盘写入 `TaskCompanion/Reviews/YYYY-MM/YYYY-MM-DD-<reviewId>.md`。Markdown 含最小 frontmatter、原任务链接、自动统计、自由复盘和三个可选问题；可直接阅读、备份并从已完成复盘列表重新打开。明确永久删除子任务时，该子任务的索引行和对应 Markdown 一并删除；母任务复盘及兄弟子任务复盘不受影响。

### PendingReviewWrites

- `pendingReviewEventWrites`：原任务完成前先写入 `data.json` 的待复盘事件；原任务安全完成后尝试追加索引。索引失败不回滚原任务，队列继续可见并可重试。
- `pendingReviewMarkdownWrites`：保存复盘前先暂存完整目标路径、Markdown 正文和 completed 事件；Markdown 或索引写入失败时保留，重试使用同一路径和 eventId，成功后清除。

### ExperienceTemplate（schemaVersion 1）

模板索引位于 `TaskCompanion/Templates/index.jsonl`。每次新建或更新追加一个 TemplateEvent，按 `templateId` 选择最高版本折叠；追加前按 `eventId` 幂等，读取时逐行隔离损坏内容。

| 字段 | 含义 |
| --- | --- |
| `templateId` / `version` | 稳定模板 ID 与从 1 递增的版本号 |
| `name` | 用户确认的模板名称 |
| `taskTitleSamples` | 最多 10 个历史母任务标题样本，仅用于本地建议排序 |
| `subtaskTitles` | 排除 cancelled 后按顺序合并去重的一层步骤标题 |
| `reviewCount` | 去重后的来源复盘数量 |
| `averageSessionCount` | 历史平均执行次数，整数四舍五入 |
| `averageActiveDurationSeconds` | 历史平均有效投入秒数，整数四舍五入 |
| `commonBlockers` | 从复盘“返工或阻塞”字段收集的去重文本 |
| `checklist` | 界面“完成前检查（可选）”的逐行项目 |
| `principles` | 界面“下次沿用的经验（可选）”的逐行项目 |
| `sourceReviewIds` | 已计入模板的 reviewId，用于防止重复聚合 |
| `createdAt` / `updatedAt` | ISO 8601 时间戳 |

### ControlledScript（schemaVersion 1）

用户受控扩展放在 `TaskCompanion/Scripts/*.json`。文件只声明 `scriptId`、名称、递增版本、一个事件、权限列表和最多 20 个动作；不会作为 JavaScript 执行。

- 安全权限只有 `ui:notice`、`ui:open` 和预留的只读 `tasks:read-current`；当前动作只使用前两项。
- 动作为静态通知，或打开 task-picker、review-queue、session-history 之一。
- `state.json` 保存每个 scriptId 的 activeVersion、enabled 和 disabledReason；首次发现默认 `enabled: false`。
- `errors.jsonl` 只记录脚本 ID、失败/恢复版本、事件名、时间和截断错误，不保存事件载荷、任务正文或路径。
- 当前版本失败时选择更低的最高有效版本；存在旧版则回退并保持启用，否则停用。

### DashboardTaskSnapshot（仅运行时）

由一次安全 TaskScanner 扫描派生：`allTasks` 保存全部活动正式任务，`tasks` 保存按当天规则分类的 SelectedTask，`failures` 保存不含任务正文的失败位置。它不写入 `data.json` 或 Vault。

同一天同时渲染的 current、today、important 和 daily 组件共享同一个进行中 Promise；扫描结束即清除，不长期缓存结果。这样既避免多个组件并发追加稳定 ID，又保证后续刷新重新读取 Vault。

### HomeReminderApiSnapshot（仅运行时）

`tasks.homeReminders(date)` 通过 `snapshotReadonly()` 读取活动正式任务和已完成循环任务历史，再派生 `daily`、`today`、`important`、`pending` 四组。每项只包含稳定/定位 ID、显示标题、原任务文本、Vault 相对来源、行号、日期、优先级、循环标记和今日状态；快照另带扫描失败数量。

该路径只调用 Vault list/read，不调用 process，不追加稳定 ID，也不写入 `data.json`。它专供已有主页在保持原 DOM/CSS 的前提下替换本地筛选逻辑。

## 数据流边界

当前完成数据流为：用户显式勾选母任务或完成当前母任务 → 按 taskId 读取会话和子任务档案 → 若有活动子任务，要求“返回继续 / 取消剩余 / 保留记录并完成” → 冻结统计（没有档案时允许为零）并持久化 pending 复盘意图 → 按稳定块 ID 将原任务改为完成 → 追加 pending 复盘事件。完成子任务时先准备独立 pending ReviewEvent，再追加 subtask completed 事件和复盘索引。单纯结束计时只完成 ExecutionSession 待写/追加流程，不创建 ReviewEvent，也不改变母任务或子任务状态。

Phase 7 显示数据流为：Markdown 明确声明 view → 单一代码块路由解析 → MarkdownRenderChild 首次读取 → TaskScanner/既有服务返回运行时快照 → 纯分组规则生成组件 → 用户按钮调用既有来源、执行准备、计时、拆解、历史或复盘流程。提醒卡标题与 `current` 母任务标题都调用同一个 `selectTask → chooseExecutionTarget` 流程；ExecutionTargetModal 直接读取 SubtaskPlan，在同一窗口中选择目标、追加子任务或调用更多菜单，写入成功后重新读取计划并原位渲染，不再经过第二个拆解 Modal。选择活动子任务后 TimerService 更新 `subtaskId`，`current` 的上下文订阅自动重读并把紫色目标框从母任务一行更新为母任务、子任务两行。单纯 tick 只更新计时文本；结束计时产生的多次 SessionService 通知只重读进展并更新既有指标文字节点，使用代次校验丢弃过期异步结果，不清空当前任务 DOM。卸载使异步结果失效并清理全部订阅和 DOM 事件。

Phase 7.4 复盘资格数据流为：复盘列表只显示来源 Markdown 仍为完成状态的母任务，或当前仍为 `completed` 的子任务。用户取消 pending 复盘复选框时，TaskScanner 按稳定 ID 把母任务改回 `[ ]`，或 SubtaskService 追加 `reopened` 事件；ReviewEvent 本身不删除，而是因资格检查失败而隐藏。再次完成时检测并复用已有 pending 项，不生成重复 reviewId。`reviewStatus: completed` 的已保存复盘始终作为历史归档显示，不支持由复盘反勾选入口删除；明确永久删除子任务时按下一段清理。

Phase 8 模板数据流为：母任务复盘 Markdown 与 completed ReviewEvent 成功持久化 → 关闭复盘窗口 → 用户选择新建、更新或跳过 → TemplateService 从完成统计、ReviewReflection 与当前 SubtaskPlan 生成新版本 → repository 追加 TemplateEvent。应用数据流为：执行准备显式打开建议 → 本地标题相似度排序并预览 → 用户点击采用 → SubtaskService 用单个 created 事件原子追加缺失步骤。模板读取或写入失败不回滚复盘，也不自动修改任务。

Phase 8 扩展数据流为：核心服务完成持久化或状态转换 → ExtensionEventBus 向本地 API 监听器发出脱敏载荷 → 受控扩展服务仅对已启用且事件匹配的 JSON 执行允许动作。监听器或扩展失败被隔离；扩展状态和脱敏错误单独落盘，核心写入结果不回滚。

Phase 10 主页提醒数据流为：`Home-Test` 请求指定本地日期 → TaskScanner 只读扫描活动任务与循环完成历史 → 纯函数生成四组已排序快照 → 主页把返回项适配为原有渲染记录 → 既有 DOM、交互和测试 CSS 继续渲染。读取过程不修改任何任务来源笔记。

子任务永久删除数据流为：用户在更多菜单点击“删除子任务” → 若目标正在计时则 `reset` 且清除 subtask 绑定，不产生 ExecutionSession → 阻止同一目标的并发待写回流 → 按月会话日志移除匹配记录 → 复盘索引、待写队列和可读 Markdown 移除匹配记录 → 子任务日志移除全部目标快照/current-next 引用 → 通知主页刷新。所有重写均保留其他目标和损坏行；子任务档案最后清理，使前序失败时仍有可见入口可重试。

## 隐私与安全

- 不设计云端副本或网络传输。
- 不采集遥测。
- 日志不得输出任务正文、文件内容或绝对 Vault 路径。
- 复盘文件和复盘索引按产品目的保存用户主动确认的任务标题与复盘文字，但只留在本地 Vault；错误日志仍不得输出这些内容。
- 模板按用户确认保存标题样本、步骤与经验文字，只在本地 Vault 使用；生命周期事件不携带这些文字。
- 测试夹具只能包含人造内容。

## 待确认问题

见 `docs/CURRENT_PLAN.md`。
