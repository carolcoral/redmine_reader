#!/usr/bin/env bash
# ============================================================
# CodeBuddy 记忆体恢复脚本
# 用途：在 CNB 云原生开发环境重建后，从 Git 仓库恢复
#       CodeBuddy 记忆体（自动化任务、规则等）到本地目录
# 用法：bash .codebuddy/restore.sh
# ============================================================
set -euo pipefail

WORKSPACE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CB_HOME="${HOME}/.codebuddy"
SRC_AUTOMATIONS="${WORKSPACE}/.codebuddy/automations"
DST_AUTOMATIONS="${CB_HOME}/automations"

echo "[1/3] 检查记忆库文件..."
[ -f "${WORKSPACE}/.codebuddy/rules/project-memory.md" ] && echo "  ✓ project-memory.md 存在" || echo "  ✗ project-memory.md 缺失"

echo "[2/3] 恢复自动化任务..."
if [ -d "${SRC_AUTOMATIONS}" ]; then
  mkdir -p "${DST_AUTOMATIONS}"
  # 注意：同步已有自动化目录（新增/更新，不删除远端已有的其他自动化）
  cp -rn "${SRC_AUTOMATIONS}"/. "${DST_AUTOMATIONS}"/
  echo "  ✓ 已恢复自动化配置:"
  find "${SRC_AUTOMATIONS}" -name "*.toml" -printf "    %p\n"
else
  echo "  - 仓库中无自动化配置备份"
fi

echo "[3/3] 检查本地自动化是否已生效..."
for f in "${DST_AUTOMATIONS}"/*/automation.toml; do
  [ -f "$f" ] || continue
  name="$(grep -m1 '^name' "$f" || echo "?")"
  echo "  ✓ $f  ->  $name"
done

echo ""
echo "完成。记忆体已从仓库恢复。新产生的记忆会由自动化任务持续写入"
echo "  ${WORKSPACE}/.codebuddy/rules/project-memory.md"
echo "并通过 Git 提交实现跨环境持久化。"
