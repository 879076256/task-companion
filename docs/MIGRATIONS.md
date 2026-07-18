# 数据与 API 迁移

## 插件 1.0.0 发布

- `manifest.json`、`package.json`、lockfile 与 `versions.json` 统一为 `1.0.0`。
- 1.0.0 仅声明支持 Obsidian 桌面端，最低应用版本保持 `1.1.0`。
- 覆盖升级只替换 `main.js`、`manifest.json`、`styles.css`；保留插件 `data.json` 和 Vault 内 `TaskCompanion/`。
- 发布构建不主动改写任何长期日志。schema 迁移继续在读取时完成，追加新记录时使用当前 schema。
- 降级时优先只回滚插件三文件并保留最新数据；如必须回滚数据，使用同一时间点的 `data.json` 与完整 `TaskCompanion/` 备份，不能交叉恢复。

## 原则

- 长期日志优先追加，不就地覆盖未知字段。
- 读取器逐行隔离损坏记录，旧数据迁移不能阻断其他任务。
- 写入失败保留待写队列，幂等 ID 防止重试重复。
- API 使用语义版本；消费者必须检查主版本。

## 现有迁移

- ExecutionSession schemaVersion 0/1 自动归一为 version 2，缺失的 subtaskId 设为 `null`。
- ReviewEvent schemaVersion 1 自动归一为 version 2，目标补为母任务，subtaskId 与 parentTaskTitle 设为 `null`。
- Subtask 日志继续读取旧 `deleted` 墓碑；新版永久删除会物理移除目标引用，但保留兄弟记录和坏行。
- ExperienceTemplate 当前为 schemaVersion 1，无旧版数据；未知 schema 行视为无效并隔离。
- ControlledScript 当前为 schemaVersion 1；未知 schema、权限或动作文件保持惰性，不会执行。

## API 升级

- `1.x` 消费者只能依赖文档中的稳定字段；新增可选能力不要求迁移。
- 未来 `2.x` 必须并行发布迁移说明，明确事件、方法或载荷的破坏性变化。
- 插件卸载后 `api` 为 `null`，消费者不得缓存并继续调用旧实例。

## 回滚

- 模板使用版本事件；读取时选择最高版本，不删除旧事件。
- 受控扩展失败会自动选择更低的最高有效版本；状态保存在 `TaskCompanion/Scripts/state.json`。
- 回滚插件构建不会删除 Vault 内 Sessions、Subtasks、Reviews、Templates 或 Scripts；旧构建无法识别的新 schema 应忽略而不是改写。
