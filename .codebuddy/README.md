# `.codebuddy` — CodeBuddy 记忆体（持久化）

> **重要**：本目录存储 CodeBuddy 项目相关数据（记忆规则、自动化任务等），
> **不是临时缓存，请勿删除**。本目录已纳入 Git 跟踪，
> 确保在 CNB 云原生开发环境中每次重建后记忆不丢失。

## 目录结构

```
.codebuddy/
├── rules/
│   └── project-memory.md      # 项目记忆库（记忆自动同步任务的落盘位置）
├── automations/
│   └── memory-sync/
│       └── automation.toml    # 记忆同步自动化配置备份（每小时运行）
├── restore.sh                 # 云环境重建后的记忆体恢复脚本
└── README.md                  # 本说明文件
```

## 工作流程

1. **记忆沉淀**：CodeBuddy 自动化任务「CodeBuddy 记忆同步到 Workspace」
   每小时运行一次，把对话中产生的编码偏好、项目约定、重要上下文
   追加写入 `rules/project-memory.md`（只追加、不覆盖）。
2. **Git 持久化**：`rules/`、`automations/`、`restore.sh` 均通过 Git 提交，
   随仓库推送到 CNB。
3. **环境恢复**：每次进入新的 CNB 云原生开发环境，代码克隆后记忆体
   自动就位；若本地自动化任务（`~/.codebuddy/automations/`）丢失，
   执行 `bash .codebuddy/restore.sh` 一键恢复。

## 手动同步记忆

```bash
# 编辑项目记忆
vim .codebuddy/rules/project-memory.md

# 提交记忆到仓库（持久化）
git add .codebuddy/
git commit -m "docs: 更新项目记忆"
```

## 注意

- `.gitignore` 中**不要**忽略 `.codebuddy/` 目录。
- `restore.sh` 采用 `cp -rn`（不覆盖已存在文件），避免覆盖云环境中
  已生效的自动化任务。
