# Intent: 收紧 Changes 树形视图缩进
Author: user。 Status: accepted。

## Problem
Changes 选择 Tree 视图时，深层目录下的 diff 文件每层累计缩进过大，文件名被明显推向右侧，减少了可读空间。

## Proposed outcome
在不改变目录层级、折叠行为和 diff 打开行为的前提下，收紧 Tree 视图目录与文件节点的每级缩进。

## Affected users and systems
- 使用 Changes Tree 视图浏览 Git 改动的 SpireCode 用户。
- Renderer 中 Changes 组件及其组件测试。
- 不改变 Electron Main、Git 协议、List 视图或文件访问边界。

## Constraints
- 根节点仍从 12px 开始。
- 每级目录层级缩进从 14px 收紧为 8px。
- 同层目录和文件使用完全相同的左侧内边距。
- Changes 文件行不再增加用于对齐目录展开箭头的额外占位；文件图标直接从该层起始位置展示。
