# Redmine Reader 测试环境

Docker Compose 一键部署 **Redmine 7.0.1 + PostgreSQL 16**，用于本地验证
`redmine_reader` 插件（文档在线阅读器）。

## 架构

```
浏览器 ──> :8080 (宿主机端口映射) ──> redmine-reader:7.0.1 (:3000)
                                          │
                                          ├── entrypoint.sh 编排（运行时，非构建时）
                                          │      首次启动：起裸服务 → clone 插件仓库
                                          │      https://cnb.cool/xindu.site/redmine_reader
                                          │      → 插件迁移 → 重启（加载插件）
                                          ├── plugin-test/redmine/database.yml ──> config/database.yml (ro)
                                          │
                                          └──> db: postgres:16-alpine (healthcheck 就绪后才开始迁移)
                                                  └── postgres_data 卷（数据持久化）
```

**首次启动**命令链（容器启动时逐步执行，日志可见）：

| 步骤 | 命令 | 说明 |
|---|---|---|
| 1/5 | `rake db:migrate` | 核心迁移（建表、创建 admin 用户） |
| 2/5 | `rails server`（后台） | **先以无插件状态启动服务**（插件目录尚不存在，避免因数据库未迁移导致启动报错） |
| 3/5 | `git clone … /usr/src/redmine/plugins/redmine_reader` | 服务就绪后再 clone 插件仓库 |
| 4/5 | `rake redmine:plugins:migrate` | 插件数据库迁移 |
| 5/5 | 重启 `rails server` | 终止裸服务，`exec` 重新启动（此时插件已加载） |

后续每次启动（插件已 clone）：`db:migrate` → `redmine:plugins:migrate` → 手动 `cp` 同步插件 assets → `load_default_data` → `rails server`，幂等安全。

> 镜像内 `redmine:plugins:assets` 任务不可用（任务列表中只有 `redmine:plugins:test:ui` /
> `redmine:plugins:migrating`），所以**手动复制** `plugins/<name>/assets/` →
> `public/plugin_assets/<name>/`，效果等同。

## 前置要求

- Docker Engine + Docker Compose v2（`docker compose version` 可用）
- 可用磁盘约 500MB（镜像 ~300MB + 80MB）
- 宿主机 8080 端口空闲（被占用时修改 `docker-compose.yml` 的端口映射左侧）
- 可访问 `https://cnb.cool`（首次启动时容器内需要 `git clone` 插件仓库）

## 部署流程

1. **构建镜像**：`docker compose build`（基于 `redmine:7.0.1`，仅内置启动编排
   脚本 `entrypoint.sh`，**不包含插件代码**）
2. **首次启动**（`docker compose up -d`）：编排脚本按顺序执行
   ① 核心迁移 → ② 以无插件状态启动服务 → ③ 服务就绪后 `git clone` 插件仓库
   到 `/usr/src/redmine/plugins/redmine_reader` → ④ `bundle exec rake
   redmine:plugins:migrate` → ⑤ 重启服务（加载插件）
3. **后续启动/重启**：`docker compose restart redmine` 会重跑迁移链
   （插件已 clone，跳过 clone 步骤），幂等安全

## 快速开始

```bash
cd plugin-test
docker compose up -d --build   # 首次需 --build 构建镜像

# 跟踪启动日志（观察编排链逐步执行：裸服务 → clone → 迁移 → 重启）
docker compose logs -f redmine
```

看到 `==> Starting Rails server on :3000 (with plugin)` 且后续无报错即启动完成
（首次启动含镜像拉取、裸服务就绪等待与插件 clone，约 2–3 分钟）。

打开 **http://localhost:8080**，默认账号 `admin` / `admin`
（首次登录强制修改密码，Redmine 核心行为）。

## 插件功能验证

1. **插件已加载（无需登录，直接 curl）**

   ```bash
   # 插件静态资源可达（assets 同步成功的客观证据）
   curl -sI http://localhost:8080/plugin_assets/redmine_reader/javascripts/reader_entry.js | head -1
   # 期望: HTTP/1.1 200

   # 插件路由已挂载（未登录应为 302 跳转登录页，而非 404）
   curl -sI http://localhost:8080/reader/1 | head -1
   # 期望: HTTP/1.1 302
   ```

2. **端到端预览验证（浏览器）**：按下方「使用说明」章节完整走一遍即可，
   覆盖各格式渲染、工具栏与降级/兜底行为的核对。

## 使用说明（端到端操作指引）

按以下步骤可完整验证插件各功能（约 10 分钟）：

1. **登录**：浏览器打开 http://localhost:8080，用 `admin` / `admin` 登录
   （首次登录会强制修改密码，请牢记新密码）。

2. **准备测试项目**：右上角「管理」→「项目」→「新建项目」，填写标识符（如
   `reader-demo`）后保存；或直接使用默认示例项目。

3. **上传附件**（任选一个位置即可）：
   - Issue：进入项目 →「问题」→「新建问题」，在「文件」处附加文件
   - 文件库：项目 →「文件」→「新建文件」
   - Wiki：项目 →「Wiki」→ 编辑页面 → 附件
   建议按格式各上传一份：`.pdf`、`.docx`、`.md`、`.txt`、`.xlsx`、`.pptx`，
   外加一份非白名单文件（如 `.zip`）和一份旧格式（如 `.doc`）用于对照。

