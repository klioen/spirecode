# Intent: 修复文件查看器永久 Loading
Author: keliangliang。 Status: accepted。

## Problem

点击文件后，文件读取已完成，但 Monaco 查看器一直显示 Loading。应用只配置了 Monaco workers，没有把 `@monaco-editor/react` loader 绑定到本地 `monaco-editor`；loader 默认尝试从 CDN 加载，而生产 App 的 CSP 禁止远程脚本，因此编辑器初始化永远无法完成。

## Proposed outcome

Monaco 完全从应用 bundle 加载；点击文本文件后显示内容，不依赖外网或放宽 CSP。增加启动配置回归测试，固定 loader 必须使用本地 Monaco instance。

## Affected users and systems

Files/Changes 的 Monaco Editor 与 DiffEditor。

## Constraints

不允许 CDN，不放宽远程脚本 CSP；保留现有本地 worker 打包。

## Open questions

无。
