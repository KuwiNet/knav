#!/usr/bin/env bash
#
# knav 一键安装：应用 + 数据库都跑在 Docker 里，端口直接对外，装完就能访问。
#
#   curl -fsSL https://raw.githubusercontent.com/KuwiNet/knav/main/docker/install.sh | sudo bash
#
# 需要参数时用环境变量（管道执行没法带命令行参数）：
#   curl -fsSL .../install.sh | sudo KNAV_DB=mariadb KNAV_PORT=8080 bash
#
# 做的事：检查 Docker → 下载 compose 文件 → 生成 .env（随机密码、探测站点地址）
#   → 拉镜像 → 起服务 → 等健康并回取一次 CSS → 打印本机/内网/公网访问地址与站长口令。
# 不做的事：不装 Docker、不改宿主数据库、不删任何已有容器。

set -euo pipefail

KNAV_DIR="${KNAV_DIR:-/opt/knav}"
KNAV_PORT="${KNAV_PORT:-3000}"
KNAV_DB="${KNAV_DB:-mysql}"                      # mysql | mariadb
KNAV_REF="${KNAV_REF:-main}"                      # 下载 compose 文件的分支或 tag
KNAV_IMAGE="${KNAV_IMAGE:-kuwinet/knav:latest}"   # 镜像仓库地址；本地构建的镜像改成 knav:local
KNAV_ADMIN_USER="${KNAV_ADMIN_USER:-admin}"
KNAV_ADMIN_EMAIL="${KNAV_ADMIN_EMAIL:-}"
KNAV_SITE_URL="${KNAV_SITE_URL:-}"
KNAV_FORCE="${KNAV_FORCE:-0}"                     # 1=重新生成 .env（会换掉数据库口令，已建好的库不会跟着改）

log() { printf '\033[1;36m[knav]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[knav] 停止：\033[0m %s\n' "$*" >&2; exit 1; }

# 非 root 时自动用 sudo 重跑一次。curl | bash 这种管道执行方式里 $0 不是文件，
# 没法重跑，只能提示改用 sudo bash（脚本本身对执行用户没有要求）
if [ "$(id -u)" -ne 0 ]; then
  if [ -f "$0" ] && command -v sudo >/dev/null 2>&1; then
    exec sudo KNAV_DIR="$KNAV_DIR" KNAV_PORT="$KNAV_PORT" KNAV_DB="$KNAV_DB" KNAV_REF="$KNAV_REF" \
      KNAV_IMAGE="$KNAV_IMAGE" KNAV_ADMIN_USER="$KNAV_ADMIN_USER" KNAV_ADMIN_EMAIL="$KNAV_ADMIN_EMAIL" \
      KNAV_SITE_URL="$KNAV_SITE_URL" KNAV_FORCE="$KNAV_FORCE" bash "$0" "$@"
  fi
  die "需要 root：sudo bash install.sh，或 curl -fsSL <地址> | sudo bash"
fi

case "$KNAV_DB" in
  mysql)   DB_FILE=compose.mysql.yaml;   DB_VOL=knav_mysqldata ;;
  mariadb) DB_FILE=compose.mariadb.yaml; DB_VOL=knav_mariadbdata ;;
  *) die "KNAV_DB 只能是 mysql 或 mariadb（当前：$KNAV_DB）" ;;
esac

command -v docker >/dev/null 2>&1 || die "没找到 docker。先装 Docker：curl -fsSL https://get.docker.com | sh"
docker info >/dev/null 2>&1 || die "docker 守护进程不可用（服务没起，或当前用户没权限）：systemctl start docker"
docker compose version >/dev/null 2>&1 || die "缺 Docker Compose v2（docker compose 子命令）。装 Docker 时自带，单独装见 docs.docker.com/compose"

# 端口占用与同名容器提前拦下来，别等到 compose 报半截错
if docker ps -a --format '{{.Names}}' | grep -qx knav; then
  die "已存在名为 knav 的容器（多半是 docker run 起的）。先删掉再装：docker rm -f knav"
fi
if ss -lnt 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$KNAV_PORT\$"; then
  die "端口 $KNAV_PORT 已被占用：ss -lntp | grep ':$KNAV_PORT'。换端口：KNAV_PORT=8080 重跑"
fi

mkdir -p "$KNAV_DIR"
cd "$KNAV_DIR"

RAW="https://raw.githubusercontent.com/KuwiNet/knav/$KNAV_REF"
for f in compose.yaml "$DB_FILE"; do
  log "下载 $f"
  curl -fsSL --retry 3 -o "$f" "$RAW/$f" || die "下载 $RAW/$f 失败：检查网络，或改用 KNAV_REF=v0.1.4 指定已发布的 tag"
  [ -s "$f" ] || die "$f 下载后是空的"
