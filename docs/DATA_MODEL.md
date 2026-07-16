# 数据模型（v2）

> 当前没有持久化实现。本模型用于暴露需要确认的概念，不构成最终 schema。

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
| `running` | 会话 ID、模式、总秒数、开始时间、绝对结束时间 | 剩余秒数由结束时间与当前时间计算 |
| `paused` | 会话 ID、模式、总秒数、开始时间、暂停时间、`remainingSeconds` | 重载后保持暂停，不消耗时间 |
| `finished` | 会话 ID、模式、总秒数、开始/结束时间、`normal` 或 `early` | 保留最近一次结束结果，重置后清除 |

持久化输入必须经过结构和值域校验；无效数据回退到 `idle`。运行态恢复时若已过绝对结束时间，归一为正常完成。

## 数据流边界

Phase 3 数据流为：用户打开选择器 → 扫描当前 Vault Markdown → 纯规则筛选 → 安全追加缺失的稳定 ID → 选择任务 → `data.json` 保存当前 `taskId` → 打开 Phase 2 计时器。除稳定 ID 外不修改任务文本。

## 隐私与安全

- 不设计云端副本或网络传输。
- 不采集遥测。
- 日志不得输出任务正文、文件内容或绝对 Vault 路径。
- 测试夹具只能包含人造内容。

## 待确认问题

见 `docs/CURRENT_PLAN.md`。