4. **预览**：在列表/详情页点击附件文件名链接，应**直接进入预览页**
   （而不是下载），URL 形如 `/reader/<附件id>`。

5. **逐项核对渲染效果**：

   | 文件 | 核对点 |
   |---|---|
   | Markdown | GFM 表格、任务列表、代码高亮、代码块「复制」按钮 |
   | PDF | 逐页渲染、缩放控件（+/−/适应宽度）、页码显示 |
   | Excel | 底部工作表标签切换、表头吸顶、斑马纹 |
   | Word / PPT | 内容正常显示、样式保留 |
   | 文本 | 中文不乱码、换行开关可用 |

6. **工具栏验证**：点击「下载」按钮应下载到原文件；「打印」应弹出打印预览
   （工具栏自动隐藏）。

7. **对照行为**：
   - 点击 `.zip` 等非白名单附件 → 保持 Redmine 原生下载行为
   - 点击 `.doc` / `.ppt` → 出现降级提示卡 + 下载兜底按钮

## 故障排查

| 现象 | 常见原因 | 解决 |
|---|---|---|
| 首次启动日志停在 `[3/5] Clone plugin repository`（git clone 报错） | 容器内无法访问 `https://cnb.cool` 或仓库地址变更 | 检查网络/DNS（容器内）；确认仓库地址有效；或先 `docker compose exec redmine` 手动 clone 后再重启 |
| 启动卡在等待裸服务就绪（`waiting for bare Redmine to become ready`） | 核心迁移异常 / 数据库连接失败 | `docker compose logs db` 查看数据库日志；确认 `redmine/database.yml` 与 `POSTGRES_*` 一致；必要时 `down -v` 重建 |
| `docker compose up` 报端口占用 | 宿主机 8080 被其他进程占用 | 修改 `docker-compose.yml` 中 `8080:3000` 左侧端口后重启 |
| 启动日志长时间停在 `[1/5]` 或报数据库错误 | PostgreSQL 未就绪或口令不符 | `docker compose logs db` 查看数据库日志；确认 `redmine/database.yml` 与 `POSTGRES_*` 一致 |
| 迁移报错（`rake redmine:plugins:migrate` 失败） | 镜像与数据库版本不匹配 / 数据卷残留损坏 / 插件目录缺失 | `docker compose exec redmine ls /usr/src/redmine/plugins` 确认插件已 clone；必要时 `docker compose down -v` 彻底重建 |
| 插件 CSS/JS 报 404 | 静态资源未同步（编排脚本手动 `cp` 失败或被清理） | 确认 `docker compose exec redmine ls /usr/src/redmine/public/plugin_assets/redmine_reader` 存在；不存在则 `docker compose restart redmine` 重跑手动复制 |
| 点击附件仍走下载、不跳预览页 | 插件未加载 / 浏览器缓存旧入口脚本 | 确认容器内 `/usr/src/redmine/plugins/redmine_reader` 存在且 `init.rb` 注册成功；浏览器硬刷新（Ctrl+Shift+R） |
| 预览页返回 403 | 当前账号对该附件不可见 | 使用具备该附件查看权限的账号登录（权限校验与 Redmine 一致） |
| 修改插件代码后页面无变化 | 插件在容器内 clone，宿主机改动不会自动生效 | 更新插件：`docker compose exec redmine rm -rf /usr/src/redmine/plugins/redmine_reader` 后 `docker compose restart redmine`，再硬刷新浏览器 |
| 「下载」按钮下载失败 | 附件文件卷未挂载或权限问题 | 确认 `redmine_files` 卷正常挂载；重新 `docker compose up -d` 重建容器 |
| 中文附件名乱码 | 未配置 UTF-8 / 浏览器编码问题 | 确认数据库编码 `utf8`（`redmine/database.yml` 已配置）；用现代浏览器访问 |

## 常用命令

```bash
docker compose up -d              # 启动（后台）
docker compose logs -f redmine    # 跟踪 Redmine 日志（含迁移链输出）
docker compose logs -f db         # 跟踪数据库日志
docker compose restart redmine    # 重启 Redmine（重启会重新执行迁移链，幂等安全）
docker compose stop               # 停止（保留数据）
docker compose down               # 移除容器（数据卷保留，重启数据不丢）
docker compose down -v            # 彻底重置（连同数据库/附件卷一起删除）
```

插件代码在容器内 clone（不在宿主机），宿主机改动不会生效。更新插件代码：

```bash
# 删除容器内旧 clone 后重启（重启会重新 clone + 迁移 + 启动）
docker compose exec redmine rm -rf /usr/src/redmine/plugins/redmine_reader
docker compose restart redmine
```

或彻底重建：`docker compose down -v && docker compose up -d --build`。

## 数据持久化

| 卷 | 内容 | `down` 后 | `down -v` 后 |
|---|---|---|---|
| `postgres_data` | PostgreSQL 全部数据（用户/项目/issue） | 保留 | 删除 |
| `redmine_files` | 上传的附件文件 | 保留 | 删除 |

## 安全注意事项

- 数据库口令（`redmine/redmine`）与 `SECRET_KEY_BASE` 均为**测试固定值**，
  严禁将本环境暴露到公网；`db` 服务未映射宿主机端口，仅容器网络内可达
- 生产部署请自行修改：数据库口令、SECRET_KEY_BASE（`docker compose` 环境
  变量）、端口绑定（如 `127.0.0.1:8080:3000`）
