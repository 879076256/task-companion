# 数据模型（v5）

> Phase 6 新增 ReviewEvent schemaVersion 1 与可读复盘 Markdown。ExecutionSession 保持 schemaVersion 2；子任务与复盘索引均采用 Vault 内追加事件日志。

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
| `category` | today / important / today-important / recurring | 运行时派生 |

### SourceRef

运行时使用 Vault 相对路径、扫描行号和原始行精确定位；长期主关联使用稳定块 ID。Phase 6 的复盘事件额外保存完成时的 Vault 相对路径和任务标题快照，用于打开来源和生成可读复盘；路径变化不会改变 taskId。完成写入按块 ID 在来源文件中重新定位，重复 ID 或不可用来源时不写入。

### PluginSettings

插件 `data.json` 保存基础设置、短期计时状态、当前选中的稳定 `taskId` 和尚未成功写入 Vault 的临时队列。它不是会话、子任务或复盘的长期来源；Phase 6 待写复盘为恢复所需会暂存任务标题快照和复盘正文。

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
| `blockerReason` | 阻塞原因；可空 |

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

每个母任务使用 `TaskCompanion/Subtasks/tc-xxxxxx.jsonl`。事件类型为 `created`、`renamed`、`reordered`、`completed`、`cancelled`、`reopened` 或 `current-next-set`。事件保存受影响子任务的完整快照；排序交换在同一事件中原子记录。读取时按顺序折叠，不删除完成或取消历史。

状态转换仅允许：`active → completed`、`active → cancelled`、`completed/cancelled → active`（返工/恢复）。只有活动子任务可设为当前下一步或作为新执行目标。

### PendingSessionWrites

`data.json` 只临时保存尚未成功追加到 Vault 的完整会话。结束时先进入队列；用户保存、跳过或关闭轻量表单后尝试追加。写入失败保留队列并提示重试，成功后删除。它不是长期历史来源。

### ReviewEvent（schemaVersion 1）

复盘索引采用 `TaskCompanion/Reviews/index.jsonl`，每次状态变化追加一个完整快照，按 `reviewId` 折叠为最新状态；追加前按 `eventId` 检查重复。

| 字段 | 含义 |
| --- | --- |
| `eventId` / `reviewId` | 事件幂等 ID 与一次任务复盘的稳定 ID |
| `taskId` | 原任务稳定 `^tc-xxxxxx` ID |
| `taskTitle` | 完成时任务标题快照，不包含 Task Companion 块 ID |
| `sourcePath` / `sourceLineNumber` | 完成时 Vault 相对路径与定位提示；行号不作长期身份 |
| `occurredAt` / `completedAt` | 事件时间与原任务完成时间 |
| `reviewStatus` | `pending` 或 `completed` |
| `stats` | 完成时冻结的自动复盘统计 |
| `reviewText` | 一段自由复盘，可空 |
| `wentWell` / `reworkOrBlocker` / `nextAdjustment` | 三个可选引导问题答案 |
| `markdownPath` | 完成复盘文件的 Vault 相对路径；待复盘时为 `null` |

自动统计包含：任务跨度、实际执行天数、会话数、总有效/暂停时间、提前结束次数、初始/执行中新增/完成/取消子任务数、最长耗时步骤、最后一次非空进展和未完成子任务标题。

完成复盘写入 `TaskCompanion/Reviews/YYYY-MM/YYYY-MM-DD-<reviewId>.md`。Markdown 含最小 frontmatter、原任务链接、自动统计、自由复盘和三个可选问题；可直接阅读、备份并从已完成复盘列表重新打开。

### PendingReviewWrites

- `pendingReviewEventWrites`：原任务完成前先写入 `data.json` 的待复盘事件；原任务安全完成后尝试追加索引。索引失败不回滚原任务，队列继续可见并可重试。
- `pendingReviewMarkdownWrites`：保存复盘前先暂存完整目标路径、Markdown 正文和 completed 事件；Markdown 或索引写入失败时保留，重试使用同一路径和 eventId，成功后清除。

## 数据流边界

Phase 6 完成数据流为：显式选择活动任务 → 按 taskId 读取会话和子任务档案 → 若有活动子任务，要求“返回继续 / 取消剩余 / 保留记录并完成” → 无档案则只安全勾选原任务 → 有档案则冻结统计并持久化待复盘意图 → 按稳定块 ID 将原任务改为完成 → 追加 pending 复盘事件 → 用户从队列填写或跳过可选问题 → 先保留待写正文，再写可读 Markdown 和 completed 事件。原任务完成与复盘保存相互独立。

## 隐私与安全

- 不设计云端副本或网络传输。
- 不采集遥测。
- 日志不得输出任务正文、文件内容或绝对 Vault 路径。
- 复盘文件和复盘索引按产品目的保存用户主动确认的任务标题与复盘文字，但只留在本地 Vault；错误日志仍不得输出这些内容。
- 测试夹具只能包含人造内容。

## 待确认问题

见 `docs/CURRENT_PLAN.md`。
