# Intent

SpireCode 的自动 Task 交付目前信任 coding agent 自己的报告，并在报告完成后直接提交、推送和创建变更请求。该流程缺少一个只依据原始需求、在固定代码版本上运行的独立验证者。

本变更在交付前增加默认开启的 Verification Agent Gate。验证失败或基础设施无法得出结论时保留工作区和证据、阻止远端交付，并把 Task 交给人工审阅；只有独立验证通过才继续现有交付。

这是高风险变更：它新增 SQLite schema、跨进程契约、受限 agent session，并改变 Git 自动交付顺序。Task intake 已明确确认这些边界和实施授权。
