# Task Companion 1.0.0 安装与回滚

## 适用范围

- 插件版本：`1.0.0`
- 作者：`teacher Zhang`
- 平台：仅 Obsidian 桌面端
- 最低 Obsidian 版本：`1.1.0`
- 安装文件：`main.js`、`manifest.json`、`styles.css`

本说明把仓库测试 Vault 演练与正式 Vault 安装分开。当前阶段只授权前者；没有目标 Vault 和备份范围的明确确认时，不执行正式安装。

## 发布包验证

仓库内运行：

```bash
cd task-companion
npm ci
npm run build:release
```

生成：

- `release/task-companion-1.0.0.zip`
- `release/task-companion-1.0.0/` 三文件目录
- `release/SHA256SUMS-1.0.0.txt`

在 `task-companion/release/` 中可用 macOS 自带命令核对：

```bash
shasum -a 256 -c SHA256SUMS-1.0.0.txt
```

ZIP 根目录必须恰好包含 `main.js`、`manifest.json`、`styles.css`。发现 `data.json`、源码、测试数据、日志或 source map 时停止安装。

## 安装前备份

1. 如果 Task Companion 正在计时，先暂停或结束；确认没有待写失败提示。
2. 完全退出 Obsidian。
3. 备份目标 Vault 中以下现有内容（存在时）：
   - `.obsidian/plugins/task-companion/`
   - `TaskCompanion/`
4. 记录备份时间和原插件版本；不要把这些正式数据复制回开发仓库。

`.obsidian/plugins/task-companion/data.json` 包含设置、当前计时状态和失败待写队列，升级时不得删除。`TaskCompanion/` 包含 Sessions、Subtasks、Reviews、Templates 和受控扩展数据，卸载插件也不会自动删除。

## 全新安装

1. 完全退出 Obsidian。
2. 在目标 Vault 创建 `.obsidian/plugins/task-companion/`。
3. 将发布包中的三个文件复制到该目录，不复制外层版本目录。
4. 启动 Obsidian，在“设置 → 第三方插件”中启用 Task Companion。
5. 通过命令面板运行 Task Companion 测试命令，再打开插件已有入口确认加载。

本步骤只安装插件，不创建或修改主页笔记。主页接入必须另行确认。

## 覆盖升级

1. 完成“安装前备份”，并在 Obsidian 中禁用 Task Companion。
2. 只替换 `main.js`、`manifest.json`、`styles.css`。
3. 保留原 `data.json` 和整个 `TaskCompanion/` 数据目录。
4. 重新启用插件，检查设置、当前目标、历史会话、子任务、复盘和模板能否读取。
5. 若出现错误，立即禁用插件并按下节回滚，不反复覆盖数据文件。

## 回滚

1. 禁用 Task Companion 并完全退出 Obsidian。
2. 保存当前故障现场副本，尤其是 `data.json` 与 `TaskCompanion/`，便于恢复待写数据。
3. 恢复安装前备份的 `.obsidian/plugins/task-companion/`。
4. 如需同时回滚长期数据，只能整体恢复同一时间点备份的 `data.json` 与 `TaskCompanion/`；不要混用不同时间点文件。
5. 启动 Obsidian、重新启用插件并执行最小读写验证。

如果仅是新版代码加载失败，优先只回滚三个插件文件，保留最新用户数据。只有确认数据迁移导致不兼容时，才恢复完整数据备份。

## 禁用与卸载

- 临时停用：在第三方插件中禁用，用户数据保留。
- 卸载代码：禁用后删除 `.obsidian/plugins/task-companion/`。
- 清理长期数据：`TaskCompanion/` 不随卸载自动删除；只有用户明确确认不再需要历史记录时才可单独删除。
- Task Companion 不修改主题、CSS snippets 或正式主页，因此卸载时没有这些外围文件需要清理。

## 正式安装授权门

执行正式 Vault 安装前必须逐项确认：

- 目标 Vault 的明确路径或用户在界面中确认的目标。
- 安装前备份已完成且可读取。
- 安装范围仅为插件三文件；本轮不修改主页。
- 用户接受仅桌面端支持声明。
- 安装后由用户进行人工功能验收。
