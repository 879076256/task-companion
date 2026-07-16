# 数据模型（v3）

> Phase 4 的 ExecutionSession schemaVersion 为 1；长期历史采用 Vault 内按月 JSONL 追加日志。

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

### ExecutionSession（schemaVersion 1）

| 字段 | 含义 |
| --- | --- |
| `sessionId` | 每次计时或快速推进唯一 UUID；计时会话沿用开始时 ID |
| `taskId` | 关联的稳定 `^tc-xxxxxx` 任务 ID |
| `startedAt` / `endedAt` | ISO 8601 时间戳 |
| `activeDurationSeconds` | 扣除暂停后的活动秒数；正常倒计时等于计划时长 |
| `pausedDurationSeconds` | 全部暂停区间累计秒数 |
| `mode` | `focus-25`、`focus-50`、`custom` 或 `quick` |
| `status` / `endedEarly` | `completed` 或 `ended-early`，以及显式提前结束布尔值 |
| `completedWork` | 本次完成内容；可空 |
| `nextAction` | 当前下一步；可空，按任务取最新非空值 |
| `blockerReason` | 阻塞原因；可空 |

长期文件为 `TaskCompanion/Sessions/YYYY-MM.jsonl`，每行一个完整 JSON 对象。读取器逐行隔离损坏记录并支持 schemaVersion 0 到 1 的迁移。追加前按 `sessionId` 检查重复，保证失败重试幂等。

### PendingSessionWrites

`data.json` 只临时保存尚未成功追加到 Vault 的完整会话。结束时先进入队列；用户保存、跳过或关闭轻量表单后尝试追加。写入失败保留队列并提示重试，成功后删除。它不是长期历史来源。

## 数据流边界

Phase 4 数据流为：选择任务 → 启动计时并生成 sessionId → 暂停/恢复累计时长 → 正常或提前结束（或快速推进）→ 完整基础会话进入待写队列 → 可选填写进展 → 追加到按月 JSONL → 最新非空 nextAction 在下次打开任务时显示。除稳定任务 ID 和 `TaskCompanion/Sessions/` 日志外不修改 Vault 内容。

## 隐私与安全

- 不设计云端副本或网络传输。
- 不采集遥测。
- 日志不得输出任务正文、文件内容或绝对 Vault 路径。
- 测试夹具只能包含人造内容。

## 待确认问题

见 `docs/CURRENT_PLAN.md`。
