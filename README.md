# Redmine Reader

Redmine 6.1.x 在线文档阅读器插件：**点击附件链接即直达预览页**，在浏览器端渲染
docx / pdf / markdown / text / pptx / excel，无需任何服务端转换组件（LibreOffice
等）、不新增 gem 依赖、无数据库迁移。

## 特性

### 全位置通用预览

无论附件出现在哪里——项目文件库（Files）、issue 附件、文档（Documents）、
Wiki、新闻、论坛、帮助与支持模块等——受支持格式的附件链接点击后**直接打开
预览页面**（左键、中键新标签、右键复制链接均直达预览页）：
入口脚本按扩展名白名单将附件链接的 `href` 改写为 `/reader/:id`，
原下载地址保留在 `data-download-url` 中。

### 下载兼容

预览页顶部工具栏提供**「下载」图标按钮**，指向 Redmine 原生附件下载地址，
完整保留原有的文件附件下载能力；旧格式降级提示卡中同样提供下载按钮。

### 支持的格式

| 格式 | 扩展名 | 渲染方案 | 说明 |
|---|---|---|---|
| PDF | `.pdf` | pdf.js | 逐页画布渲染、缩放、适应宽度、页码 |
| Word | `.docx` | docx-preview | 保留原样式 |
| Markdown | `.md` `.markdown` | marked + DOMPurify + highlight.js | GFM 表格/任务列表/删除线、代码高亮与一键复制 |
| 文本 | `.txt` `.log` | 原生 `<pre>` | 编码自适应（UTF-8 优先，GBK 兜底）、换行开关 |
| Excel | `.xlsx` `.xlsm` `.xls` `.csv` | SheetJS | 多工作表标签切换、表头吸顶、斑马纹 |
| PPT | `.pptx` | pptx-preview | 幻灯片浏览 |
| 旧格式 | `.doc` `.ppt` | — | 明确提示不支持在线预览，提供下载兜底 |

非白名单文件（如 `.zip`、图片）保持 Redmine 原生行为不变。

### 安全

- 预览权限完全复用 Redmine 的 `Attachment#visible?(User.current)`：
  附件对当前用户不可见时返回 403
- 文档内容通过 Redmine 原生附件下载 URL 获取（Session 鉴权，无旁路）
- Markdown 渲染经过 DOMPurify 清洗，防 XSS；文本/表格单元格一律
  `textContent` 注入

## 安装

以 Redmine 安装在 `/opt/redmine` 为例：

```bash
cd /opt/redmine/plugins
git clone https://cnb.cool/xindu.site/redmine_reader.git

# 复制插件静态资源到 public/plugin_assets/
cd /opt/redmine
RAILS_ENV=production bundle exec rake redmine:plugins:assets

# 本插件无迁移，无需 db:migrate（执行亦无害）
# 重启 Redmine
systemctl restart redmine  # 或您的进程管理方式
```

要求：Redmine `>= 6.1`（Rails 7.2 / Ruby 3.2+）。

## 使用

1. 上传受支持格式的附件到任意位置（issue、文件库、文档、Wiki…）
2. 点击附件文件名链接 → 直接进入预览页面
3. 预览页工具栏：
   - **返回**：回到来源页面
   - 文件名 / 类型徽章 / 大小
   - **缩放控件**（PDF）：缩小 / 放大 / 适应宽度
   - **换行开关**（文本）
   - **下载**：下载原文件（兼容原有下载功能）
   - **打印**：打印文档内容（自动隐藏工具栏）

### Markdown 渲染细节

- GitHub Flavored Markdown：表格、任务列表、删除线、围栏代码块
- 代码块：深色主题（github-dark）+ 语言高亮 + 悬浮显示「复制」按钮
- 所有 HTML 输出均经 DOMPurify 清洗

## 卸载

本插件零数据库迁移、零 gem 依赖，卸载即删除目录：

```bash
rm -rf /opt/redmine/plugins/redmine_reader
rm -rf /opt/redmine/public/plugin_assets/redmine_reader
# 重启 Redmine
```

## 架构

```
任意页面 → hook 注入 reader_entry.js
        → 扫描 /attachments/download/:id/:name 白名单链接
        → href 改写为 /reader/:id（原下载地址存 data-download-url）
点击 → ReaderController（visible? 权限校验，403/404）
    → show.html.erb（独立全屏页面 + 元数据 + i18n）
    → reader.js 按格式懒加载 vendor 渲染库
    → fetch 原生附件 URL（Session 鉴权）→ 浏览器端渲染
```

静态资源全部自托管（`assets/javascripts/vendor/`），运行时不依赖外部 CDN。

## 常见问题

### PPTX（或其它格式）预览失败，页面报「无法预览」

优先检查 **部署同步**——插件代码改动后，`public/plugin_assets/` 与
locale 都需要重新同步，否则浏览器会加载到旧版/缺失的脚本：

```bash
cd /opt/redmine
RAILS_ENV=production bundle exec rake redmine:plugins:assets
systemctl restart redmine   # 或您的进程管理方式
```

若同步后仍失败，请打开浏览器开发者工具（Console）确认：

1. 控制台是否出现 `Failed to load resource .../vendor/pptx-preview.min.js`？
   说明该文件未拷贝到 `public/plugin_assets/redmine_reader/`，重复上面的同步命令。
2. 是否出现 `pptxPreview is not defined` / `Cannot read properties of undefined (reading 'init')`？
   说明 `assets/javascripts/vendor/pptx-preview.min.js` 是无效构建（例如被替换成了
   ES Module 格式，而经典 `<script>` 无法解析 `export`）。插件已内置对
   ES Module 构建的动态 `import()` 兜底，若仍失败请用官方 UMD 构建替换该文件：

   ```bash
   cd /opt/redmine/plugins/redmine_reader
   curl -L -o assets/javascripts/vendor/pptx-preview.min.js \
     https://unpkg.com/pptx-preview@1.0.7/dist/pptx-preview.umd.js
   # 重新同步并重启
   cd /opt/redmine && RAILS_ENV=production bundle exec rake redmine:plugins:assets
   systemctl restart redmine
   ```

   官方 UMD 构建（约 1.3 MB）将全局对象暴露为 `window.pptxPreview`，
   与 `reader.js` 中的调用方式一致。

3. 若页面显示 `Translation missing: zh.redmine_reader.back` 之类的字样，
   说明 Redmine 进程还在使用旧版 locale，重启 Redmine 即可。

## 运行测试

在 Redmine 根目录：

```bash
RAILS_ENV=test bundle exec rake redmine:plugins:test TEST=plugins/redmine_reader/test
```

## 许可

GPL-2.0，见 [LICENSE](LICENSE)。内置第三方前端库的许可见 LICENSE 附注。
