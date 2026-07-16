# Task Companion 开发约束

## 项目边界

- 本仓库用于开发 Obsidian 插件 Task Companion。
- 插件源码仅位于 `task-companion/`；测试资料仅位于 `test-vault/`。
- `docs/` 是产品、规则、数据模型、路线图与验收标准的事实来源。
- `reference/` 只保存来源说明或经授权的参考材料，不保存真实 Vault 内容。

## 安全红线

- 不读取、挂载、复制或修改任何正式 Obsidian Vault。
- 不把真实任务、真实笔记、个人信息或凭据放入仓库。
- 自动化测试只能使用 `test-vault/` 内的人造数据。
- Phase 2 计时器已确认；当前 Phase 3 只允许任务识别、稳定 ID、任务选择和母任务绑定。
- 不实现 ExecutionSession、子任务、复盘、主页接入、后台轮询、遥测、网络请求或外部服务。
- 未经用户明确确认，不扩大产品范围，不安装到 Vault，不发布，不提交 Git commit。
- 需求不明确时，先写入 `docs/CURRENT_PLAN.md` 的“待确认问题”。

## 开发流程

1. 开始前阅读 `docs/PROJECT_STATUS.md`、`docs/CURRENT_PLAN.md` 和相关规范。
2. 一次只处理已确认的当前计划；文档和实现保持同步。
3. 使用 `npm`，在 `task-companion/` 内运行命令。
4. 提交前依次运行 `npm run build`、`npm run typecheck`、`npm run lint`、`npm test`。
5. 构建产物 `main.js`、依赖目录 `node_modules/` 和本地插件数据 `data.json` 不入库。

## 代码约束

- TypeScript 严格模式；入口 `src/main.ts` 保持最小。
- 默认本地、离线、最小权限；任何数据写入都必须有可测试的显式规则。
- 正式功能开始前，先补充相应验收标准和测试。
- 不使用真实 Vault 做手工验收；需要 Obsidian 集成测试时，只能使用 `test-vault/`。