done

ENV_FILE="$KNAV_DIR/.env"
ADMIN_PASSWORD=""
PW_FRESH=0

# 内网地址：默认路由的 src 最可靠（多网卡时它就是对外那张卡），拿不到就退到第一个全局 IPv4
lan_ip() { ip -4 route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p' | head -1; }
lan_ip_fallback() { ip -4 -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -1; }
# 公网出口地址：任一探测服务返回 IPv4 即算，全失败（内网无出口/探测被墙）就返回空。
# 三个服务各 3 秒上限，所以断外网的机器最多慢 9 秒，不会挂住。
public_ip() {
  local u v
  for u in https://ifconfig.me/ip https://api.ipify.org https://ipinfo.io/ip; do
    v="$(curl -fsS -m 3 "$u" 2>/dev/null | grep -oE '([0-9]{1,3}\.){3}[0-9]{1,3}' | head -1 || true)"
    # 回环/私网/链路本地一律不算公网：NAT 后面探测到的往往就是内网地址，拿去当站点地址会骗人
    case "$v" in
      '' | 127.* | 10.* | 169.254.* | 192.168.* | 172.1[6-9].* | 172.2[0-9].* | 172.3[01].*) continue ;;
      *) printf '%s' "$v"; return 0 ;;
    esac
  done
  return 0
}
# 三个探测都要 || true：set -o pipefail 下，ip 命令缺失或没默认路由会让赋值本身失败，
# 脚本会在「装完并已通过健康检查」的位置直接退出（旧版结尾那行就是这么炸的）
LAN_IP="$(lan_ip || true)"
[ -n "$LAN_IP" ] || LAN_IP="$(lan_ip_fallback || true)"
PUB_IP="$(public_ip || true)"

# 沿用旧配置时这些值要从 .env 里读回来，否则结尾打印的是空
env_get() { sed -n "s/^$1=//p" "$ENV_FILE" | head -1; }
if [ -f "$ENV_FILE" ] && [ "$KNAV_FORCE" != "1" ]; then
  log "沿用已有 $ENV_FILE（要重新生成：KNAV_FORCE=1）"
  ADMIN_PASSWORD="$(env_get ADMIN_PASSWORD)"
  [ -n "$KNAV_SITE_URL" ] || KNAV_SITE_URL="$(env_get SITE_URL)"
  KNAV_ADMIN_EMAIL="$(env_get ADMIN_EMAIL)"
  SMTP_HOST_NOW="$(env_get SMTP_HOST)"
else
  PW_FRESH=1
  SMTP_HOST_NOW=""
  # MYSQL_* 建号口令只在数据卷为空的第一次初始化生效，卷还在就只是改了张纸
  if docker volume inspect "$DB_VOL" >/dev/null 2>&1; then
    log "注意：数据卷 $DB_VOL 已存在，新密码不会写进已经建好的库。真要从零装先删卷：docker volume rm $DB_VOL"
  fi
  gen_pw() { # 十六进制：不含 $ & ! # 空格，避开 .env 与 compose 插值的所有坑
    if command -v openssl >/dev/null 2>&1; then openssl rand -hex 16
    else od -An -tx1 -N16 /dev/urandom | tr -d ' \n'; fi
  }
  if [ -z "$KNAV_SITE_URL" ]; then
    # 站点地址优先公网，其次内网，都没有就退回环；探测不到绝不能拼出 http://:3000
    SITE_IP="${PUB_IP:-${LAN_IP:-127.0.0.1}}"
    KNAV_SITE_URL="http://$SITE_IP:$KNAV_PORT"
  fi
  ADMIN_PASSWORD="$(gen_pw)"

  umask 077
  cat >"$ENV_FILE" <<EOF
# 由 docker/install.sh 生成于 $(date '+%F %T')。权限 0600，别提交到 git、别贴进工单。
# 改了这里的值要重新执行：docker compose -f compose.yaml -f $DB_FILE up -d

PORT=$KNAV_PORT
KNAV_IMAGE=$KNAV_IMAGE

# 数据库（跑在同一个 compose 网络里，DB_HOST 就是服务名 db）
DB_HOST=db
DB_PORT=3306
DB_USER=knav
DB_PASS=$(gen_pw)
DB_NAME=knav
MYSQL_ROOT_PASSWORD=$(gen_pw)

