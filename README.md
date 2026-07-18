# Task Companion

Task Companion 是一个本地优先的 Obsidian 桌面端任务执行辅助插件。它保留 Markdown Tasks 作为任务事实来源，并提供可靠计时、执行会话、一层子任务拆解、完成复盘、经验模板和嵌入式主页组件。

## 安装

1. 从 [最新 Release](https://github.com/879076256/task-companion/releases/latest) 下载 `task-companion-1.0.0.zip`。
2. 解压后确认根目录只有 `main.js`、`manifest.json`、`styles.css`。
3. 将三个文件放入 Vault 的 `.obsidian/plugins/task-companion/`。
4. 重启 Obsidian，在“设置 → 第三方插件”中启用 Task Companion。

当前正式版本为 `1.0.0`，仅承诺 Obsidian 桌面端，最低版本为 `1.1.0`。覆盖升级时保留插件目录内的 `data.json` 和 Vault 根目录下的 `TaskCompanion/` 长期数据。

更完整的安装、备份和回滚步骤见 [docs/INSTALLATION.md](docs/INSTALLATION.md)。

## 功能

- 25/50 分钟及自由时长计时，支持暂停、继续、结束和恢复。
- 母任务与一层子任务执行目标、会话投入和快速推进记录。
- 母任务/子任务完成复盘及可复用经验模板。
- `current`、`today`、`important`、`daily`、`pending`、`review` 等 Markdown 嵌入组件。
- 默认关闭、仅接受声明式 JSON 的受控本地扩展。
- 本地、离线、无遥测、无网络请求。

## 目录

- `task-companion/`：插件源码、测试与发布脚本。
- `test-vault/`：只含人造数据的隔离测试 Vault。
- `docs/`：产品、规则、数据模型、API、安装与发布文档。
- `reference/`：参考来源与材料说明。

## 开发验证

```bash
cd task-companion
npm ci
npm run build
npm run typecheck
npm run lint
npm test
```

发布包通过 `npm run build:release` 生成，ZIP 根目录严格限制为三个安装文件，并提供 SHA-256 清单。

仓库不包含真实任务、真实 Vault 数据或凭据；自动化测试只使用 `test-vault/` 中的人造数据。
