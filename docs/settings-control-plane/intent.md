# Intent: Agent、Editor、Terminal Settings 控制面
Author: product owner。 Status: accepted。

## Problem

Settings 中 Agent、Editor、Terminal 三个 section 仍是 Coming Soon。用户无法调整编辑器字号/换行、终端字号/scrollback，也没有 pi 配置位置和认证边界说明。

## Proposed outcome

提供真实可生效的设置：

- Agent：显示 pi 配置目录与权限说明，支持复制配置目录路径；
- Editor：字号、Word Wrap；
- Terminal：字号、scrollback；
- 配置跨重启保存，并立即影响现有/新建视图。

## Constraints

- 不在本批实现 API key 输入或应用内 OAuth；
- 设置值仅为有限枚举/数值，使用 Renderer localStorage；
- 不暴露环境变量、凭据或通用文件系统权限；
- Monaco/xterm 继续由现有组件拥有运行时实例。