# 站点地址：外发邮件里的验证/找回密码链接、OG 图、sitemap、OAuth 回调都以它为准
# 安装时按「公网 > 内网 > 127.0.0.1」探测；后台「站点设置 → 站点地址」里存过值就以数据库为准，这里会被忽略
SITE_URL=$KNAV_SITE_URL

# 首次建库时创建站长；已有站长后不会再改。登录后台请立即换密码
ADMIN_USERNAME=$KNAV_ADMIN_USER
ADMIN_PASSWORD=$ADMIN_PASSWORD
ADMIN_EMAIL=$KNAV_ADMIN_EMAIL

# 邮件：留空则不发信，只写进后台的通知日志
SMTP_HOST=
SMTP_PORT=465
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
SMTP_FROM_NAME=knav
EOF
  chmod 600 "$ENV_FILE"
  log "已生成 $ENV_FILE（数据库口令随机、权限 0600）"
fi

COMPOSE="docker compose -f $KNAV_DIR/compose.yaml -f $KNAV_DIR/$DB_FILE"

if docker image inspect "$KNAV_IMAGE" >/dev/null 2>&1; then
  log "本机已有 $KNAV_IMAGE，跳过拉取"
else
  log "拉取镜像（$KNAV_IMAGE + $KNAV_DB）"
  $COMPOSE pull || die "拉镜像失败：仓库里还没有这个 tag 就改用本地构建的镜像（KNAV_IMAGE=knav:local，见 docs/docker.md 第 3 节）"
fi

log "启动服务（首次建库会跑迁移，约 1 分钟）"
$COMPOSE up -d

log "等待 /api/health …"
ok=0
for _ in $(seq 1 60); do
  if curl -fsS -m 3 "http://127.0.0.1:$KNAV_PORT/api/health" >/dev/null 2>&1; then ok=1; break; fi
  sleep 2
done
[ "$ok" = 1 ] || { $COMPOSE logs --tail 40; die "健康检查超时，上面是容器日志"; }

# 首页 200 不代表样式在：standalone 的 static 挂错目录时只有 /_next/static/** 会 404
CSS="$(curl -fsS -m 5 "http://127.0.0.1:$KNAV_PORT/" | grep -o '/_next/static/css/[^"]*' | head -1 || true)"
if [ -n "$CSS" ]; then
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$KNAV_PORT$CSS" || true)"
  [ "$code" = 200 ] || die "样式文件 $CSS 返回 ${code:-无响应}，镜像里的 static 目录不对，见 docs/docker.md 第 9 节"
fi

printf '\n\033[1;32m✓ knav 已就绪\033[0m\n'
echo "  本机访问   http://127.0.0.1:$KNAV_PORT"
if [ -n "$PUB_IP" ]; then
  # 有公网出口就两条都列出来；公网地址能不能从外面进来还取决于路由/云安全组，这里提示一句
  echo "  访问地址   http://${LAN_IP:-$PUB_IP}:$KNAV_PORT      （内网）"
  echo "             http://$PUB_IP:$KNAV_PORT      （公网；需已把 $KNAV_PORT 放行或映射到本机）"
elif [ -n "$LAN_IP" ]; then
  echo "  访问地址   http://$LAN_IP:$KNAV_PORT      （内网）"
fi
echo "  站点地址   $KNAV_SITE_URL   （公网优先，没有用内网；后台「站点设置 → 基础信息」可覆盖）"
echo "  站长账号   $KNAV_ADMIN_USER"
if [ "$PW_FRESH" = 1 ]; then
  echo "  初始密码   $ADMIN_PASSWORD   ← 只打印这一次，登录后立刻改掉"
elif [ -n "$ADMIN_PASSWORD" ]; then
  echo "  站长密码   $ADMIN_PASSWORD   ← 沿用 $ENV_FILE 里的旧口令，本次没有重置"
else
  echo "  站长密码   $ENV_FILE 里 ADMIN_PASSWORD 为空，未自动建号（用 create-admin.ts 或后台建）"
fi
echo
echo "  日常操作   cd $KNAV_DIR"
echo "             $COMPOSE ps            # 状态"
echo "             $COMPOSE logs -f knav  # 日志"
echo "             $COMPOSE restart       # 重启（改 .env 要用 up -d 才会重读）"
echo "  备份恢复   docs/docker.md 第 8 节；数据库口令在 $ENV_FILE"
if [ -z "$SMTP_HOST_NOW" ]; then
  echo "  待办       SMTP_HOST 还没配：找回密码邮件发不出去，后台「站点设置 → 邮件（SMTP）」填完即可（内网站可忽略）"
fi
