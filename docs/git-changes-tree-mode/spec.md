# Spec: Changes 列表与目录树视图切换

## Requirements

1. Changes 面板工具栏右侧显示 List 和 Tree 两个模式按钮，并与刷新按钮并列。
2. 当前模式按钮必须具备可见选中态和 `aria-pressed` 状态，按钮通过 title/accessible name 标明用途。
3. `changesStore.mode` 作为全局 Changes 视图模式，初始值为 `list`；本次不增加持久化，应用重启后仍默认 List。
4. List 模式保持当前行为：每组逐条显示完整相对路径。
5. Tree 模式仍按 STAGED、CHANGES、UNTRACKED 分组；每组把 change.path 拆成目录节点与文件叶子节点。
6. 同级节点按目录优先、名称自然排序；路径无目录部分时直接显示文件。
7. Tree 模式首次展示一个目录时默认展开；用户可点击目录行切换展开状态。展开状态仅是当前 Renderer 会话内的视图状态。
8. Tree 模式文件叶子复用现有 diff resource id、单击预览、双击固定标签页、active 状态和 Git 状态标记。
9. 空状态、加载态、刷新和 stale error 行为不变。

## Design

- 在 `ChangesPanel.tsx` 内增加纯函数，将 `GitChange[]` 构造成目录树节点，避免更改后端 Git contract。
- ChangeGroup 根据 mode 分派平铺列表或递归树组件。
- 目录展开集合由 ChangesPanel 的 React state 管理，以 `scope:path` 区分三个分组；目录未出现在折叠集合中即视为展开，从而天然满足默认全部展开，并兼容刷新后新出现的目录。
- 文件打开逻辑提取为共享叶子组件，保证 List/Tree 两种模式行为一致。
- 工具栏使用 Remix Icon 的列表、目录树和刷新图标；通过 segmented control 样式表达选中模式。
- 添加组件测试覆盖默认 List、切换 Tree、目录层级和折叠交互；store 测试覆盖默认模式与切换。

## Concerns

- 同一文件可能同时属于 staged 与 unstaged，两组使用不同 scope，资源 ID 和目录折叠键必须保持隔离。
- 文件名和目录名可能在不同路径层级重复，React key 必须使用完整路径。
- Tree 展示只改变视觉组织，不能改变传给 diff viewer 的原始 relativePath。
