# Task Companion

Task Companion 是本地优先的 Obsidian 任务执行辅助插件。任务来源保持为原始 Markdown Tasks；插件提供可靠计时、执行会话、一层拆解、完成复盘、经验模板、嵌入式主页组件和受控本地扩展。

## 开发命令

```bash
npm ci
npm run build
npm run typecheck
npm run lint
npm test
```

构建生成的 `main.js` 只用于本地验证，不纳入 Git。开发安装脚本只写入仓库相邻的 `test-vault/`。

## 1.1.0 发布构建

Task Companion 1.1.0 作者为 `teacher Zhang`，仅承诺 Obsidian 桌面端。

```bash
npm run build:release
npm run test:release
```

发布目录为 `release/`。ZIP 根目录严格只包含 `main.js`、`manifest.json`、`styles.css`，并生成独立 SHA-256 清单。测试 Vault 安装脚本从该发布目录复制文件，确保人工验收的就是候选产物。

安装、覆盖升级、备份和回滚见 `../docs/INSTALLATION.md`；完整发布门禁见 `../docs/RELEASE_CHECKLIST.md`。正式安装默认不修改主页。

## 嵌入组件

在 Markdown 中使用：

````markdown
```taskcompanion
view: status
```
````

支持的 `view`：

- `status`：共享计时状态；空代码块也兼容此视图。
- `current`：当前母任务、具体执行目标、实时计时、下一步和执行摘要。
- `today`：今日与逾期任务。
- `important`：活动重点任务。
- `daily`：活动循环任务。
- `pending`：未进入今日、非循环、非最高优先级的待推进任务。
- `review`：待复盘摘要与入口。

任务列表组件在渲染或点击“刷新”时读取；`current` 会响应插件内部的任务、子任务、计时和会话变化。不监听 Vault，不后台轮询。仓库示例位于测试 Vault 的 `Task Companion Home.md`。

`current` 的计时设置支持 25 分钟、50 分钟和 1–1440 分钟自由时长。自由时长可点击“确定”或按 Enter 提交；保存完成后计时显示才会更新。

带 recurrence 的日常任务只用于“日常任务”提醒，不进入当前任务、快速推进或完成任务选择器；今日、重点和待推进中的非循环任务仍可选择。

本地 API `tasks.homeReminders(date?)` 以只读方式返回与主页一致的日常、今日、重点、待推进四组快照，可用于保留既有 DOM/CSS 的主页集成。

## Phase 8 扩展

- 经验模板长期保存在 `TaskCompanion/Templates/index.jsonl`，只在用户确认后应用。
- 其他 Obsidian 插件可使用版本化本地 API；见 `../docs/DEVELOPER_API.md`。
- 用户受控扩展只接受默认停用的声明式 JSON，不执行任意 JavaScript；格式、权限和回退见 `../docs/DEVELOPER_API.md`。
- 数据/API 兼容策略见 `../docs/MIGRATIONS.md`。
