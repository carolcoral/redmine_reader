# 项目记忆库（Project Memory）

> 本文件由 CodeBuddy 记忆自动同步任务维护，**只追加、不覆盖**。
> 每次进入 CNB 云原生开发环境后，本文件内容即从 Git 仓库自动恢复，
> 请将重要的编码偏好、项目约定、架构决策、上下文信息记录在此。

---

## 2026-08-27

- 本仓库为 `xindu.site/redmine_reader`，配置了「同步到 GitHub」Web Trigger（`.cnb.yml` + `.cnb/web_trigger.yml`），目标 GitHub 仓库为 `carolcoral/redmine_reader`，使用 `xindu.site/secret` 密钥仓库中的 `GITHUB_TOKEN`。
- `.codebuddy/` 目录为 CodeBuddy 记忆体，已纳入 Git 持久化；记忆规则统一写入本文件，自动化配置备份于 `.codebuddy/automations/`，恢复脚本见 `.codebuddy/restore.sh`。
- 本仓库本体是 Redmine 6.1.x 在线文档阅读器插件（v1.0.0 已完成首次提交推送）：纯前端渲染 docx/pdf/markdown/text/pptx/excel，零 gem、零迁移。
- 关键交互决策：用户要求**点击附件链接即直达预览页**（不额外注入预览图标），入口脚本 `reader_entry.js` 按扩展名白名单把附件链接 href 改写为 `/reader/:id`，原下载地址存 `data-download-url`；**原下载功能由预览页工具栏「下载」按钮兼容**。
- 架构：`ReaderController`（visible? 403/404）+ `show.html.erb`（独立全屏页）+ `reader.js`（按格式懒加载自托管 vendor 库）；Markdown 管线为 marked → DOMPurify → highlight.js。
- vendor 库全局名：pdfjsLib / docx / JSZip / XLSX / marked / DOMPurify / hljs / pptxPreview（UMD 均已在 Node 沙箱验证）。pptx-preview 的 UMD 内含 Node 依赖引用但浏览器加载验证通过。
- 本地无 Ruby/Redmine 宿主：语法校验用 docker ruby:3.2-slim 跑 `ruby -c` 与 ERB 解析；功能测试需在目标 Redmine 环境执行 `rake redmine:plugins:test`。
