# 项目记忆库（Project Memory）

> 本文件由 CodeBuddy 记忆自动同步任务维护，**只追加、不覆盖**。
> 每次进入 CNB 云原生开发环境后，本文件内容即从 Git 仓库自动恢复，
> 请将重要的编码偏好、项目约定、架构决策、上下文信息记录在此。

---

## 2026-08-27

- 本仓库为 `xindu.site/redmine_reader`，配置了「同步到 GitHub」Web Trigger（`.cnb.yml` + `.cnb/web_trigger.yml`），目标 GitHub 仓库为 `carolcoral/redmine_reader`，使用 `xindu.site/secret` 密钥仓库中的 `GITHUB_TOKEN`。
- `.codebuddy/` 目录为 CodeBuddy 记忆体，已纳入 Git 持久化；记忆规则统一写入本文件，自动化配置备份于 `.codebuddy/automations/`，恢复脚本见 `.codebuddy/restore.sh`。
