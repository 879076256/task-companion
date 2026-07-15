# 验收标准

## Phase 0：安全开发环境

- [x] 当前工作区是独立 Git 仓库，默认分支为 `main`。
- [x] 存在 `task-companion/`、`test-vault/`、`docs/`、`reference/`。
- [x] 插件骨架可追溯到 Obsidian 官方 Sample Plugin。
- [x] 根目录存在适用于本项目的 `AGENTS.md`。
- [x] 七份指定规划文档均存在并包含第一版内容。
- [x] `package.json` 提供 `build`、`typecheck`、`lint`、`test`。
- [x] `npm run build` 成功。
- [x] `npm run typecheck` 成功。
- [x] `npm run lint` 成功。
- [x] `npm test` 成功（2/2）。
- [x] 插件源码不含任务功能、计时器、周期轮询、全局事件监听、遥测或网络请求。
- [x] 仓库不含真实任务或正式 Vault 内容。
- [x] `test-vault/` 明确标记为仅允许人造测试数据。
- [ ] 用户确认 Phase 0，授权或拒绝下一阶段。

## 验收说明

应用内加载、任务解析和任务写入均不属于本轮验收。命令验证完成后，应把上方四项结果更新为实际状态；在用户确认前不得进入下一阶段。
