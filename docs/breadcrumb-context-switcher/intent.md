# Intent: 可搜索的面包屑上下文切换器
Author: User。 Status: accepted。

## Problem

顶部面包屑目前只展示当前 Project、Worktree 和 local branch，用户必须回到 Projects 侧栏才能切换 checkout，也不能从顶部查看或切换当前 worktree 的本地分支。Project、worktree 或 branch 较多时，缺少搜索会进一步降低定位效率。

## Proposed outcome

将面包屑改为两级可搜索上下文切换与一级只读状态展示：

- 点击 Project 或 Worktree 分别打开对应下拉框。
- Project 和 Worktree 下拉框支持大小写不敏感搜索，并标识当前选项。
- 选择 Project 后进入该 Project 的 main worktree；没有 main 时回退到第一个 worktree。
- 选择 Worktree 后切换当前 checkout。
- Local branch 仅展示当前 worktree 的真实分支名称，不可点击，不提供下拉框或搜索。
- Project/Worktree 下拉框支持键盘操作、Escape 和点击外部关闭。

## Affected users and systems

- 使用多个 Project、worktree 或 local branch 的 SpireCode 用户。
- Renderer 顶部导航、Project catalog 状态和中英文 UI 文案。
- Branch 展示继续使用现有 Git status 数据，不新增修改仓库状态的能力。

## Constraints

- Renderer 不直接运行 Git，不接收任意路径、shell 或分支切换能力。
- 保持现有三层面包屑紧凑布局和沙箱边界，不引入通用命令执行接口。
- Branch 优先展示现有 live Git status；status 尚未返回时回退到 catalog 中的 branch。

## Open questions

无。需求方已明确撤销 local branch 下拉与切换能力，Branch 仅用于展示。
