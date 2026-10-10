# Plan: Settings Skills 管理（from `docs/settings-skills/spec.md` 2026-09-19）

## Status
Completed。

## Files that change

### SDLC artifacts

- `docs/settings-skills/intent.md` — 保持已确认需求；若实现发现与批准范围冲突，同步记录偏差。
- `docs/settings-skills/spec.md` — 状态更新为 accepted；仅在实现必须调整已确认设计时同步修订。
- `docs/settings-skills/plan.md` — 实施过程中保持文件清单、顺序、风险和验证命令与实际一致。

### Electron Main：catalog、持久化与 Session 过滤

- `electron/domains/settings/index.ts`
  - 增加 `SkillSetting`、Skill identity、来源分类和稳定排序。
  - 将 settings state schema 从 v7 升级到 v8，加入独立 `skillOverrides: Record<string, boolean>`，兼容保留 language 与 nullable Memory config；不恢复已从主线删除的 Extension overrides。
  - 增加 `listSkills(cwd)`、`setSkillEnabled(cwd, id, enabled)` 与供 Chat 使用的 Skill 过滤选择方法。
  - 复用 Pi SDK 0.87.1 对 Skills 的解析结果；只把最终有效且获胜的 Skill 转换成 Renderer DTO。
  - 对 user/project 生成安全 `displayPath`；系统内置分组保留扩展位，但当前主线无 bundled Skills。
- `electron/domains/settings/settings.test.ts`
  - 先写失败测试，再实现：用户默认目录、用户 settings/package、项目默认目录、项目 settings/package、来源分组、描述、稳定 ID、冲突优先级、单项持久化、v7→v8 schema migration、未知 ID、同 package 不联动、安全路径和 symlink 边界。
- `electron/domains/chat/spireSettings.ts`
  - 扩展资源来源建模，使 Skill catalog 与 Chat 能使用同一组用户/SpireCode显式 Skills，同时不破坏现有 provider/settings merge。
- `electron/domains/chat/spireSettings.test.ts`
  - 覆盖 `skills` 资源来源、层级合并与既有 packages/extensions 行为。
- `electron/domains/chat/piAdapter.ts`
  - 扩展 typed `PiResourceLoaderOptions` 支持 Pi SDK `skillsOverride`。
  - 在每次 create/open Session 的资源加载边界注入 Main-owned Skill 过滤；过滤完整 Skill 集合，确保系统提示词和 `/skill:name` commands 同时移除。
  - 保持已有 Extension paths 选择、provider precedence 和诊断处理不变。
- `electron/domains/chat/piAdapter.test.ts`
  - 先写失败测试：新 Session 收到 Skill filter；禁用 Skill 从 resource loader 结果和命令中消失；其他 Skill 与同 package 其他资源不受影响；existing Session 没有热修改路径。
- `electron/domains/chat/resourceIsolation.test.ts`
  - 增加真实 Pi SDK 资源加载集成测试，证明用户/项目 Skill 的发现和 `skillsOverride` 过滤与 Pi 行为一致，同时不放宽 Extensions 隔离。
- `electron/domains/chat/chatService.ts`
  - 将 `selectSkills` 依赖从 `AppState` 传入 adapter；维持 Main-owned 选择边界。
- `electron/domains/chat/chatService.test.ts`
  - 如现有 adapter factory 测试需要，补充 Skill selector 透传回归。
- `electron/appState.ts`
  - 连接 `SettingsService` Skill catalog/override 与 `ChatService`；Settings 和 Chat 使用同一份状态及当前 canonical worktree root。
- `electron/appState.test.ts`
  - 覆盖 app wiring，避免 catalog 可切换但 Chat 未应用的“仅 UI 生效”回归。

### IPC 与 Renderer 类型边界

- `electron/contracts.ts`
  - allowlist 新增 `settings_skills_list`、`settings_skill_set_enabled`。
- `electron/contracts.test.ts`
  - 断言新命令存在，任意通用 IPC 仍不可用。
