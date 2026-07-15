# 项目状态

- **阶段**：Phase 1 — 插件骨架与工程基线，待人工验收
- **分支**：`codex/phase-1-skeleton`（未合并 `main`）
- **功能状态**：仅测试命令、状态 Modal 和一个显示设置；无任务功能
- **数据状态**：仅保存基础布尔设置；无真实任务、无 Vault 内容读写
- **测试状态**：构建产物已安装到仓库内 `test-vault/`
- **发布状态**：未安装到正式 Vault、未发布
- **质量状态**：build、typecheck、lint、unit tests、测试 Vault 产物校验全部通过（2026-07-15）

## Phase 1 实现

- `src/main.ts` 只负责编排插件生命周期。
- `src/core/` 保存稳定插件常量。
- `src/adapters/` 提供 Obsidian 运行环境的控制台错误输出适配器。
- `src/ui/` 提供简单状态 Modal。
- `src/services/` 提供可测试的基础错误日志服务。
- `src/settings/` 提供设置模型、输入归一化和设置页。
- 测试命令 ID 为 `open-test-modal`，显示插件骨架加载状态。

## 卸载与清理

- 命令使用 `Plugin.addCommand` 注册，由 Obsidian 在插件卸载时注销。
- 设置页使用 `Plugin.addSettingTab` 注册，由 Obsidian 管理插件生命周期。
- 本阶段没有注册 workspace、vault 或 DOM 事件。
- 打开的 Modal 由插件集合跟踪；`onunload` 逐个关闭并清空集合。
- Modal 的 `onClose` 清空其内容 DOM，并从活动集合移除。

## 基线与验证

工程继续沿用 `obsidianmd/obsidian-sample-plugin` commit `23c165fd362d4049330cb3edad6a52914ff2007a` 的 TypeScript、esbuild、ESLint、manifest 和版本管线。

自动验证结果：

- production build：通过
- TypeScript strict typecheck：通过
- ESLint / Obsidian 插件规则：通过，0 error / 0 warning
- unit/structure tests：5/5 通过
- test-vault artifacts test：1/1 通过

## 当前风险与待验收项

- `docs/DECISIONS.md` 不存在，尚无可读取的正式决策记录。
- 尚未在 Obsidian UI 内人工启用测试 Vault；自动检查只确认产物位置、manifest 和 bundle 内容。
- 插件 ID、作者信息、最低 Obsidian 版本和移动端范围仍待最终确认。
- `npm audit` 的 2 个 moderate 开发依赖问题仍未自动修复。

## 下一决策点

人工验收 Phase 1 后，再决定是否批准 Phase 2。未确认前停止开发。

