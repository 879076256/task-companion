# 数据模型（v4）

> Phase 5 的 ExecutionSession 当前 schemaVersion 为 2；旧 v0/v1 日志读取时迁移。子任务采用 Vault 内按母任务分文件的追加事件日志。

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

运行时使用 Vault 相对路径、扫描行号和原始行精确定位；长期关联只使用稳定块 ID。写入前比较完整文件与原行，冲突时不写入。

### PluginSettings

插件 `data.json` 保存基础设置、短期计时状态和当前选中的稳定 `taskId`。不保存任务正文或长期执行历史。

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

## 数据流边界

Phase 5 数据流为：选择稳定 taskId → 读取并折叠一层 Subtask 事件 → 修改时追加事件 → 选择直接推进母任务或一个活动子任务 → subtaskId 固定在计时状态及最终 ExecutionSession → 会话历史汇总母任务直接投入、各子任务投入、完成数和当前下一步。没有子任务时不计算或显示虚假百分比。

## 隐私与安全

- 不设计云端副本或网络传输。
- 不采集遥测。
- 日志不得输出任务正文、文件内容或绝对 Vault 路径。
- 测试夹具只能包含人造内容。

## 待确认问题

见 `docs/CURRENT_PLAN.md`。
