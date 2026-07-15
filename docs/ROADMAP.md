# 路线图

## Phase 0：安全开发环境（已完成）

- 独立 Git 仓库与目录边界。
- 官方 Sample Plugin 基线与质量命令。
- 产品、规则、数据模型、状态、验收和当前计划文档。
- build、typecheck、lint、test 命令通过。

## Phase 1：插件骨架与工程基线（已完成，待人工验收）

- 保持 `core`、`adapters`、`ui`、`services`、`settings` 五层源码目录。
- 实现 `onload`/`onunload`、测试命令、简单 Modal、基础设置项和错误日志。
- 命令与设置页通过 Obsidian Plugin API 注册；不注册事件。
- 跟踪打开的 Modal，卸载时逐个关闭并清空 DOM/引用。
- production build 可安装到仓库内 `test-vault/`，三个必需产物校验通过。
- build、typecheck、lint、unit tests 全部通过。

退出条件：人工在仓库内 `test-vault/` 加载插件，验证命令、Modal、设置保存和禁用/重载行为。

## Phase 2：需求确认与只读原型（未批准）

- 确认目标用户、任务语法、扫描范围和核心工作流。
- 用纯函数和人造夹具实现解析方案。
- 如需 Obsidian 集成，仅在 `test-vault/` 进行只读验证。

## Phase 3：受控交互（未批准）

- 根据确认后的验收标准设计最小界面。
- 所有写入先做冲突检查，并只作用于测试 Vault。
- 增加回归测试和故障恢复策略。

## Phase 4：发布准备（未批准）

- 隐私、安全、性能和兼容性审计。
- 明确安装与升级策略、版本兼容范围和发布材料。
- 只有用户明确授权后才考虑正式 Vault 验证或发布。

## 明确排除

Phase 1 不包含计时器、Tasks 解析、任务选择、子任务、执行日志、复盘和主页接入。计时器未进入路线图；如未来需要，必须作为独立需求重新评估。

