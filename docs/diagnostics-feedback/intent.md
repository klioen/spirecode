# Intent: 本地日志、诊断与反馈
Author: product owner。 Status: accepted。

## Problem

生产错误主要进入 console，用户无法提供日志、版本和运行环境信息；Settings 也没有反馈入口。正式 MVP 需要一个不依赖遥测的本地诊断闭环。

## Proposed outcome

- Main 写入 bounded 本地日志；
- Settings 可复制脱敏诊断信息、打开日志目录、打开反馈页面；
- 诊断包含版本、平台、Electron、架构、运行目录和最近日志，不包含凭据、环境变量、文件正文、终端输入或 Chat transcript。

## Constraints

- 默认不上传数据、不引入遥测服务；
- 日志大小有上限，写入失败不影响主业务；
- 所有路径由 Main 生成，Renderer 不提交路径。
