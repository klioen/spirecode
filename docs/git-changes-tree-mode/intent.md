# Intent: Changes 列表与目录树视图切换
Author: user。 Status: accepted。

## Problem
Changes 模块目前只以平铺列表展示文件。路径较深或改动文件较多时，用户难以按目录结构理解改动分布。

## Proposed outcome
在 Changes 面板右上角增加 List 与 Tree 两种展示模式的切换控件：

- List 保持当前平铺路径展示。
- Tree 在 STAGED、CHANGES、UNTRACKED 各分组内部按目录层级展示。
- Tree 模式中的目录默认全部展开，并允许用户单独折叠或展开。
- 未主动选择时默认使用 List 模式。

## Affected users and systems
- 使用 Changes 面板浏览 Git 工作区改动的 SpireCode 用户。
- Renderer 中的 Changes 组件、视图状态和相关样式/测试。
- 不改变 Electron Main、Git 状态协议或文件访问边界。

## Constraints
- 保留 STAGED、CHANGES、UNTRACKED 三个现有分组及文件打开行为。
- 默认模式必须是 List。
- 仅在前端组织现有 GitChange 数据，不引入新的 IPC 或文件系统访问。
- 模式属于视图元数据，可保存在 Zustand store 中。

## Open questions
无。
