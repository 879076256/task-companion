# Task Companion 开发者 API

## 稳定性

当前 API 版本为 `1.1.0`。插件实例在加载完成后公开 `api`；卸载时恢复为 `null`。遵循语义版本：新增兼容字段或方法升级次版本，破坏性变更升级主版本。插件发布版本为 `1.1.1`，两者独立管理。

```ts
const plugin = app.plugins.plugins['task-companion'];
const api = plugin?.api;
if (!api || api.apiVersion.split('.')[0] !== '1') return;
```

## 能力

- `tasks.getCurrentId()` / `getCurrentSubtaskId()`：读取当前稳定目标。
- `tasks.homeReminders(date?)`：只读返回指定本地日期的 `daily`、`today`、`important`、`pending` 四组已排序主页提醒；省略日期时使用今天。
- `timer.getState()`：读取计时状态。
- `timer.start(mode, durationSeconds?)`、`pause()`、`resume()`、`finish()`：调用同一核心状态机；没有母任务时 start 返回 invalid-state。
- `sessions.history(taskId | null)`：读取指定任务或全部会话。
- `reviews.list()`：读取当前可见复盘。
- `templates.list()` / `suggest(taskTitle)`：读取模板或本地排序建议。
- `templates.apply(taskId, templateId)`：显式应用模板，返回实际新增步骤数。
- `ui.openTaskPicker()` / `openReviewQueue()` / `openSessionHistory()`：打开既有界面。
- `events.on(name, listener)`：订阅实时事件，返回取消订阅函数。

API 调用不绕过核心状态保护。订阅者抛错会被隔离；调用方仍应在自己的插件卸载时执行取消订阅函数。

`homeReminders` 不追加稳定 ID、不修改任务来源笔记。每项包含 `id`、`text`、`displayText`、Vault 相对 `sourcePath`、一基 `lineNumber`、`priority`、`recurring`、`start`、`scheduled`、`due` 和可空 `today` 排序状态；快照另含 `date` 与 `failureCount`。

```ts
const reminders = await api.tasks.homeReminders('2026-07-17');
for (const task of reminders.pending) {
	console.debug(task.displayText, task.sourcePath, task.lineNumber);
}
```

## 事件

事件名固定为：

- `task-selected`
- `timer-started`
- `timer-paused`
- `timer-resumed`
- `timer-finished`
- `session-saved`
- `subtask-created`
- `subtask-completed`
- `task-completed`
- `review-created`
- `review-completed`

所有载荷包含 `taskId`、可空 `subtaskId` 和 `occurredAt`。计时事件额外包含 `sessionId` 与 `mode`；finished 还包含 `endedEarly`。复盘事件包含 `reviewId` 与 `targetType`。事件不包含任务标题、复盘文字、Vault 路径或绝对文件路径。

```ts
const off = api.events.on('session-saved', ({ taskId, sessionId }) => {
	console.debug('Task Companion session saved', { taskId, sessionId });
});
this.register(off);
```

## 声明式受控扩展

`TaskCompanion/Scripts/` 中的 `.json` 文件可声明一个事件和安全动作。文件首次被发现时默认停用，必须通过命令面板 `Task Companion: Manage controlled extensions` 明确启用。

```json
{
  "schemaVersion": 1,
  "scriptId": "review-reminder",
  "name": "完成后提醒复盘",
  "version": 1,
  "event": "task-completed",
  "permissions": ["ui:notice"],
  "actions": [
    { "type": "notice", "message": "任务已完成，记得复盘。" }
  ]
}
```

允许权限：

- `ui:notice`：显示声明文件中的静态通知。
- `ui:open`：打开 `task-picker`、`review-queue` 或 `session-history`。
- `tasks:read-current`：为未来只读动作预留；当前没有使用该权限的动作。

不允许任意 JavaScript、表达式求值、变量插值、网络、Shell、任意文件读取、任意 Vault 写入或动态模块加载。`eval` 和 `Function` 不用于扩展。

同一 scriptId 可以保存多个递增版本。动作失败或缺少权限时，服务写入 `errors.jsonl`，回退到更低的最高版本；没有旧版本则停用。日志不保存触发事件载荷。