- `electron/ipc.ts`
  - 分发两个 Skills command；仅接受 `worktreeId`、opaque `skillId` 和 boolean `enabled`。
- `electron/ipc.test.ts`
  - 先写失败测试：合法参数通过；path/额外字段、未知命令参数类型被拒绝。
- `src/bindings/generated.ts`
  - 增加严格 `SkillSetting` DTO。
- `src/bindings/index.ts`
  - 增加 typed `settingsSkillsList`、`settingsSkillSetEnabled` bindings。
- `src/features/settings/settingsApi.ts`
  - 暴露 Skills list/toggle，不向组件暴露底层 command 字符串。

### Settings UI 与本地化

- `src/features/settings/SettingsDialog.tsx`
  - 左侧增加 Skills 项和图标。
  - 新增 `SkillsSettings` 页面：加载/错误/无项目状态，系统内置、用户、项目三组，description、来源与单项 switch。
  - toggle 请求期间仅禁用当前项；成功用 Main 返回 catalog 更新，失败保留旧状态并显示错误。
- `src/features/settings/SettingsDialog.test.tsx`
  - 先写失败测试：导航出现、三组渲染、5 个内置项、描述与安全来源、empty state、单项 toggle、失败状态、无 worktree 不调用 Main。
- `src/i18n/en.ts`
- `src/i18n/zh-CN.ts`
  - 增加 Skills 导航、说明、分组、来源、empty/loading、开关和安全提示文案。
- `src/i18n/i18n.test.ts`
  - 覆盖带变量的 Skill toggle 文案，并由 typed catalog 保证双语 key 完整。
- `src/styles/index.css`
  - 复用 Extension list/switch 视觉结构；仅增加必要的 Skill description、来源和三分组样式，避免复制整套组件样式。

### 项目记忆

- `AGENTS.md` — 仅当实现中同一类错误重复出现至少两次时，加入可复用且一页内的规则；否则不改。

## Order of work

1. **确认文档状态**
   - 将 `docs/settings-skills/spec.md` 标记 accepted。
   - 不改功能代码前，以本计划作为实施边界。

2. **Red：Main Skill catalog 与持久化测试**
   - 在临时 fixture 中创建 user/project Skills、settings packages、冲突项和 symlink escape。
   - 写出当前必失败的 catalog、单 Skill toggle、迁移和安全测试。

3. **Green：共享 Skill catalog/selection**
   - 在 Main 实现 Skill identity、来源分类、安全路径、override schema 和 catalog。
   - 优先组合 Pi SDK `DefaultPackageManager` / `DefaultResourceLoader` 的解析结果，不复制 Skill parser。
   - 确保 catalog 中的 enabled 计算与过滤器使用同一个函数。

4. **Red/Green：新 Session 资源过滤**
   - 先在 `piAdapter.test.ts` 和真实 loader 集成测试中证明目前禁用 Skill 仍会加载。
   - 接入 `skillsOverride`，验证被禁用 Skill既不进入 prompt，也不注册 command。
   - 通过 `ChatService` / `AppState` 注入 selector，确保每次 create/open 时读取最新 override。

5. **Red/Green：IPC 与 typed bindings**
   - 先添加 allowlist 和参数拒绝测试。
   - 实现 Main dispatch、DTO 与 Renderer binding；保持 Renderer 只能传 ID，不能传路径。

6. **Red/Green：Settings UI**
   - 先添加导航、分组、toggle、error/empty tests。
   - 实现 Skills 页面、中英文文案和最小 CSS。
   - 复核 keyboard/aria label、loading 状态与单行超长 description/path。

7. **回归与整理**
   - 运行目标测试并修正实现，不修改已表达验收语义的测试来“做绿”。
   - 搜索所有新增 command/type/i18n key 的调用点，检查 Extensions/Memory 行为未被误改。
   - 对变更运行 formatter、lint、typecheck 和全量 gate。
   - 若实现偏离本计划，同步更新本文件和 spec 后再结束。

