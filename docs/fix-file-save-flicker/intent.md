# Intent: 修复文件保存后的编辑器闪烁
Author: keliangliang。 Status: accepted。

## Problem

用户编辑文件并按保存快捷键后，Monaco 会短暂显示保存前的旧内容，再恢复为新内容，形成明显闪烁。

确定性调用链为：

1. `fsWriteFile` 返回保存后的新内容和 version；
2. `FileView` 更新局部 content、saved baseline 和 version；
3. dirty 变为 false 后，同步 effect 仍读取父级 `ResourceView` 中保存前的旧 `FileContent` prop，并将 Monaco 回写为旧内容；
4. filesystem watcher 随后使 resource generation 失效，重读磁盘新内容，再把 Monaco 改回新内容。

因此闪烁来自保存响应与父级 resource snapshot 不一致，而不是 watcher 频率本身。

## Proposed outcome

- 保存成功后，编辑器内容保持为已保存的新内容，不出现旧内容回退。
- 保存响应立即成为当前 resource snapshot 和 cache 的权威值。
- watcher 仍正常触发后台校验刷新，但不得造成 Monaco 内容闪烁或重建。
- dirty 标记、冲突保护和标签切换 draft 保留行为不退化。

## Affected users and systems

- 使用 Files 编辑文本并保存的 SpireCode 用户。
- Renderer 的 `ResourceView`、`FileView`、resource cache 与 filesystem watcher invalidation 链路。

## Constraints

- 不降低或延迟 filesystem watcher。
- 文件正文不进入 Zustand。
- 不通过 loading overlay、定时器或 CSS 隐藏闪烁。
- 旧 generation 响应仍不得覆盖新 resource snapshot。

## Open questions

- 无。
