# 通用 Task Skill

本文第一部分记录最初的独立 Skill 交付；当前运行时行为由下方“自动 input 注入更新”覆盖。

## 范围

交付 `skills/task` 标准 Agent Skill，用执行约定描述目标、输入、允许动作、
产物、验收检查和停止条件，不新增固定 Task 类型。Skill 不负责调度、session
创建、worktree 管理或归档，继续复用宿主的生命周期。

已确定的行为：排查任务交付报告，不修改代码；Review 以用户提供的 PR/MR
地址为输入，记录实际审查快照并交付报告。PR/MR 地址不构成对外发布授权。
“开发通用 Skill”不视为授权改写用户的个人资源配置。

## 与当前产品的兼容性

沿用 README 和 `docs/task-module/spec.md` 的显式资源加载及现有报告协议。
不恢复内置资源自动加载，不变更 npm 依赖、Task schema、IPC 或执行提示。
Task 产物和验收评估作为报告内容放入现有 `summary`，不把未支持的字段提交
给 `task_report_result`。待用户验收和宿主处理 settlement，Skill 不自行完成 Task。

Skill 为行为指令，不是权限沙箱。强制只读、Task Skill 选择/注入、不可变版本
快照、provider 集成和结构化产物/验收验证均不在本次交付中。配置说明明确区分
普通 Chat 的显式 Skill 命令与 Task description 被包装后的自动发现行为。

## 验证

`electron/domains/tasks/taskSkill.test.ts` 使用当前锁定 Pi SDK 验证标准目录发现、
元数据、引用文件，以及显式资源配置经过当前 SpireCode Skills 选择后进入新
Session 的资源列表。临时配置和临时项目用于测试，不访问个人配置或 live DB。
`package.json` 的现有打包范围未变，本 Skill 不进入桌面包，也不新增工具、执行脚本或固定类型协议。

文本约束测试证明指令包含边界，不证明模型运行时一定遵守；本次未执行真实
PR/MR 远端审查或模型任务，不能将这些测试视作端到端行为验收。

本次执行结果：

- Task Skill、Task domain、Chat、Settings 和 Task UI：28 个测试文件，264 个测试通过。
- 发布脚本：19 个测试通过。
- 格式、品牌、中英文文案、许可证、lint、Renderer/Electron 类型检查通过。
- 包含未跟踪文件的额外 secret scan：596 个文件通过；`git diff --check` 通过。
- 请求在沙箱外运行完整 `pnpm check` 时，审批工具返回格式错误，命令未执行；
  本次不标记完整 gate 通过。未用测试跳过或配置修改规避原生监听检查。
- 未修改个人资源配置，未安装或重启应用，未提交或推送代码。


## 自动 input 注入更新

用户确认：仅在 SpireCode Task Run 的 input message 中自动注入实际 Skill 内容，
无需用户写 `/skill:task` 或全局配置。普通 Chat、Task 文案优化和归档查看不注入。

### 实现

- `taskSkill.ts` 静态导入 Skill 正文和报告规范，使用 Main-only Markdown text
  loader 编译进 bundle。没有运行时源目录查找、Renderer 路径权限或全局注册。
- `buildTaskPrompt` 组合 Run 标识、实际规范、版本/摘要和 JSON 编码的任务要求；
  用户保存的 title/description 不变。输入中的相对引用使用内联报告规范，不
  要求 App 或 worktree 中存在原 Markdown 文件。
- 首次需要发送 input 时，现有 saga journal 的 `task_skill:done` step 保存
  `{version, sha256, instructions, reportGuide}`。该状态表示快照已保存，实际
  prompt 接受仍由原有 prompt step 管理。最大序列化大小 32 KiB；验证字段、
  非空文本、版本和 SHA-256，不引入 Task 分类、数据库迁移或报告字段。
- 恢复发送时先使用旧快照，不从新 App 替换旧 Run 的规范。已被会话接受的
  input 通过原 marker 检查避免重复发送。重试和请求修改是新 Run，分别捕获
  当前规范；复用 Session 也明确以当前 Run 的 input 为准。
- 普通 Chat/Renderer 保持 64 KiB 输入限制；Main 的 `sendTaskInput` 内部通道
  最大 1 MiB，容纳已有 64 KiB 描述、64 KiB 请求修改说明的 JSON 最坏转义
  和 32 KiB 规范。沿用原 worktree/session 归属和生命周期校验，无新 IPC。
- 同一 Run 补报告只引用原版本/摘要并提醒原动作边界，不复制整份正文。旧
  Run 无快照时只沿用原 input，不事后标记它使用了新 Skill。损坏/不完整快照
  阻止新 input 或补报告，不静默回退当前版本。规范和 transcript 各自保留，
  不依赖 live worktree，原有归档流程不变。

### 范围和兼容性

这将原“独立 opt-in Skill”变为 Task 执行时必需的 Main 指令，不将其注册为
全局可选插件；不恢复旧的内置扩展集合。无需修改个人配置。手动全局配置此
标准 Skill 的用户仍可能在普通 Chat 使用它；保持 Task-only 时不应额外全局
配置。这里只保证宿主注入范围，不把 input 指令宣称为强制只读权限。

有界 Main-owned 指令快照是 `task_run_steps` 的窄例外，不允许复制用户文件、
完整 Chat transcript、diff 或 tool output 到 SQLite。无需新增 schema，升级
不改变旧报告；回滚后旧应用忽略未知的日志 step，但回滚会失去自动注入保障。

### 回归验证

测试包括实际 Markdown loader、Main 文本编译、版本/摘要/大小限制，真实临时
SQLite 的先保存后发送、重开 DB 的旧版本恢复、已接受消息不重复、新 attempt
与复用 Session、旧 Run 无快照、损坏快照阻断、补报告不重复正文，以及普通
Chat/文案优化不注入。测试不启动真实模型、不写个人配置或 live DB，也不代表
模型一定遵守报告-only 行为或已经完成真实 PR/MR 的端到端验证。

本更新验证结果：

- 最终相关回归（Task、Chat、Settings、Task UI 和 Editor 复测）：29 个文件，316 个测试通过。
- 发布脚本：20 个测试通过，包括实际 Main-only Markdown 编译及无新增 Renderer/IPC 入口。
- `pnpm build` 成功；检查最终 Main bundle 的实际 Skill/报告规范和内部输入通道，
  确认无运行时 Markdown import，Renderer/preload 没有注入指令文本。
- 格式、品牌、i18n、许可证、lint 和双端类型检查通过；额外 secret scan 包含
  未跟踪文件，共 599 个文件通过；`git diff --check` 通过。
- 沙箱内完整 `pnpm check`：783 个测试通过，3 个原生文件监听测试超时，
  1 个 Editor dirty-state 测试失败。Editor 在后续相关回归中复测通过；未改动
  Editor 实现或跳过测试。沙箱外完整检查被审批工具格式错误阻断，命令未执行。
  因此本次不标记完整 gate 通过。
- 未安装或启动新应用，未修改个人配置或 live Task DB，未 commit/push。
