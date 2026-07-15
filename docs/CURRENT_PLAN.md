# 当前计划

## 本轮范围

本轮只完成 Phase 1：插件骨架与工程基线。允许测试命令、简单 Modal、基础设置和错误日志；不允许任何任务领域功能。

## 执行清单

- [x] 读取项目约束和现有规划文档。
- [x] 检查 Git 状态并创建 `codex/phase-1-skeleton` 分支。
- [x] 确认不访问正式 Vault。
- [x] 保持 `core`、`adapters`、`ui`、`services`、`settings` 分层。
- [x] 实现 `onload`/`onunload`、测试命令和简单 Modal。
- [x] 实现一个基础设置项和设置持久化。
- [x] 实现基础错误日志。
- [x] 建立单元测试、结构测试和测试 Vault 安装校验。
- [x] 验证卸载时的命令、事件和 DOM 清理策略。
- [x] 运行 production build、typecheck、lint 和全部测试。
- [x] 更新 ROADMAP、PROJECT_STATUS 和 CURRENT_PLAN。
- [ ] 人工在 Obsidian 中打开仓库内 `test-vault/` 完成验收。
- [ ] 等待用户确认是否进入 Phase 2。

## 明确未实现

- 计时器或任何周期调度。
- Tasks/Markdown task 解析。
- 任务选择、子任务或任务状态变更。
- 执行日志、复盘或主页接入。
- Vault 内容扫描、读取或写入。
- 网络请求、遥测、外部服务或正式发布。

## 待确认问题

1. `docs/DECISIONS.md` 当前不存在；是否需要在下一轮建立，并由用户提供已确认决策？
2. Phase 1 人工验收通过后，Phase 2 是否仍限定为只读原型与人造数据？
3. 插件 ID、作者、最低 Obsidian 版本和移动端支持范围何时最终确定？
4. `showTechnicalDetails` 是否只作为骨架测试设置，后续可以删除或替换？

其余产品问题仍以 Phase 0 问题清单为背景，未经确认不得实现。

## 停止条件

全部自动检查和文档更新完成后立即停止。不得合并 `main`，不得开始 Phase 2，等待人工验收。