## Risks

### 1. Catalog 与真实 Session 集合漂移（最高风险）

如果 Settings 使用 `DefaultPackageManager.resolve()`，而 Chat 使用另一组 `DefaultResourceLoader` inputs，UI 可能显示“关闭”但 Session 仍加载 Skill。规避方式是建立单一 Main-owned Skill selection/identity 层，并用真实 Pi loader 集成测试同时证明 catalog 和 `skillsOverride` 的结果。

### 2. SpireCode 当前资源隔离策略与 Pi 默认发现冲突

Chat 当前通过 `resolveSpireResources()` 和 `noExtensions: true` 控制资源边界；Skills catalog 使用 cwd-bound `SettingsManager` 以发现项目 Skills，但不得让这一变化重新引入隐式 Extensions。真实 `resourceIsolation.test.ts` 同时断言 Extensions 仍隔离、Skills 按 spec 发现。

### 3. 项目 trust 语义

项目 Skills 能引导 Agent 执行代码，不能为了展示而绕过 Pi trust。Catalog 和 Session 必须使用一致的 trust 决策；若当前 SpireCode 尚无交互式 trust 状态，不能静默把未信任项目 Skills 标为已加载。实施时若发现现有架构无法表达已批准 trust，先停止并回报 concern，而不是默认信任。

### 4. Skill identity 与名称冲突

用 name 作为 ID 会在来源变化或冲突时切错条目；用临时绝对路径会导致 bundle 版本变化后状态丢失。ID 应基于来源层、package/配置 identity 和规范化相对 Skill 路径，UI 只展示缩写路径。冲突项必须遵循 Pi 的最终获胜顺序。

### 5. Pi SDK `skillsOverride` 时机

必须确认 override 在 Skill commands 和 system prompt 构建前运行。若仅过滤 `session.skills` 的展示结果而 commands 已注册，就不满足验收。使用真实 SDK loader/session test 验证，而不是只断言 mock callback 被传入。

### 6. State schema 回归

`extension-settings.json` 持有语言、nullable Memory 配置和 Skill overrides。schema 升级必须 copy-on-write、原子保存，并有旧 v7 fixture 证明升级不丢现有字段。

## Alternatives rejected

- **直接修改 `~/.pi/agent/settings.json` 的 package filters**：会篡改用户在其他 Pi 客户端共享的配置，且难以表达默认目录的单 Skill禁用。
- **只在 Renderer 隐藏禁用项**：Agent 仍能看到和调用 Skill，不是真正开关。
- **按 package 开关**：不符合已确认的单 Skill 粒度，并会连带关闭 Extensions/Prompts/Themes。
- **自行解析所有 `SKILL.md` frontmatter**：会与 Pi 的校验、递归发现、冲突和未来格式演进漂移。
- **热修改既有 Session**：会改变已经建立的 system prompt/command surface，状态和审计语义不清晰；本次明确只影响新 Session。

## Proof

按由小到大顺序执行：

```bash
pnpm exec vitest run electron/domains/settings/settings.test.ts
pnpm exec vitest run electron/domains/chat/spireSettings.test.ts electron/domains/chat/resourceIsolation.test.ts electron/domains/chat/piAdapter.test.ts electron/domains/chat/chatService.test.ts
pnpm exec vitest run electron/contracts.test.ts electron/ipc.test.ts electron/appState.test.ts
pnpm exec vitest run src/features/settings/SettingsDialog.test.tsx src/i18n/i18n.test.ts
pnpm check
```

完成证据：

- 目标测试先红后绿，提交/最终说明中记录失败原因和修复点。
- `pnpm check` 全部退出 0。
- 检查最终 diff 中无用户配置改写、无绝对 bundle path 暴露、无 Renderer Node/IPC 扩权。
- 手工或自动创建新 Session，确认禁用 Skill 不出现在 session config 的 Skill commands，并确认启用后新 Session 恢复。
