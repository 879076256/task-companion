# Test Vault Safety Boundary

此目录是 Task Companion 开发验收专用的隔离 Vault。

- 只允许人造测试笔记与人造任务。
- 禁止复制、链接或同步任何正式 Obsidian Vault 内容。
- 构建脚本只把插件产物安装到本目录的 `.obsidian/plugins/task-companion/`。
- `Phase 3 Tasks.md`、`TaskCompanion/Sessions/` 和 `TaskCompanion/Subtasks/` 只允许人造测试数据。
- 运行时会话和子任务 JSONL 保留在本地测试 Vault 并由 Git 忽略；固定样例位于 `task-companion/tests/fixtures/`。
- 禁止把本目录配置为正式 Vault 的同步目标。
