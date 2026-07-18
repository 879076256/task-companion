# Task Companion 1.0.0 发布检查清单

## 元数据

- [x] 版本确认为 `1.0.0`。
- [x] 作者确认为 `teacher Zhang`。
- [x] `isDesktopOnly` 为 `true`。
- [x] `manifest.json`、`package.json`、`package-lock.json` 和 `versions.json` 版本一致。
- [ ] 用户确认最低 Obsidian 桌面版本范围满足实际环境。

## 自动发布检查

- [x] production build 不包含 source map 引用。
- [x] 发布目录和 ZIP 只包含 `main.js`、`manifest.json`、`styles.css`。
- [x] ZIP 使用固定时间和文件顺序，可重复生成。
- [x] 三个安装文件及 ZIP 均生成 SHA-256。
- [x] 自动测试验证元数据、白名单、ZIP 内容与校验和。
- [x] 最终 `npm run check` 全部通过。
- [x] 连续运行两次发布构建，ZIP SHA-256 完全相同。

## 测试 Vault 自动演练

- [x] 从发布目录安装三个文件到仓库 `test-vault/`。
- [x] 安装后文件与发布目录逐字节一致。
- [x] 测试 Vault 插件结构校验通过。
- [ ] 覆盖升级保留测试 `data.json` 与 `TaskCompanion/` 数据。
- [ ] 备份并恢复旧三文件后仍能回到原安装状态。

## 测试 Vault 人工验收

- [x] 插件可启用、禁用、重新启用。
- [x] Obsidian 重载后插件正常加载，无残留重复 Modal 或事件。
- [x] 测试主页 current/today/important/daily/review 组件正常显示。
- [x] 任务选择、来源跳转和稳定 ID 写入仅作用于人造任务。
- [x] 25/50/自由计时可开始、暂停、继续、结束和恢复。
- [x] 母/子任务选择、执行记录、完成、复盘及模板流程可用。
- [x] 删除、失败重试和受控扩展默认停用边界正常。
- [x] 禁用插件后页面不继续刷新或残留可操作 DOM。

## 正式安装前

- [x] 用户明确授权目标正式 Vault。
- [x] 已退出 Obsidian并确认不存在旧插件目录或 `TaskCompanion/` 数据；无需复制旧备份，回滚基线为未安装。
- [x] 本轮只安装插件，不修改正式主页。
- [x] 用户人工确认发布候选通过。
- [x] 用户已明确授权正式提交、`v1.0.0` 标签、main 发布和 GitHub Release。

## 正式安装后

- [x] 三文件校验和与候选包一致。
- [x] 插件启用和测试 Modal 命令正常，显示当前 1.0.0 加载状态。
- [x] 全新安装启用后生成的 `data.json` 和 `TaskCompanion/` 已在文案更新前完整备份，覆盖后保持一致。
- [x] 正式任务扫描入口正常打开；未修改主页或执行额外测试性业务写入。
- [x] Vault 外完整备份已经逐目录验证，回滚仍可立即执行。
- [x] 用户确认阶段 9 验收通过。

## GitHub 公开发布

- [x] main 已推送到公开仓库 `879076256/task-companion`。
- [x] 注释标签 `v1.0.0` 指向通过全部发布检查的正式提交。
- [x] Release 为正式版而非草稿或预发布。
- [x] Release 同时提供 ZIP、三个独立安装文件和 SHA-256 清单。
- [x] 远程回读确认仓库公开、默认分支为 main、五个资产名称和大小正确。

## 1.0.1 Community 自动审核修正

- [x] 清单描述移除自动审核禁止的单词 “Obsidian”。
- [x] 根目录与插件目录 `manifest.json`、`versions.json` 保持一致。
- [x] package、lockfile、安装说明、版本展示和测试同步升级为 `1.0.1`。
- [x] `versions.json` 保留 `1.0.0` 并新增 `1.0.1` 对最低应用版本的映射。
- [x] 自动测试明确禁止清单描述再次包含 “Obsidian”。
- [x] production build、typecheck、零警告 lint、79 项核心测试、5 项发布测试和 3 项测试 Vault 校验通过。
- [ ] `1.0.1` 提交推送、精确标签、正式 Release 和远程附件回读完成。
