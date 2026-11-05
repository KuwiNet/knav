#!/bin/sh
# knav 镜像入口：可选地同步表结构，再启动 Next.js standalone 服务。
set -eu

# 空库首启即可用；已有库只补表补列，不会清空内容（与 scripts/migrate.ts 一致）。
# 想在升级窗口里手动控制迁移时机，容器启动时传 KNAV_MIGRATE=0。
if [ "${KNAV_MIGRATE:-1}" = "1" ]; then
  echo "[knav] 同步表结构…"
  if ! node /app/scripts/migrate.cjs; then
    echo "[knav] 迁移失败，未启动服务。检查数据库连接变量，或先用 KNAV_MIGRATE=0 启动排查。" >&2
    exit 1
  fi
fi

# bind mount 的 uploads 目录常是 root 属主，而容器以 node（uid 1000）运行，
# 这时上传与图片本地化会失败；只告警不退出，纯只读挂载的站照样能起。
if [ ! -w /app/public/uploads ]; then
  echo "[knav] 警告：/app/public/uploads 不可写，上传和图片本地化会失败；请把它交给运行用户（chown -R 1000:1000）" >&2
fi

exec "$@"
