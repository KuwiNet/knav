#!/bin/sh
# knav 镜像入口：可选地同步表结构，再启动 Next.js standalone 服务。
set -eu

# 空库首启即可用；已有库只补表补列，不会清空内容（与 scripts/migrate.ts 一致）。
# 想在升级窗口里手动控制迁移时机，容器启动时传 KNAV_MIGRATE=0。
if [ "${KNAV_MIGRATE:-1}" = "1" ]; then
  # 容器里的 127.0.0.1 是它自己，不是宿主机。迁移失败最容易只留下一行 ECONNREFUSED，
  # 所以先把真正生效的库地址打出来。
  if [ -n "${DATABASE_URL:-}" ]; then
    echo "[knav] 同步表结构…（数据库走 DATABASE_URL，host 以串里为准，DB_* 被忽略）"
  else
    echo "[knav] 同步表结构…（数据库 ${DB_HOST:-127.0.0.1}:${DB_PORT:-3307} / ${DB_NAME:-knav_dev}）"
  fi
  if ! node /app/scripts/migrate.cjs; then
    echo "[knav] 迁移失败，未启动服务。检查数据库连接变量，或先用 KNAV_MIGRATE=0 启动排查。" >&2
    echo "[knav] 提示：容器内 127.0.0.1 指向容器自己；宿主机上的 MySQL 用 host.docker.internal" \
      "（Linux 需 --add-host=host.docker.internal:host-gateway）或数据库容器的服务名。" >&2
    exit 1
  fi
fi

# bind mount 的 uploads 目录常是 root 属主，而容器以 node（uid 1000）运行，
# 这时上传与图片本地化会失败；只告警不退出，纯只读挂载的站照样能起。
if [ ! -w /app/public/uploads ]; then
  echo "[knav] 警告：/app/public/uploads 不可写，上传和图片本地化会失败；请把它交给运行用户（chown -R 1000:1000）" >&2
fi

exec "$@"
